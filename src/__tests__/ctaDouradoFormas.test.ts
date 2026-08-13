/**
 * O CTA dourado tem DUAS formas nomeadas. A terceira não é forma — é cópia.
 *
 * Medido em 13/08/2026, contando só `<button>`:
 *
 *   184  bg-yellow-500 + text-black   → o CTA padrão do app
 *    19  .btn-gold-animated           → utility nomeada, gradiente animado
 *    29  linear-gradient INLINE       → escrito à mão, em 22 arquivos
 *
 * Os 19 não são problema: `btn-gold-animated` é uma decisão registrada no
 * globals.css, com nome, e quem a usa está escolhendo um comportamento
 * (a animação puxa o olho para o momento de conversão — login, salvar, criar).
 *
 * Os 29 são. Cada um foi digitado na hora por alguém que queria "um botão mais
 * bonito", com valores ligeiramente diferentes e sem regra que explique por que
 * ali e não no botão ao lado. É a mesma deriva das cores quase-gêmeas: não
 * quebra nada hoje, e no dia em que o dourado da marca mudar, muda em 184
 * lugares e continua velho em 29.
 *
 * ## A regra
 *
 *   sólido   → ação primária. O padrão. Na dúvida, é este.
 *   animado  → o momento que o app QUER que aconteça agora (entrar, salvar a
 *              primeira avaliação, criar o primeiro treino). Use com parcimônia:
 *              se tudo pulsa, nada pulsa.
 *   inline   → não. Se precisar de um tratamento novo, ele vira utility com
 *              nome no globals.css — e aí passa a ser decisão, não improviso.
 *
 * ## Por que congelar em vez de reescrever
 *
 * Trocar 29 gradientes por sólido mudaria o visual de 29 botões em 22 telas de
 * uma vez, sem ninguém olhando. O ratchet para a deriva hoje e deixa a
 * conversão para quando alguém estiver na tela — a mesma escolha do teto de
 * 9px em texto corrido.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Botões com gradiente inline por arquivo. SÓ DESCE. */
const TETO_GRADIENTE_INLINE: Record<string, number> = {
  'src/app/(app)/community/ChallengesPanel.tsx': 3,
  'src/app/(app)/community/CommunityClient.tsx': 2,
  'src/app/(app)/community/UserProfileModal.tsx': 1,
  'src/components/CardioSessionModal.tsx': 1,
  'src/components/ChatListScreen.tsx': 1,
  'src/components/VipHub.tsx': 2,
  'src/components/WhatsNewModal.tsx': 1,
  'src/components/dashboard/ExpressWorkoutModal.tsx': 1,
  'src/components/dashboard/GymDetectToast.tsx': 1,
  'src/components/dashboard/nutrition/CustomFoodLibrary.tsx': 1,
  'src/components/history/HistoryEmptyStates.tsx': 2,
  'src/components/onboarding/GuidedTour.tsx': 1,
  'src/components/settings/GymSettingsSection.tsx': 1,
  'src/components/settings/ReferralSection.tsx': 2,
  'src/components/settings/SettingsSections.tsx': 1,
  'src/components/settings/settingsShared.tsx': 1,
  'src/components/ui/PremiumUI.tsx': 1,
  'src/components/update/UpdateAvailableBanner.tsx': 1,
  'src/components/vip/VipInsightsPanel.tsx': 1,
  'src/components/vip/VipPeriodizationPanel.tsx': 1,
  'src/components/vip/WorkoutHeatMap.tsx': 1,
  'src/components/workout/CardioGPSPanel.tsx': 2,
}

const RAIZES = [join('src', 'components'), join('src', 'app')]

const arquivos = RAIZES.flatMap((raiz) =>
  readdirSync(raiz, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx') && !f.includes('__tests__') && !f.includes('comercial'))
    .map((f) => join(raiz, f)),
)

/** Tags de abertura de <button>, respeitando aninhamento. */
const botoes = (src: string): string[] => {
  const out: string[] = []
  for (const m of src.matchAll(/<button\b/g)) {
    let i = (m.index ?? 0) + m[0].length
    let prof = 0
    while (i < src.length) {
      const c = src[i]
      if (c === '{' || c === '[' || c === '(') prof++
      else if (c === '}' || c === ']' || c === ')') prof--
      else if (c === '>' && prof <= 0) { out.push(src.slice(m.index ?? 0, i)); break }
      i++
    }
  }
  return out
}

const gradienteInline = (tag: string): boolean =>
  !tag.includes('btn-gold-animated') &&
  tag.includes('linear-gradient') &&
  /#f59e0b|#eab308|amber|yellow/.test(tag)

const contar = (src: string): number => botoes(src).filter(gradienteInline).length

describe('CTA dourado — duas formas nomeadas, nenhuma improvisada', () => {
  it('nenhum arquivo passa do seu teto', () => {
    const estouros: string[] = []
    for (const rel of arquivos) {
      const atual = contar(readFileSync(rel, 'utf8'))
      const teto = TETO_GRADIENTE_INLINE[rel.replace(/\\/g, '/')] ?? 0
      if (atual > teto) estouros.push(`${rel}: ${atual} > ${teto}`)
    }
    expect(
      estouros,
      'gradiente inline em botão. Use `bg-yellow-500 text-black` (ação primária) ' +
        'ou `.btn-gold-animated` (momento de conversão). Precisa de um tratamento ' +
        'novo? Vire utility com nome no globals.css — improviso não vira sistema.',
    ).toEqual([])
  })

  it('o teto acompanha a correção — quem baixou tem que baixar na lista', () => {
    const folgados: string[] = []
    for (const [rel, teto] of Object.entries(TETO_GRADIENTE_INLINE)) {
      let atual = 0
      try { atual = contar(readFileSync(rel, 'utf8')) } catch { atual = 0 }
      if (atual < teto) folgados.push(`${rel}: ${atual} < ${teto}`)
    }
    expect(folgados, 'teto que não acompanha deixa o débito voltar sem ninguém ver').toEqual([])
  })

  it('as duas formas nomeadas continuam existindo', () => {
    const css = readFileSync(join('src', 'app', 'globals.css'), 'utf8')
    expect(css).toContain('.btn-gold-animated')
  })

  it('o detector separa a utility nomeada do improviso', () => {
    expect(gradienteInline('<button className="btn-gold-animated">x</button>')).toBe(false)
    expect(gradienteInline('<button style={{ background: \'linear-gradient(135deg,#f59e0b,#d97706)\' }}>x</button>')).toBe(true)
    expect(gradienteInline('<button className="bg-yellow-500 text-black">x</button>')).toBe(false)
  })
})
