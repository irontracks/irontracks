/**
 * `npm run sim:local` / `sim:prod` — apontar o app do simulador para o dev
 * server sem rebuild (pedido do dono, 19/08/2026: "consegue mudar o simulador
 * pra rodar local? assim testamos antes do commit").
 *
 * O que pode quebrar em silêncio aqui é a URL de PRODUÇÃO existir em dois
 * lugares: o fallback do `capacitor.config.ts` (que vale para a build de
 * verdade) e a constante do script (que vale para o `sim:prod`). Se um mudar e
 * o outro não, `sim:prod` devolve o simulador para um endereço que não é mais o
 * do app — e o sintoma seria "o simulador mostra uma versão velha", que custa
 * investigação e não parece um problema de script.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = process.cwd()
const script = readFileSync(join(raiz, 'scripts/sim-server.mjs'), 'utf8')
const capConfig = readFileSync(join(raiz, 'capacitor.config.ts'), 'utf8')
const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')) as { scripts: Record<string, string> }

describe('sim-server — atalho local/produção do simulador', () => {
  it('os três modos estão no package.json', () => {
    expect(pkg.scripts['sim:local']).toContain('scripts/sim-server.mjs local')
    expect(pkg.scripts['sim:prod']).toContain('scripts/sim-server.mjs prod')
    expect(pkg.scripts['sim:status']).toContain('scripts/sim-server.mjs status')
  })

  it('a URL de produção do script é a MESMA do capacitor.config.ts', () => {
    const doScript = /const PROD_URL = '([^']+)'/.exec(script)?.[1]
    const doConfig = /CAPACITOR_SERVER_URL \|\| '([^']+)'/.exec(capConfig)?.[1]
    expect(doScript, 'PROD_URL sumiu do script').toBeTruthy()
    expect(doConfig, 'o fallback saiu do capacitor.config.ts').toBeTruthy()
    expect(doScript).toBe(doConfig)
  })

  it('o app do simulador é identificado pelo mesmo bundle id do config', () => {
    const doScript = /const BUNDLE_ID = '([^']+)'/.exec(script)?.[1]
    expect(doScript).toBe('com.irontracks.app')
    expect(capConfig).toContain("appId: 'com.irontracks.app'")
  })

  it('o script só escreve dentro do bundle instalado, nunca no repo', () => {
    // Ele reescreve o capacitor.config.json QUE ESTÁ NO SIMULADOR (caminho vindo
    // de `simctl get_app_container`). Escrever no arquivo do repositório deixaria
    // a máquina do dono com um diff sujo depois de cada teste local.
    expect(script).toContain('get_app_container')
    const escritas = script.match(/writeFileSync\([^)]*/g) ?? []
    expect(escritas).toHaveLength(1)
    expect(escritas[0]).toContain('path')
  })

  it('avisa quando a porta local não responde em vez de abrir tela branca', () => {
    expect(script).toContain('portIsOpen')
    expect(script).toMatch(/suba o dev server/i)
  })
})
