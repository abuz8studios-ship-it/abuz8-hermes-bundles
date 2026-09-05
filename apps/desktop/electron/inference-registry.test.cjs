'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
  InferenceRegistry,
  InferenceRegistryError,
  validateManifest
} = require('./inference-registry.cjs')

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'user-endpoint',
    name: 'User endpoint',
    version: '1.0.0',
    adapter: 'openai-compatible',
    provider: { id: 'user-provider', name: 'User provider', kind: 'hosted' },
    models: [{ id: 'model-a', name: 'Model A' }],
    capabilities: { text: true, tools: true },
    config: { endpoint: 'http://127.0.0.1:9000/v1' },
    ...overrides
  }
}

function withRegistry(callback) {
  const dir = fs.mkdtempSync(path.join(__dirname, '.inference-registry-'))
  try {
    return callback(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('validates the versioned manifest and rejects secrets', () => {
  assert.equal(validateManifest(manifest()).schemaVersion, 1)
  assert.throws(
    () => validateManifest({ ...manifest(), apiKey: 'never-store-this' }),
    (error) => error instanceof InferenceRegistryError && error.code === 'INVALID_MANIFEST'
  )
  assert.throws(
    () => validateManifest({ ...manifest(), capabilities: { text: true, quantum: true } }),
    (error) => error.code === 'INVALID_CAPABILITY'
  )
})

test('installs local manifests and persists only registry state', () => withRegistry((dir) => {
  const source = path.join(dir, 'manifest.json')
  fs.writeFileSync(source, JSON.stringify(manifest()))
  const registry = new InferenceRegistry({ userDataDir: path.join(dir, 'user-data') })
  registry.installFromPath(source)
  const listed = registry.list()
  assert.equal(listed.adapters.some((entry) => entry.id === 'user-endpoint' && !entry.builtin), true)
  assert.equal(fs.existsSync(path.join(dir, 'user-data', 'inference-registry.json')), true)
  assert.equal(fs.existsSync(path.join(dir, 'user-data', 'manifest.json')), false)
}))

test('keeps adapter selection separate from model selection and enforces lifecycle', () => withRegistry((dir) => {
  const source = path.join(dir, 'manifest.json')
  fs.writeFileSync(source, JSON.stringify(manifest()))
  const registry = new InferenceRegistry({ userDataDir: path.join(dir, 'user-data') })
  registry.installFromPath(source)
  registry.selectModel('user-endpoint', 'model-a')
  registry.selectAdapter('user-endpoint')
  assert.equal(registry.list().activeAdapterId, 'user-endpoint')
  assert.equal(registry.list().selectedModels['user-endpoint'], 'model-a')
  registry.setEnabled('user-endpoint', false)
  assert.equal(registry.list().activeAdapterId, null)
  assert.throws(() => registry.selectAdapter('user-endpoint'), (error) => error.code === 'ADAPTER_DISABLED')
  assert.throws(() => registry.remove('builtin-llama-cpp'), (error) => error.code === 'BUILTIN_IMMUTABLE')
  registry.setEnabled('user-endpoint', true)
  registry.remove('user-endpoint')
  assert.equal(registry.list().adapters.some((entry) => entry.id === 'user-endpoint'), false)
}))

test('reports and rejects unsupported capabilities instead of ignoring them', () => withRegistry((dir) => {
  const registry = new InferenceRegistry({ userDataDir: path.join(dir, 'user-data') })
  const result = registry.validate('builtin-llama-cpp', { text: true, vision: true, speculative: true })
  assert.deepEqual(result.unsupported, ['vision', 'speculative'])
  assert.equal(result.ok, false)
  assert.throws(() => registry.assertCapabilities('builtin-llama-cpp', { vision: true }), (error) => error.code === 'UNSUPPORTED_CAPABILITY')
}))

test('returns the normalized active route contract', () => withRegistry((dir) => {
  const source = path.join(dir, 'manifest.json')
  fs.writeFileSync(source, JSON.stringify(manifest()))
  const registry = new InferenceRegistry({ userDataDir: path.join(dir, 'user-data') })
  registry.installFromPath(source)
  registry.selectModel('user-endpoint', 'model-a')
  registry.selectAdapter('user-endpoint')
  assert.equal(registry.activeRoute().adapterId, 'user-endpoint')
  assert.equal(registry.activeRoute().endpoint, 'http://127.0.0.1:9000/v1')
  assert.equal(registry.activeRoute().modelId, 'model-a')
}))
