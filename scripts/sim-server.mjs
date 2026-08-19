#!/usr/bin/env node
/**
 * Aponta o app do SIMULADOR para o dev server local (ou de volta para produção)
 * — sem Xcode, sem rebuild, sem `cap sync`.
 *
 * Por que isto existe
 * ───────────────────
 * `capacitor.config.ts` fixa `server.url` em https://irontracks.com.br, então o
 * app do simulador sempre mostrou PRODUÇÃO. Consequência prática: só dava para
 * conferir uma mudança visual DEPOIS do merge — e foi assim que três correções
 * seguidas de UI precisaram de PR, CI, deploy e só então a primeira olhada no
 * aparelho. Quando a olhada reprovava (o rótulo "DROP" cortado, por exemplo),
 * o ciclo inteiro recomeçava.
 *
 * O caminho oficial para trocar isso é `CAPACITOR_SERVER_URL=... npx cap sync` +
 * build nova no Xcode: ~2 minutos e exige `out/` gerado pelo export estático.
 * Mas a URL vive num JSON DENTRO do bundle instalado — e o bundle do simulador é
 * só um diretório no disco do Mac, sem assinatura para invalidar. Trocar a linha
 * e relançar leva menos de um segundo.
 *
 * Uso
 * ───
 *   npm run sim:local            # aponta para http://localhost:3000
 *   npm run sim:local -- 3001    # outra porta
 *   npm run sim:prod             # volta para https://irontracks.com.br
 *   npm run sim:status           # mostra para onde o app está apontando
 *
 * O dev server é responsabilidade de quem chama (`npm run dev`). O script avisa
 * quando a porta não responde em vez de deixar o app abrir numa tela branca —
 * "não carregou" é sintoma ambíguo demais para custar investigação.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'

const BUNDLE_ID = 'com.irontracks.app'
const PROD_URL = 'https://irontracks.com.br'
const PREFERRED_DEVICE = 'iPhone 17 Pro Max' // o aparelho do dono

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim()

function listDevices() {
  const raw = sh('xcrun', ['simctl', 'list', 'devices', 'available', '--json'])
  const parsed = JSON.parse(raw)
  const out = []
  for (const [runtime, devices] of Object.entries(parsed.devices || {})) {
    for (const d of devices) out.push({ ...d, runtime })
  }
  return out
}

/** Device alvo: o que já está ligado > o modelo do dono > qualquer iPhone. */
function pickDevice(explicitUdid) {
  const devices = listDevices()
  if (explicitUdid) {
    const found = devices.find((d) => d.udid === explicitUdid)
    if (!found) throw new Error(`Simulador ${explicitUdid} não encontrado.`)
    return found
  }
  const booted = devices.filter((d) => d.state === 'Booted')
  if (booted.length) return booted[0]
  const preferred = devices.filter((d) => d.name === PREFERRED_DEVICE)
  if (preferred.length) return preferred[preferred.length - 1]
  const anyIphone = devices.filter((d) => d.name.startsWith('iPhone'))
  if (!anyIphone.length) throw new Error('Nenhum simulador de iPhone disponível.')
  return anyIphone[anyIphone.length - 1]
}

function ensureBooted(device) {
  if (device.state === 'Booted') return
  process.stdout.write(`Ligando ${device.name}…\n`)
  sh('xcrun', ['simctl', 'boot', device.udid])
  // `bootstatus -b` espera o boot terminar; sem isso o get_app_container falha
  // com "Unable to lookup in current state: Booting".
  try { sh('xcrun', ['simctl', 'bootstatus', device.udid, '-b']) } catch { /* já ligado */ }
}

function configPath(device) {
  let container
  try {
    container = sh('xcrun', ['simctl', 'get_app_container', device.udid, BUNDLE_ID])
  } catch {
    throw new Error(
      `O IronTracks não está instalado em "${device.name}".\n` +
      'Instale uma build de simulador primeiro (ver "Build p/ simulador" no CLAUDE.md).',
    )
  }
  // O caminho do bundle MUDA a cada instalação — nunca reaproveitar o de antes.
  return `${container}/capacitor.config.json`
}

function readUrl(path) {
  const json = JSON.parse(readFileSync(path, 'utf8'))
  return String(json?.server?.url || '')
}

function writeUrl(path, url) {
  const json = JSON.parse(readFileSync(path, 'utf8'))
  json.server = { ...(json.server || {}), url }
  writeFileSync(path, `${JSON.stringify(json, null, '\t')}\n`)
}

function relaunch(device) {
  try { sh('xcrun', ['simctl', 'terminate', device.udid, BUNDLE_ID]) } catch { /* não estava aberto */ }
  sh('xcrun', ['simctl', 'launch', device.udid, BUNDLE_ID])
}

/** A porta responde? Sem isso o app abre em branco e o sintoma vira fantasma. */
function portIsOpen(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host })
    const done = (ok) => { socket.destroy(); resolve(ok) }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

async function main() {
  const argv = process.argv.slice(2)
  const mode = String(argv[0] || 'status').toLowerCase()
  const udidArg = (argv.find((a) => a.startsWith('--udid=')) || '').split('=')[1] || ''
  const positional = argv.slice(1).find((a) => !a.startsWith('--')) || ''

  const device = pickDevice(udidArg)
  ensureBooted(device)
  const path = configPath(device)

  if (mode === 'status') {
    process.stdout.write(`${device.name} → ${readUrl(path) || '(sem url)'}\n`)
    return
  }

  if (mode === 'prod') {
    writeUrl(path, PROD_URL)
    relaunch(device)
    process.stdout.write(`${device.name} → ${PROD_URL} (produção)\n`)
    return
  }

  if (mode === 'local') {
    // Aceita "3001", "localhost:3001" ou uma URL inteira (preview da Vercel, por exemplo).
    let url
    if (/^https?:\/\//i.test(positional)) url = positional.replace(/\/$/, '')
    else if (/^\d+$/.test(positional)) url = `http://localhost:${positional}`
    else if (positional) url = `http://${positional}`
    else url = 'http://localhost:3000'

    const parsed = new URL(url)
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80))
    const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname)
    if (isLocal && !(await portIsOpen(port))) {
      process.stdout.write(
        `⚠️  Nada respondendo em ${url} — suba o dev server antes (npm run dev).\n` +
        '    Apontando mesmo assim; relance o app depois que o servidor subir.\n',
      )
    }
    writeUrl(path, url)
    relaunch(device)
    process.stdout.write(`${device.name} → ${url} (local)\n`)
    process.stdout.write('Ao terminar: npm run sim:prod (senão o app fica preso no seu localhost).\n')
    return
  }

  throw new Error(`Modo desconhecido: "${mode}". Use local | prod | status.`)
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
