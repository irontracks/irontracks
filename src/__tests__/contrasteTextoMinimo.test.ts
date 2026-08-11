/**
 * Guard de contraste — as três faixas que NENHUM texto pode usar.
 *
 * Medido em 11/08/2026 sobre o fundo do app (#0a0a0a), com a fórmula do WCAG 2.1:
 *
 *   text-neutral-400  #a3a3a3   7.85:1   passa
 *   text-neutral-500  #737373   4.18:1   falha AA (mínimo 4.5)
 *   text-neutral-600  #525252   2.53:1   falha
 *   text-neutral-700  #404040   1.91:1   falha — e falha até o mínimo de 3:1 de UI
 *   text-neutral-800  #262626   1.31:1   falha
 *
 * O guard nasceu travando só 700 e 800, onde não há discussão: 1.9:1 e 1.3:1 são
 * ilegíveis em qualquer tamanho. Foi onde estavam os piores casos da auditoria —
 * inclusive uma instrução de uso ("cm · toque para destacar") em 8px e 1.31:1,
 * ou seja, invisível. `600` (2.53:1) segue fora só porque o app não usa; se
 * alguém introduzir, some para cá.
 *
 * ⚠️ Esta nota dizia que `neutral-500` ficava de fora porque "parte é texto
 * grande, que passa com 3:1". **Isso foi MEDIDO depois e é falso**: das 380
 * ocorrências do app, classificadas uma a uma pelo tamanho de fonte declarado
 * na própria `className`, o número de textos grandes deu **ZERO**. Não havia
 * exceção legítima — só volume. A varredura foi feita em quatro lotes
 * (dashboard, treino, telas do usuário, administrativas) e hoje o app tem zero
 * ocorrências, então a faixa 500 entrou no guard junto com as outras.
 *
 * Fica o registro do padrão: a suposição confortável ("deve ter caso legítimo")
 * durou até alguém contar. Contar custou um script de vinte linhas.
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
 * Arquivos onde as faixas proibidas ainda aparecem por motivo legítimo.
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

/**
 * As três faixas reprovadas em TEXTO. `500` entrou em 11/08/2026, depois da
 * varredura que zerou as 380 ocorrências — antes dela, travar aqui só produziria
 * um teste vermelho que alguém afrouxaria.
 */
const PROIBIDAS = /text-neutral-(500|700|800)\b/

const arquivos = readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.tsx') && !f.includes('__tests__'))
  // Windows devolve '\' — normaliza para casar com as chaves de EXCECOES.
  .map((f) => f.split('\\').join('/'))

describe('contraste mínimo de texto', () => {
  it('nenhum arquivo novo usa as faixas reprovadas em texto', () => {
    const infratores: string[] = []
    for (const rel of arquivos) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      if (!PROIBIDAS.test(src)) continue
      if (EXCECOES[rel]) continue
      infratores.push(rel)
    }
    expect(
      infratores,
      'Sobre #0a0a0a: neutral-500 mede 4.18:1 (reprova o mínimo de 4.5), ' +
        'neutral-700 mede 1.91:1 e neutral-800 mede 1.31:1. Use neutral-400 ' +
        '(7.85:1), ou registre a exceção com o motivo se for controle ' +
        'desabilitado ou ícone puramente decorativo.',
    ).toEqual([])
  })

  it('a allowlist não guarda entrada morta — ela só encolhe', () => {
    const mortas = Object.keys(EXCECOES).filter((rel) => {
      try {
        return !PROIBIDAS.test(readFileSync(join(ROOT, rel), 'utf8'))
      } catch {
        return true
      }
    })
    expect(mortas, 'já não usam faixa reprovada — remova da lista').toEqual([])
  })
})
