/**
 * Guard de contraste — as duas faixas que NENHUM texto pode usar.
 *
 * Medido em 11/08/2026 sobre o fundo do app (#0a0a0a), com a fórmula do WCAG 2.1:
 *
 *   text-neutral-400  #a3a3a3   7.85:1   passa
 *   text-neutral-500  #737373   4.18:1   falha AA (mínimo 4.5)
 *   text-neutral-600  #525252   2.53:1   falha
 *   text-neutral-700  #404040   1.91:1   falha — e falha até o mínimo de 3:1 de UI
 *   text-neutral-800  #262626   1.31:1   falha
 *
 * Este guard trava só as DUAS PIORES faixas (700 e 800) em TEXTO, porque ali não
 * há discussão: 1.9:1 e 1.3:1 são ilegíveis em qualquer tamanho de fonte. Foi
 * onde estavam os casos reais achados na auditoria — inclusive uma instrução de
 * uso ("cm · toque para destacar") em 8px e 1.31:1, ou seja, invisível.
 *
 * `neutral-500` (380 ocorrências) NÃO entra aqui de propósito: parte é texto
 * grande, que passa com 3:1, e travar tudo de uma vez viraria um teste que se
 * afrouxa na primeira semana. Está reportado para uma varredura própria.
 *
 * EXCEÇÕES cobrem o que o WCAG isenta: controle desabilitado e ícone puramente
 * decorativo. A lista só encolhe.
 */
import { describe, it, expect } from 'vitest'
// `readdirSync(..., { recursive: true })` e NÃO `globSync`: este último só
// existe a partir do Node 22, e o CI roda Node 20 — passou local e reprovou lá.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')

/**
 * Arquivos onde `text-neutral-700/800` ainda aparece por motivo legítimo.
 * Cada entrada precisa de razão escrita. **A lista só encolhe.**
 */
const EXCECOES: Record<string, string> = {
  'components/workout/Modals.tsx': 'botão desabilitado — WCAG 1.4.3 isenta controle inativo',
  'components/workout/CardioSetInput.tsx': 'variante disabled: do input',
  'components/workout/WorkoutHeader.tsx': 'estado cursor-not-allowed',
  'components/LoginScreen.tsx': 'border-neutral-700, não é cor de texto',
  'components/ProgressPhotos.tsx': 'ícone decorativo de estado vazio',
  'components/admin-panel/StudentProfileTab.tsx': 'ícone decorativo de estado vazio',
  'components/admin-panel/TeachersTab.tsx': 'ícone decorativo de estado vazio',
  'components/admin-panel/VipTab.tsx': 'ícone decorativo de estado vazio',
  'components/admin/RequestsTab.tsx': 'ícone decorativo de estado vazio',
  'components/body-photo/BodyPhotoHistoryModal.tsx': 'ícone de imagem ausente',
  'components/dashboard/IronRankCard.tsx': 'ícone decorativo em linha de PR',
}

const arquivos = readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.tsx') && !f.includes('__tests__'))
  // Windows devolve '\' — normaliza para casar com as chaves de EXCECOES.
  .map((f) => f.split('\\').join('/'))

describe('contraste mínimo de texto', () => {
  it('nenhum arquivo novo usa neutral-700/800 em texto', () => {
    const infratores: string[] = []
    for (const rel of arquivos) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      if (!/text-neutral-(700|800)\b/.test(src)) continue
      if (EXCECOES[rel]) continue
      infratores.push(rel)
    }
    expect(
      infratores,
      'text-neutral-700 mede 1.91:1 e o 800 mede 1.31:1 sobre #0a0a0a — ' +
        'ilegível em qualquer tamanho. Use neutral-400 (7.85:1), ou registre ' +
        'a exceção com o motivo se for controle desabilitado ou ícone decorativo.',
    ).toEqual([])
  })

  it('a allowlist não guarda entrada morta — ela só encolhe', () => {
    const mortas = Object.keys(EXCECOES).filter((rel) => {
      try {
        return !/text-neutral-(700|800)\b/.test(readFileSync(join(ROOT, rel), 'utf8'))
      } catch {
        return true
      }
    })
    expect(mortas, 'já não usam neutral-700/800 — remova da lista').toEqual([])
  })
})
