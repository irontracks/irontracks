#!/usr/bin/env node
/**
 * gen-image.mjs — Utility to generate images via Google Gemini API.
 *
 * Supports two models:
 *   • "nano"   → gemini-2.5-flash-image  (Nano Banana — fast, edits, consistency)
 *   • "imagen" → imagen-4.0-generate-001 (Imagen 4 — high fidelity, typography)
 *   • "both"   → runs both in parallel
 *
 * Reads API key from .env.local in this order:
 *   1. GOOGLE_GENERATIVE_AI_IMAGE_API_KEY  (preferred — image-specific, billing-enabled)
 *   2. GOOGLE_GENERATIVE_AI_API_KEY        (fallback — main app key)
 *   3. GEMINI_API_KEY                      (legacy fallback)
 *
 * Image generation requires billing to be enabled on the Google Cloud project.
 *
 * Usage:
 *   node scripts/gen-image.mjs --prompt "..." [options]
 *   node scripts/gen-image.mjs --prompt-file path/to/prompt.txt [options]
 *
 * Options:
 *   --prompt, -p          Text prompt (required, or use --prompt-file)
 *   --prompt-file, -f     Read prompt from file
 *   --model, -m           nano | imagen | both           (default: both)
 *   --output, -o          Output directory                (default: tests/generated-images)
 *   --name, -n            Filename prefix                 (default: image-{timestamp})
 *   --count, -c           Images per model (1-4, Imagen only) (default: 1)
 *   --aspect-ratio, -a    1:1 | 9:16 | 16:9 | 3:4 | 4:3  (default: 1:1)
 *   --imagen-variant      generate-001 | ultra | fast    (default: generate-001)
 *   --help, -h            Show this help
 *
 * Examples:
 *   node scripts/gen-image.mjs -p "VIP Elite badge, gold flat" -m imagen -a 1:1
 *   node scripts/gen-image.mjs -p "Mother's Day modal" -m both -n mothers-day
 *   node scripts/gen-image.mjs -f prompts/onboarding.txt -m imagen -c 4
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

// ── Load .env.local (then .env as fallback) ──────────────────────────────────
dotenv.config({ path: path.join(PROJECT_ROOT, '.env.local'), quiet: true })
dotenv.config({ path: path.join(PROJECT_ROOT, '.env'), quiet: true })

// ── CLI ──────────────────────────────────────────────────────────────────────
const HELP = `gen-image.mjs — generate images via Gemini API

Usage:
  node scripts/gen-image.mjs --prompt "..." [options]

Options:
  -p, --prompt <text>         Prompt text (or use --prompt-file)
  -f, --prompt-file <path>    Read prompt from a file
  -m, --model <name>          nano | imagen | both          (default: both)
  -o, --output <dir>          Output directory               (default: tests/generated-images)
  -n, --name <prefix>         Filename prefix                (default: image-{ts})
  -c, --count <n>             Images per model (Imagen only) (default: 1)
  -a, --aspect-ratio <r>      1:1 | 9:16 | 16:9 | 3:4 | 4:3  (default: 1:1)
      --imagen-variant <v>    generate-001 | ultra | fast    (default: generate-001)
  -h, --help                  Show this help

Models:
  nano    → gemini-2.5-flash-image       (Nano Banana — fast, edits, consistency)
  imagen  → imagen-4.0-{variant}-001     (Imagen 4 — high fidelity, typography)
`

let parsed
try {
  parsed = parseArgs({
    options: {
      prompt: { type: 'string', short: 'p' },
      'prompt-file': { type: 'string', short: 'f' },
      model: { type: 'string', short: 'm', default: 'both' },
      output: { type: 'string', short: 'o', default: 'tests/generated-images' },
      name: { type: 'string', short: 'n' },
      count: { type: 'string', short: 'c', default: '1' },
      'aspect-ratio': { type: 'string', short: 'a', default: '1:1' },
      'imagen-variant': { type: 'string', default: 'generate-001' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  })
} catch (err) {
  console.error(`Error: ${err.message}\n`)
  console.error(HELP)
  process.exit(1)
}

const { values } = parsed

if (values.help) {
  console.log(HELP)
  process.exit(0)
}

// Prefer the image-specific key (billing-enabled), fall back to the general one.
const API_KEY =
  process.env.GOOGLE_GENERATIVE_AI_IMAGE_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  process.env.GEMINI_API_KEY
if (!API_KEY) {
  console.error(
    'Missing GOOGLE_GENERATIVE_AI_IMAGE_API_KEY (preferred) or GOOGLE_GENERATIVE_AI_API_KEY.'
  )
  console.error('Set it in .env.local or via env var.')
  process.exit(1)
}
const KEY_SOURCE = process.env.GOOGLE_GENERATIVE_AI_IMAGE_API_KEY
  ? 'GOOGLE_GENERATIVE_AI_IMAGE_API_KEY'
  : process.env.GOOGLE_GENERATIVE_AI_API_KEY
    ? 'GOOGLE_GENERATIVE_AI_API_KEY'
    : 'GEMINI_API_KEY'

let prompt = values.prompt
if (values['prompt-file']) {
  prompt = (await fs.readFile(path.resolve(values['prompt-file']), 'utf8')).trim()
}
if (!prompt) {
  console.error('Error: --prompt or --prompt-file is required.\n')
  console.error(HELP)
  process.exit(1)
}

const MODEL = values.model.toLowerCase()
if (!['nano', 'imagen', 'both'].includes(MODEL)) {
  console.error(`Invalid --model "${MODEL}". Use: nano | imagen | both`)
  process.exit(1)
}

const ASPECT = values['aspect-ratio']
if (!['1:1', '9:16', '16:9', '3:4', '4:3'].includes(ASPECT)) {
  console.error(`Invalid --aspect-ratio "${ASPECT}". Use: 1:1, 9:16, 16:9, 3:4, 4:3`)
  process.exit(1)
}

const COUNT = Math.min(4, Math.max(1, parseInt(values.count, 10) || 1))
const IMAGEN_VARIANT = values['imagen-variant']
const OUTPUT_DIR = path.isAbsolute(values.output)
  ? values.output
  : path.resolve(PROJECT_ROOT, values.output)
const NAME_PREFIX = values.name || `image-${Date.now()}`

await fs.mkdir(OUTPUT_DIR, { recursive: true })

console.log(`Using API key from: ${KEY_SOURCE}`)

// ── Generators ───────────────────────────────────────────────────────────────
async function generateNano() {
  const model = 'gemini-2.5-flash-image'
  console.log(`[nano] ${model}…`)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'] },
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) {
    console.error(`[nano] ERROR ${res.status}:`, json?.error?.message || JSON.stringify(json))
    return []
  }
  const parts = json?.candidates?.[0]?.content?.parts || []
  const imgPart = parts.find((p) => p.inlineData?.data)
  if (!imgPart) {
    console.error('[nano] no image in response')
    return []
  }
  const buf = Buffer.from(imgPart.inlineData.data, 'base64')
  const file = path.join(OUTPUT_DIR, `${NAME_PREFIX}-nano.png`)
  await fs.writeFile(file, buf)
  console.log(`[nano] ✅ ${path.relative(PROJECT_ROOT, file)}  (${(buf.length / 1024).toFixed(1)} KB)`)
  return [file]
}

async function generateImagen() {
  const model = `imagen-4.0-${IMAGEN_VARIANT.replace(/^generate-?/, 'generate-')}-001`.replace('--', '-')
  // Build canonical model id from variant
  const finalModel =
    IMAGEN_VARIANT === 'generate-001' || IMAGEN_VARIANT === 'generate'
      ? 'imagen-4.0-generate-001'
      : IMAGEN_VARIANT === 'ultra'
        ? 'imagen-4.0-ultra-generate-001'
        : IMAGEN_VARIANT === 'fast'
          ? 'imagen-4.0-fast-generate-001'
          : model
  console.log(`[imagen] ${finalModel}  (count=${COUNT}, aspect=${ASPECT})…`)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${finalModel}:predict?key=${API_KEY}`
  const body = {
    instances: [{ prompt }],
    parameters: { sampleCount: COUNT, aspectRatio: ASPECT, personGeneration: 'allow_all' },
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) {
    console.error(`[imagen] ERROR ${res.status}:`, json?.error?.message || JSON.stringify(json))
    return []
  }
  const preds = json?.predictions || []
  if (preds.length === 0) {
    console.error('[imagen] no predictions in response', JSON.stringify(json, null, 2))
    return []
  }
  const files = []
  for (let i = 0; i < preds.length; i++) {
    const b64 = preds[i]?.bytesBase64Encoded
    if (!b64) continue
    const buf = Buffer.from(b64, 'base64')
    const suffix = preds.length > 1 ? `-${i + 1}` : ''
    const file = path.join(OUTPUT_DIR, `${NAME_PREFIX}-imagen${suffix}.png`)
    await fs.writeFile(file, buf)
    console.log(`[imagen] ✅ ${path.relative(PROJECT_ROOT, file)}  (${(buf.length / 1024).toFixed(1)} KB)`)
    files.push(file)
  }
  return files
}

// ── Run ──────────────────────────────────────────────────────────────────────
const tasks = []
if (MODEL === 'nano' || MODEL === 'both') tasks.push(generateNano())
if (MODEL === 'imagen' || MODEL === 'both') tasks.push(generateImagen())

const start = Date.now()
const results = (await Promise.all(tasks)).flat()
const elapsed = ((Date.now() - start) / 1000).toFixed(1)

console.log(`\nDone in ${elapsed}s. ${results.length} image(s) saved to ${path.relative(PROJECT_ROOT, OUTPUT_DIR)}/`)

if (results.length === 0) {
  process.exit(1)
}
