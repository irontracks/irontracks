/**
 * Explicitly disable optional Meshopt compression under our strict CSP.
 * No WASM initialization occurs at import. GLTFLoader rejects models that
 * require this extension instead of attempting to decode them incorrectly.
 */
export const MeshoptDecoder = { supported: false }
