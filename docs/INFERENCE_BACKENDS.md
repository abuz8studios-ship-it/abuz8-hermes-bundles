# Inference backends

The desktop registry is a versioned, local-only plugin contract. A manifest has
`schemaVersion: 1`, an `id`, display `name` and `version`, an `adapter`, a
`provider` (`local` or `hosted`), one or more `models`, a boolean
`capabilities` map, and a `config` object. Supported adapters are:

- `llama.cpp-local` for the bundled/user-selected local executable or endpoint
- `openai-compatible` for vLLM, SGLang, llama.cpp server, and hosted APIs
- `hosted-metadata` for provider/model metadata without a local server

Install reads a manifest from a path the user selects. It never downloads or
executes an executable. Only normalized user configuration is copied into the
application user-data registry; built-in adapters remain part of the app and
cannot be removed. Credentials are not valid manifest fields and are kept in
the existing credential/settings flows.

Adapter enablement/selection and model selection are separate registry values.
Capability requests are checked against the manifest and unsupported features
(vision, voice, tools, memory, GPU, speculative/MTP/prefill/tokenizer, etc.)
are returned as validation errors rather than ignored.

vLLM and SGLang are supported through their OpenAI-compatible HTTP endpoints in
this slice. Their servers are not bundled or installed automatically.
