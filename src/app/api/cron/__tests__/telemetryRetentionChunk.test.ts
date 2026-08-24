/**
 * A purga da telemetria estava MORTA em produção — e em silêncio.
 *
 * Medido em 24/08/2026 contra a base real: o `.in('id', ids)` do PostgREST
 * aguenta ~300 ids (~11 KB de query string) e falha com 500 (~18 KB); o
 * supabase-js devolve `TypeError: fetch failed` com `code` e `message` VAZIOS,
 * que no log da Vercel virava `[object Object] { stage: 'delete' }`. Como o
 * select traz até 1000 ids (teto do PostgREST, não os 20.000 que a constante
 * anunciava), TODA execução falhava: **10.785 linhas vencidas continuavam na
 * tabela desde 04/08/2026**, numa tabela que já foi metade do banco.
 *
 * Estes casos travam as duas metades: o tamanho do bloco e a ordem
 * (agrega → apaga), que já tinha guard próprio em `telemetryRetention.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DELETE_CHUNK, SELECT_PAGE } from '../telemetry-retention/route'

const SRC = resolve(process.cwd(), 'src/app/api/cron/telemetry-retention/route.ts')

describe('telemetry-retention — blocos que cabem na URL', () => {
  it('o bloco fica abaixo do limite MEDIDO do gateway', () => {
    // 300 passou, 500 falhou. Qualquer valor daqui para cima volta a quebrar.
    expect(DELETE_CHUNK).toBeLessThanOrEqual(300)
    expect(DELETE_CHUNK).toBeGreaterThan(0)
  })

  it('um bloco de ids continua abaixo de 11 KB de query string', () => {
    // UUID v4 = 36 chars + separador. É o cálculo que a medição confirmou.
    const bytes = DELETE_CHUNK * 37
    expect(bytes).toBeLessThan(11 * 1024)
  })

  it('a página do select respeita o teto real do PostgREST (1000)', () => {
    expect(SELECT_PAGE).toBeLessThanOrEqual(1000)
  })

  it('o delete é fatiado — `.in()` com a página inteira era o bug', () => {
    const src = readFileSync(SRC, 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    // Apaga por CHUNK, nunca pela lista inteira que veio do select.
    expect(code).toMatch(/\.delete\(\)\.in\('id',\s*chunk\)/)
    expect(code).not.toMatch(/\.delete\(\)\.in\('id',\s*ids\)/)
  })

  it('falha no meio preserva o que já foi apagado', () => {
    const src = readFileSync(SRC, 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    // `purged: 0` no erro apagava o rastro de quanto tinha saído — e a próxima
    // execução não teria como saber que houve progresso.
    expect(code).not.toMatch(/error:\s*'delete_failed',\s*purged:\s*0/)
    expect(code).toMatch(/error:\s*'delete_failed',\s*purged\s*\}/)
  })

  it('o erro do gateway vai ao log com TEXTO — `[object Object]` não é diagnóstico', () => {
    const src = readFileSync(SRC, 'utf8')
    expect(src).toMatch(/message:\s*delErr\.message/)
    expect(src).toMatch(/code:\s*delErr\.code/)
  })
})
