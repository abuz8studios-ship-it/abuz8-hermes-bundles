'use strict'

const fs = require('node:fs')
const path = require('node:path')

const SCHEMA_VERSION = 1
const CAPABILITIES = Object.freeze([
  'text',
  'vision',
  'voiceInput',
  'voiceOutput',
  'tools',
  'memory',
  'gpu',
  'speculative',
  'mtp',
  'prefill',
  'tokenizer'
])
const ADAPTERS = Object.freeze(['llama.cpp-local', 'openai-compatible', 'hosted-metadata'])
const MANIFEST_KEYS = Object.freeze(['schemaVersion', 'id', 'name', 'version', 'adapter', 'provider', 'models', 'capabilities', 'config'])
const PROVIDER_KEYS = Object.freeze(['id', 'name', 'kind'])
const MODEL_KEYS = Object.freeze(['id', 'name', 'contextWindow', 'capabilities'])
const CONFIG_KEYS = Object.freeze(['endpoint', 'executablePath', 'resource'])
const SECRET_KEY = /(api.?key|token|secret|password|credential)/i

class InferenceRegistryError extends Error {
  constructor(message, code = 'REGISTRY_ERROR', details = undefined) {
    super(message)
    this.name = 'InferenceRegistryError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

function fail(message, code, details) {
  throw new InferenceRegistryError(message, code, details)
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertObject(value, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`, 'INVALID_MANIFEST')
}

function assertKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${label} contains unsupported field "${key}"`, 'INVALID_MANIFEST')
    if (SECRET_KEY.test(key)) fail(`${label} cannot contain credential fields`, 'SECRET_IN_MANIFEST')
  }
}

function assertString(value, label, { pattern } = {}) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`, 'INVALID_MANIFEST')
  if (pattern && !pattern.test(value)) fail(`${label} has an invalid format`, 'INVALID_MANIFEST')
  return value.trim()
}

function assertBooleanMap(value, label) {
  assertObject(value, label)
  for (const key of Object.keys(value)) {
    if (!CAPABILITIES.includes(key)) fail(`${label}.${key} is not a supported capability`, 'INVALID_CAPABILITY')
    if (typeof value[key] !== 'boolean') fail(`${label}.${key} must be boolean`, 'INVALID_CAPABILITY')
  }
  return Object.fromEntries(CAPABILITIES.map((key) => [key, value[key] === true]))
}

function validateCapabilities(requested) {
  if (requested === undefined) return {}
  assertObject(requested, 'requested capabilities')
  const normalized = {}
  for (const key of Object.keys(requested)) {
    if (!CAPABILITIES.includes(key)) fail(`requested capabilities contains unsupported "${key}"`, 'INVALID_CAPABILITY')
    if (requested[key] !== true) fail(`requested capability "${key}" must be true`, 'INVALID_CAPABILITY')
    normalized[key] = true
  }
  return normalized
}

function validateManifest(input) {
  assertObject(input, 'manifest')
  assertKeys(input, MANIFEST_KEYS, 'manifest')
  if (input.schemaVersion !== SCHEMA_VERSION) {
    fail(`manifest schemaVersion must be ${SCHEMA_VERSION}`, 'UNSUPPORTED_SCHEMA')
  }
  const id = assertString(input.id, 'manifest.id', { pattern: /^[a-z0-9][a-z0-9._-]{1,63}$/ })
  const name = assertString(input.name, 'manifest.name')
  const version = assertString(input.version, 'manifest.version', { pattern: /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/ })
  if (!ADAPTERS.includes(input.adapter)) fail(`manifest.adapter must be one of: ${ADAPTERS.join(', ')}`, 'INVALID_ADAPTER')

  assertObject(input.provider, 'manifest.provider')
  assertKeys(input.provider, PROVIDER_KEYS, 'manifest.provider')
  const provider = {
    id: assertString(input.provider.id, 'manifest.provider.id', { pattern: /^[a-z0-9][a-z0-9._-]{1,63}$/ }),
    name: assertString(input.provider.name, 'manifest.provider.name'),
    kind: input.provider.kind
  }
  if (!['local', 'hosted'].includes(provider.kind)) fail('manifest.provider.kind must be "local" or "hosted"', 'INVALID_MANIFEST')

  if (!Array.isArray(input.models) || input.models.length === 0) fail('manifest.models must contain at least one model', 'INVALID_MANIFEST')
  const seenModels = new Set()
  const models = input.models.map((model, index) => {
    assertObject(model, `manifest.models[${index}]`)
    assertKeys(model, MODEL_KEYS, `manifest.models[${index}]`)
    const modelId = assertString(model.id, `manifest.models[${index}].id`, { pattern: /^[^/\\\s]{1,128}$/ })
    if (seenModels.has(modelId)) fail(`manifest.models contains duplicate id "${modelId}"`, 'INVALID_MANIFEST')
    seenModels.add(modelId)
    const normalized = { id: modelId, name: assertString(model.name, `manifest.models[${index}].name`) }
    if (model.contextWindow !== undefined) {
      if (!Number.isInteger(model.contextWindow) || model.contextWindow < 1) fail(`manifest.models[${index}].contextWindow must be a positive integer`, 'INVALID_MANIFEST')
      normalized.contextWindow = model.contextWindow
    }
    if (model.capabilities !== undefined) normalized.capabilities = assertBooleanMap(model.capabilities, `manifest.models[${index}].capabilities`)
    return normalized
  })

  const capabilities = assertBooleanMap(input.capabilities, 'manifest.capabilities')
  if (capabilities.text !== true) fail('manifest.capabilities.text must be true for an inference backend', 'INVALID_CAPABILITY')

  assertObject(input.config, 'manifest.config')
  assertKeys(input.config, CONFIG_KEYS, 'manifest.config')
  const config = {}
  if (input.config.endpoint !== undefined) {
    const endpoint = assertString(input.config.endpoint, 'manifest.config.endpoint')
    let url
    try { url = new URL(endpoint) } catch { fail('manifest.config.endpoint must be a valid URL', 'INVALID_MANIFEST') }
    if (!['http:', 'https:'].includes(url.protocol)) fail('manifest.config.endpoint must use http or https', 'INVALID_MANIFEST')
    config.endpoint = endpoint.replace(/\/+$/, '')
  }
  if (input.config.executablePath !== undefined) {
    const executablePath = assertString(input.config.executablePath, 'manifest.config.executablePath')
    if (!path.isAbsolute(executablePath)) fail('manifest.config.executablePath must be absolute', 'INVALID_MANIFEST')
    config.executablePath = executablePath
  }
  if (input.config.resource !== undefined) config.resource = assertString(input.config.resource, 'manifest.config.resource')
  if (input.adapter === 'openai-compatible' && !config.endpoint) fail('openai-compatible adapters require config.endpoint', 'INVALID_MANIFEST')
  if (input.adapter === 'llama.cpp-local' && !config.endpoint && !config.executablePath && !config.resource) {
    fail('llama.cpp-local adapters require config.endpoint, config.executablePath, or config.resource', 'INVALID_MANIFEST')
  }
  if (input.adapter === 'hosted-metadata' && provider.kind !== 'hosted') {
    fail('hosted-metadata adapters require a hosted provider', 'INVALID_MANIFEST')
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    version,
    adapter: input.adapter,
    provider,
    models,
    capabilities,
    config
  }
}

function assertSupportedCapabilities(manifest, requested) {
  const normalized = validateCapabilities(requested)
  const unsupported = Object.keys(normalized).filter((key) => manifest.capabilities[key] !== true)
  if (unsupported.length) {
    fail(`${manifest.name} does not support: ${unsupported.join(', ')}`, 'UNSUPPORTED_CAPABILITY', { unsupported })
  }
  return { ok: true, requested: normalized }
}

function builtinManifests({ llamaEndpoint = 'http://127.0.0.1:5118/v1' } = {}) {
  return [
    validateManifest({
      schemaVersion: SCHEMA_VERSION,
      id: 'builtin-llama-cpp',
      name: 'llama.cpp local',
      version: '1.0.0',
      adapter: 'llama.cpp-local',
      provider: { id: 'local', name: 'Local llama.cpp', kind: 'local' },
      models: [{ id: 'local', name: 'Selected local model' }],
      capabilities: { text: true, gpu: true, tools: false, vision: false, voiceInput: false, voiceOutput: false, memory: false, speculative: false, mtp: false, prefill: false, tokenizer: false },
      config: { endpoint: llamaEndpoint, resource: 'app-local-engine' }
    }),
    validateManifest({
      schemaVersion: SCHEMA_VERSION,
      id: 'builtin-openai-compatible',
      name: 'OpenAI-compatible endpoint',
      version: '1.0.0',
      adapter: 'openai-compatible',
      provider: { id: 'openai-compatible', name: 'OpenAI-compatible provider', kind: 'hosted' },
      models: [{ id: 'configured', name: 'Provider-selected model' }],
      capabilities: { text: true, tools: true, vision: false, voiceInput: false, voiceOutput: false, memory: false, gpu: false, speculative: false, mtp: false, prefill: false, tokenizer: false },
      config: { endpoint: 'http://127.0.0.1:8000/v1' }
    }),
    validateManifest({
      schemaVersion: SCHEMA_VERSION,
      id: 'builtin-hosted-metadata',
      name: 'Hosted provider metadata',
      version: '1.0.0',
      adapter: 'hosted-metadata',
      provider: { id: 'hosted', name: 'Hosted provider', kind: 'hosted' },
      models: [{ id: 'configured', name: 'Provider-selected model' }],
      capabilities: { text: true, tools: false, vision: false, voiceInput: false, voiceOutput: false, memory: false, gpu: false, speculative: false, mtp: false, prefill: false, tokenizer: false },
      config: {}
    })
  ]
}

class InferenceRegistry {
  constructor({ userDataDir, builtins = builtinManifests() } = {}) {
    if (!userDataDir || typeof userDataDir !== 'string') fail('userDataDir is required', 'INVALID_REGISTRY')
    this.userDataDir = path.resolve(userDataDir)
    this.statePath = path.join(this.userDataDir, 'inference-registry.json')
    this.builtins = builtins.map(validateManifest)
    this.builtinIds = new Set(this.builtins.map((manifest) => manifest.id))
    this.state = this.#load()
  }

  #load() {
    if (!fs.existsSync(this.statePath)) return { schemaVersion: SCHEMA_VERSION, installed: [], enabled: {}, activeAdapterId: null, selectedModels: {} }
    let raw
    try { raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) } catch (error) {
      fail(`cannot read inference registry: ${error.message}`, 'REGISTRY_CORRUPT')
    }
    assertObject(raw, 'registry state')
    if (raw.schemaVersion !== SCHEMA_VERSION) fail(`registry schemaVersion must be ${SCHEMA_VERSION}`, 'REGISTRY_CORRUPT')
    if (!Array.isArray(raw.installed)) fail('registry installed must be an array', 'REGISTRY_CORRUPT')
    const installed = raw.installed.map(validateManifest)
    const ids = new Set()
    for (const manifest of installed) {
      if (this.builtinIds.has(manifest.id) || ids.has(manifest.id)) fail(`registry contains duplicate adapter "${manifest.id}"`, 'REGISTRY_CORRUPT')
      ids.add(manifest.id)
    }
    if (raw.enabled !== undefined) assertObject(raw.enabled, 'registry.enabled')
    const enabled = {}
    for (const [id, value] of Object.entries(raw.enabled || {})) {
      if (![...this.builtinIds, ...ids].includes(id)) fail(`registry.enabled contains unknown adapter "${id}"`, 'REGISTRY_CORRUPT')
      if (typeof value !== 'boolean') fail(`registry.enabled.${id} must be boolean`, 'REGISTRY_CORRUPT')
    }
    for (const id of [...this.builtinIds, ...ids]) enabled[id] = raw.enabled?.[id] !== false
    const activeAdapterId = raw.activeAdapterId === null ? null : assertString(raw.activeAdapterId, 'registry.activeAdapterId')
    if (activeAdapterId !== null && ![...this.builtinIds, ...ids].includes(activeAdapterId)) {
      fail(`registry.activeAdapterId references unknown adapter "${activeAdapterId}"`, 'REGISTRY_CORRUPT')
    }
    if (raw.selectedModels !== undefined) assertObject(raw.selectedModels, 'registry.selectedModels')
    const selectedModels = {}
    for (const [adapterId, modelId] of Object.entries(raw.selectedModels || {})) {
      if (![...this.builtinIds, ...ids].includes(adapterId)) fail(`registry.selectedModels references unknown adapter "${adapterId}"`, 'REGISTRY_CORRUPT')
      selectedModels[adapterId] = assertString(modelId, `registry.selectedModels.${adapterId}`)
    }
    return { schemaVersion: SCHEMA_VERSION, installed, enabled, activeAdapterId, selectedModels }
  }

  #save() {
    fs.mkdirSync(this.userDataDir, { recursive: true })
    const tmpPath = `${this.statePath}.tmp`
    fs.writeFileSync(tmpPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8')
    fs.renameSync(tmpPath, this.statePath)
  }

  #manifest(id) {
    const manifest = [...this.builtins, ...this.state.installed].find((entry) => entry.id === id)
    if (!manifest) fail(`unknown adapter "${id}"`, 'UNKNOWN_ADAPTER')
    return manifest
  }

  list() {
    return {
      schemaVersion: SCHEMA_VERSION,
      activeAdapterId: this.state.activeAdapterId,
      selectedModels: { ...this.state.selectedModels },
      adapters: [...this.builtins.map((manifest) => ({ manifest, builtin: true })), ...this.state.installed.map((manifest) => ({ manifest, builtin: false }))]
        .map(({ manifest, builtin }) => ({
          ...manifest,
          builtin,
          enabled: this.state.enabled[manifest.id] !== false,
          active: this.state.activeAdapterId === manifest.id,
          selectedModelId: this.state.selectedModels[manifest.id] || null,
          validation: { ok: true, errors: [] }
        }))
    }
  }

  installFromPath(manifestPath) {
    if (typeof manifestPath !== 'string' || !path.isAbsolute(manifestPath)) fail('manifestPath must be an absolute local path', 'INVALID_PATH')
    let input
    try { input = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch (error) {
      fail(`cannot read manifest: ${error.message}`, 'INVALID_MANIFEST')
    }
    const manifest = validateManifest(input)
    if (this.builtinIds.has(manifest.id) || this.state.installed.some((entry) => entry.id === manifest.id)) {
      fail(`adapter "${manifest.id}" is already installed`, 'DUPLICATE_ADAPTER')
    }
    this.state.installed.push(manifest)
    this.state.enabled[manifest.id] = true
    this.#save()
    return this.get(manifest.id)
  }

  get(id) {
    const manifest = this.#manifest(id)
    return {
      ...manifest,
      builtin: this.builtinIds.has(id),
      enabled: this.state.enabled[id] !== false,
      active: this.state.activeAdapterId === id,
      selectedModelId: this.state.selectedModels[id] || null,
      validation: { ok: true, errors: [] }
    }
  }

  activeRoute() {
    const id = this.state.activeAdapterId || this.builtins[0]?.id || null
    if (!id) fail('no inference adapter is available', 'NO_ADAPTER')
    const adapter = this.#manifest(id)
    if (this.state.enabled[id] === false) fail(`adapter "${id}" is disabled`, 'ADAPTER_DISABLED')
    const selectedModelId = this.state.selectedModels[id] || adapter.models[0]?.id || null
    if (!selectedModelId || !adapter.models.some((model) => model.id === selectedModelId)) {
      fail(`adapter "${id}" has no valid selected model`, 'NO_MODEL')
    }
    return {
      adapterId: adapter.id,
      adapter: adapter.adapter,
      endpoint: adapter.config.endpoint || null,
      executablePath: adapter.config.executablePath || null,
      resource: adapter.config.resource || null,
      modelId: selectedModelId,
      capabilities: { ...adapter.capabilities }
    }
  }

  setEnabled(id, enabled) {
    this.#manifest(id)
    if (typeof enabled !== 'boolean') fail('enabled must be boolean', 'INVALID_ARGUMENT')
    this.state.enabled[id] = enabled
    if (!enabled && this.state.activeAdapterId === id) this.state.activeAdapterId = null
    this.#save()
    return this.list()
  }

  selectAdapter(id) {
    const manifest = this.#manifest(id)
    if (this.state.enabled[id] === false) fail(`adapter "${id}" is disabled`, 'ADAPTER_DISABLED')
    this.state.activeAdapterId = manifest.id
    this.#save()
    return this.list()
  }

  selectModel(adapterId, modelId) {
    const manifest = this.#manifest(adapterId)
    if (this.state.enabled[adapterId] === false) fail(`adapter "${adapterId}" is disabled`, 'ADAPTER_DISABLED')
    if (!manifest.models.some((model) => model.id === modelId)) fail(`unknown model "${modelId}" for adapter "${adapterId}"`, 'UNKNOWN_MODEL')
    this.state.selectedModels[adapterId] = assertString(modelId, 'modelId')
    this.#save()
    return this.list()
  }

  validate(adapterId, requestedCapabilities) {
    const manifest = this.#manifest(adapterId)
    const requested = validateCapabilities(requestedCapabilities)
    const unsupported = Object.keys(requested).filter((key) => manifest.capabilities[key] !== true)
    return { ok: unsupported.length === 0, adapterId, requested, unsupported, message: unsupported.length ? `Unsupported capabilities: ${unsupported.join(', ')}` : null }
  }

  assertCapabilities(adapterId, requestedCapabilities) {
    return assertSupportedCapabilities(this.#manifest(adapterId), requestedCapabilities)
  }

  remove(id) {
    if (this.builtinIds.has(id)) fail(`built-in adapter "${id}" cannot be removed`, 'BUILTIN_IMMUTABLE')
    const index = this.state.installed.findIndex((manifest) => manifest.id === id)
    if (index < 0) fail(`unknown adapter "${id}"`, 'UNKNOWN_ADAPTER')
    this.state.installed.splice(index, 1)
    delete this.state.enabled[id]
    delete this.state.selectedModels[id]
    if (this.state.activeAdapterId === id) this.state.activeAdapterId = null
    this.#save()
    return this.list()
  }
}

module.exports = {
  ADAPTERS,
  CAPABILITIES,
  InferenceRegistry,
  InferenceRegistryError,
  SCHEMA_VERSION,
  assertSupportedCapabilities,
  builtinManifests,
  validateCapabilities,
  validateManifest
}
