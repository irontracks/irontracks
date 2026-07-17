import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard dos gates do campo de chat no NutritionMixer. Cada um existe por um
 * motivo específico, e todos são fáceis de remover sem querer num refactor de UI.
 */
const mixer = readFileSync(
  join(process.cwd(), 'src/components/dashboard/nutrition/NutritionMixer.tsx'),
  'utf8',
)
const chat = readFileSync(
  join(process.cwd(), 'src/components/dashboard/nutrition/NutritionChat.tsx'),
  'utf8',
)
const flat = mixer.replace(/\s+/g, ' ')

describe('gates do campo de chat', () => {
  it('os três gates estão no mesmo lugar', () => {
    expect(flat).toContain('{canViewMacros && isToday && !chatOffline && (')
  })

  it('isToday: a aba tem navegador de datas — simular "agora" num dia fechado não faz sentido', () => {
    // Sem este gate, o "Lançar" gravaria num dia passado sem avisar (resolveDateKey
    // só clampa futuro).
    expect(mixer).toContain('const isToday = currentDateKey === todayDate')
  })

  it('offline: o chat some, porque o servidor não enxerga as refeições pendentes', () => {
    // O Mixer tem entries otimistas (pending) que não estão no banco: o snapshot do
    // servidor diria 1.200 kcal com o anel do lado dizendo 1.900.
    expect(flat).toContain('const syncChatOffline = () => setChatOffline(isOffline())')
    // ...e é REATIVO: isOffline() lido no render não re-renderiza quando a rede cai.
    expect(flat).toContain("window.addEventListener('offline', syncChatOffline)")
  })

  it('os listeners de rede têm cleanup (regra fixa do repo)', () => {
    expect(flat).toContain("window.removeEventListener('offline', syncChatOffline)")
    expect(flat).toContain("window.removeEventListener('online', onOnline)")
  })

  it('a data e as metas passadas ao chat são as que a TELA está mostrando', () => {
    // O chat não pode contradizer o anel: a meta exibida já vem ajustada pelo modo
    // dia-de-descanso (NutritionOverlay.tsx), então é ela que vai pro servidor.
    expect(flat).toContain('dateKey={currentDateKey}')
    expect(flat).toContain("goals={{ ...safeGoals, source: goalsSource ?? 'default' }}")
  })

  it('lançar pelo chat atualiza o diário na tela', () => {
    expect(flat).toContain('onLogged={() => setEntriesTick((v) => v + 1)}')
  })
})

describe('folha do chat', () => {
  it('é portal pro body — o overlay da aba é um contexto de empilhamento', () => {
    // Mesma armadilha do modal de check-out do treino: `fixed` + z-index no pai
    // prenderia a folha atrás dele.
    expect(chat).toContain("import { createPortal } from 'react-dom'")
    expect(chat).toContain('document.body')
  })

  it('lança pela action que NÃO re-resolve', () => {
    expect(chat).toContain('applyChatSimulationAction')
    expect(chat).not.toContain('logMealAction')
    expect(chat).not.toContain('nutrition-estimate')
  })

  it('o lançamento é idempotente (toque duplo não duplica)', () => {
    expect(chat.replace(/\s+/g, ' ')).toContain('`chat-${msgId}`')
  })

  it('texto do modelo NUNCA vira HTML', () => {
    expect(chat).not.toContain('dangerouslySetInnerHTML')
  })

  it('manda no máximo o histórico que o Zod da rota aceita', () => {
    expect(chat).toContain('const HISTORY_TURNS = 6')
    expect(chat).toContain('.slice(-HISTORY_TURNS)')
  })

  it('trata 403 (Pro) e 429 (rate limit) com texto humano, não erro cru', () => {
    expect(chat).toContain('upgradeRequired')
    expect(chat).toContain('res.status === 429')
  })
})

describe('sugestões absorvidas do antigo "O que comer para bater as metas?"', () => {
  /**
   * O botão 🧠 (SmartSuggestions → /api/ai/nutrition-suggest) fazia exatamente um
   * dos alcances do chat e bebia do MESMO balde de 200/dia — duas portas pra mesma
   * pergunta. Foi absorvido: componente e rota removidos.
   */
  it('o botão, o componente e a rota sumiram do repo', () => {
    expect(existsSync(join(process.cwd(), 'src/components/dashboard/nutrition/SmartSuggestions.tsx'))).toBe(false)
    expect(existsSync(join(process.cwd(), 'src/app/api/ai/nutrition-suggest/route.ts'))).toBe(false)
    expect(mixer).not.toContain('SmartSuggestions')
    expect(mixer).not.toContain('nutrition-suggest')
  })

  it('tocar numa sugestão NÃO lança — vira "se eu comer X" e passa pelo atalho', () => {
    // É o que mantém a promessa: o usuário vê o impacto exato ANTES de decidir.
    // Se um dia isto virar um lançamento direto, o número deixa de ser conferido.
    expect(chat).toContain('send(`se eu comer ${s}`)')
  })

  it('a sugestão do modelo é só texto de alimento — nunca macro', () => {
    const prompt = readFileSync(join(process.cwd(), 'src/lib/nutrition/chatPrompt.ts'), 'utf8')
    const schema = prompt.slice(prompt.indexOf('const IntentSchema'), prompt.indexOf('export interface ParsedIntent'))
    expect(schema).toContain('suggestions: z.array(z.string()')
    expect(schema).not.toMatch(/\b(calories|protein|carbs|fat|dateKey|date)\b/)
  })
})
