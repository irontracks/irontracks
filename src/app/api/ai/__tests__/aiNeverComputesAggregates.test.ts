/**
 * Guard de CLASSE: modelo de linguagem não faz aritmética.
 *
 * Em 29/07/2026 o relatório pós-treino exibia, no mesmo bloco, o card
 * "26.300 kg / 29 séries" e o texto "Volume total de 18.232 kg movimentado em
 * 26 séries de trabalho". O 18.232 não existia em lugar nenhum do payload — e o
 * MESMO número saiu numa sessão cujo volume real era 17.566 kg. O modelo estava
 * somando os logs crus por conta própria.
 *
 * A regra que este arquivo trava: se uma rota de IA entrega os logs por série ao
 * modelo, ela é obrigada a entregar também os totais já computados e a proibir o
 * recálculo. E nenhuma rota pode pedir um agregado numérico como campo de saída
 * do modelo — agregado é responsabilidade do servidor, sempre.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const AI_DIR = path.join(ROOT, 'src/app/api/ai')

function listRoutes(dir = AI_DIR): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listRoutes(full))
    else if (entry.name === 'route.ts') out.push(full)
  }
  return out
}

const rel = (f: string) => path.relative(ROOT, f)
const routes = listRoutes().map((f) => ({ file: f, src: fs.readFileSync(f, 'utf-8') }))

describe('rotas de IA — agregado numérico é do servidor', () => {
  it('a varredura encontra as rotas de IA (sanidade)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(20)
  })

  it('nenhuma pede um total numérico como campo de saída do modelo', () => {
    // Ex.: '  "totalVolume": number (kg),' — pedir isso ao modelo É o bug.
    const pedeAgregado =
      /"(totalVolume|totalVolumeKg|volumeTotal|totalSets|totalSetsDone|sessions|totalExercises)"\s*:\s*number/i
    const offenders = routes.filter((r) => pedeAgregado.test(r.src)).map((r) => rel(r.file))
    expect(offenders).toEqual([])
  })

  it('quem injeta os logs por série entrega os totais prontos e proíbe recalcular', () => {
    // Injetar `logs` crus é legítimo (o modelo precisa deles para falar de
    // técnica e equilíbrio muscular) — desde que os totais venham junto.
    const injetaLogs = (src: string) =>
      /JSON\.stringify\((session|sessionData|sessionObj)\)/.test(src) || /logs:\s*session/.test(src)

    const offenders = routes
      .filter((r) => injetaLogs(r.src))
      .filter((r) => !(r.src.includes('MÉTRICAS OFICIAIS') && r.src.includes('NÃO recalcule')))
      .map((r) => rel(r.file))
    expect(offenders).toEqual([])
  })
})
