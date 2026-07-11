import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildReportHTML } from '@/utils/report/buildHtml'

/**
 * O HTML do relatório de treino é aberto OFFLINE / no share sheet do iOS / em
 * blob:/file: — contextos sem acesso à rede. Um recurso externo (fonte/stylesheet)
 * é render-blocking e faz o viewer renderizar EM BRANCO ("arquivo vem vazio"). As
 * imagens já eram embutidas em base64; a fonte do Google era o único ponto externo.
 * Estes testes travam a auto-suficiência do documento.
 */
describe('buildReportHTML — documento self-contained', () => {
  const session = {
    workoutTitle: 'Teste Lower',
    exercises: [{ name: 'Agachamento', sets: 3, reps: '10' }],
    logs: { '0-0': { weight: 100, reps: 10, done: true } },
    reportMeta: {},
    totalTime: 3600,
  }
  const html = buildReportHTML(session, null, 'Usuário', 500, {})

  it('gera conteúdo (não vazio)', () => {
    expect(html.length).toBeGreaterThan(1000)
    expect(html).toMatch(/<!doctype html>/i)
  })

  it('NÃO referencia fonte externa (Google Fonts)', () => {
    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).not.toContain('fonts.gstatic.com')
  })

  it('NÃO tem nenhum <link> externo (stylesheet render-blocking = tela em branco offline)', () => {
    // A causa do "arquivo vem vazio": um <link> de stylesheet externo bloqueia a
    // renderização até carregar; sem rede, o viewer fica em branco. Imagens externas
    // (logo/avatar) não bloqueiam — no fluxo real são embutidas em base64 — então o
    // guard é sobre <link>/CSS externo, não sobre qualquer http.
    expect(html).not.toMatch(/<link\b[^>]*rel=["']stylesheet["']/i)
    expect(html).not.toMatch(/@import\s+url\(/i)
  })

  it('mantém a font-family com fallback de sistema (a fonte cai no SO)', () => {
    expect(html).toMatch(/font-family:[^;]*(system-ui|-apple-system|sans-serif)/i)
  })
})

/**
 * Guard: o "Salvar PDF" não pode disparar uma geração de IA (Gemini) no meio do
 * fluxo — era lenta/às vezes travada, deixando a barra desabilitada "sem acontecer
 * nada". generatePostWorkoutInsights só deve aparecer no handler de gerar IA.
 */
describe('WorkoutReport — save de PDF não bloqueia em IA', () => {
  const src = readFileSync('src/components/WorkoutReport.tsx', 'utf8')

  it('generatePostWorkoutInsights é chamado só uma vez (no handler de IA, não no de PDF)', () => {
    const calls = (src.match(/generatePostWorkoutInsights\s*\(/g) || []).length
    expect(calls).toBe(1)
  })
})
