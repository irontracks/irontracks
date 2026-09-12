/**
 * Os três invariantes do chat de IA por exercício que custam DINHEIRO ou
 * mentem na tela — e que passavam verdes por não existirem (12/09/2026).
 *
 * 1. **A cota é incrementada depois de TODA recusa determinística.**
 *    `checkVipFeatureAccess({ meter: true })` incrementa e esta rota não
 *    reembolsa; com o metering antes da sanitização e do download da mídia,
 *    um `path` que ainda não subiu devolvia 400 tendo queimado uma unidade de
 *    `media_analysis` — que são 20 por dia.
 *
 * 2. **A thread lida é a do FIM da conversa.** `ascending: true` + `limit`
 *    corta pelo lado errado: passando do teto, o banco devolve as PRIMEIRAS
 *    mensagens e a conversa congela no começo — na tela e no histórico que vai
 *    ao modelo. E o desempate por `role` existe porque os dois turnos são
 *    gravados num `insert` só: `created_at` empata e, sem critério, a resposta
 *    pode vir antes da pergunta.
 *
 * 3. **A mídia entra UMA vez.** O histórico que volta ao prompt é texto com a
 *    marca do anexo; reenviar o vídeo a cada pergunta multiplica a conta de
 *    uma chave paga sem melhorar a resposta.
 *
 * O guard da ordem é de SOURCE porque a rota exige sessão Supabase e chamada
 * paga ao Gemini para rodar de verdade — é o mesmo molde do
 * `nutritionEstimateFiacao`. Ele mira em chamadas que vão FICAR
 * (`sanitizeAiInput(question`, `.download(`, `meter: true`), não em prosa.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { carregarThread, historicoParaPrompt, type LinhaDaThread } from '@/lib/workout/exerciseChat'

const ROTA = join(process.cwd(), 'src/app/api/ai/exercise-chat/route.ts')
const fonte = readFileSync(ROTA, 'utf8')
/** Sem comentário: um guard que casa com a prosa que o explica acusa a si mesmo. */
const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const posicaoDe = (padrao: RegExp): number => {
  const m = codigo.match(padrao)
  expect(m, `o alvo do guard sumiu do código: ${padrao}`).toBeTruthy()
  return codigo.indexOf(m![0])
}

describe('exercise-chat: a cota é a ÚLTIMA coisa antes do modelo', () => {
  it('mede a cota só depois de resolver a chave do Gemini', () => {
    expect(posicaoDe(/env\.gemini\.apiKey/)).toBeLessThan(posicaoDe(/meter:\s*true/))
  })

  it('mede a cota só depois de sanitizar a pergunta', () => {
    // Pergunta que sobra vazia da sanitização vira 400 — cobrar por isso é
    // entregar nada por uma unidade de cota.
    expect(posicaoDe(/sanitizeAiInput\(question/)).toBeLessThan(posicaoDe(/meter:\s*true/))
  })

  it('mede a cota só depois de BAIXAR a mídia', () => {
    // O download é do storage e pode falhar (path inexistente, upload
    // interrompido). Falhar depois do metering custa `media_analysis`, o balde
    // de 20/dia, sem nenhuma chamada ao modelo ter acontecido.
    expect(posicaoDe(/\.download\(/)).toBeLessThan(posicaoDe(/meter:\s*true/))
  })

  it('a mídia sobe ao Gemini DEPOIS da cota (é ela que a cota paga)', () => {
    expect(posicaoDe(/meter:\s*true/)).toBeLessThan(posicaoDe(/buildGeminiMediaPart\(/))
  })
})

// ── A thread lida é a do fim ────────────────────────────────────────────────

function supabaseFalso(linhas: LinhaDaThread[]) {
  const ordens: Array<{ coluna: string; ascending: boolean | undefined }> = []
  const cadeia: Record<string, unknown> = {}
  const encadeia = () => cadeia
  cadeia.select = vi.fn(encadeia)
  cadeia.eq = vi.fn(encadeia)
  cadeia.order = vi.fn((coluna: string, opts?: { ascending?: boolean }) => {
    ordens.push({ coluna, ascending: opts?.ascending })
    return cadeia
  })
  cadeia.limit = vi.fn(async () => ({ data: linhas, error: null }))
  return { supabase: { from: vi.fn(encadeia) } as never, ordens }
}

const linha = (role: string, content: string): LinhaDaThread => ({
  role,
  content,
  media_kind: null,
  exercise_name: 'Supino reto',
  created_at: '2026-09-12T18:00:00.000Z',
})

describe('carregarThread', () => {
  it('pede as ÚLTIMAS mensagens e devolve em ordem cronológica', async () => {
    // O banco devolve do mais novo para o mais velho (é assim que o teto pega
    // o fim da conversa); quem lê recebe do mais velho para o mais novo.
    const { supabase, ordens } = supabaseFalso([linha('assistant', 'nova'), linha('user', 'velha')])
    const { rows } = await carregarThread(supabase, 'u1', '2026-09-12T18:00:00.000Z', 2)

    const porCreatedAt = ordens.find((o) => o.coluna === 'created_at')
    expect(porCreatedAt?.ascending, 'ascending + limit corta o COMEÇO da conversa').toBe(false)
    expect(rows.map((r) => r.content)).toEqual(['velha', 'nova'])
  })

  it('desempata `created_at` igual pelo papel — pergunta antes da resposta', async () => {
    // Os dois turnos são gravados num `insert` só: `now()` é o mesmo nos dois.
    const { supabase, ordens } = supabaseFalso([])
    await carregarThread(supabase, 'u1', '2026-09-12T18:00:00.000Z', 2)
    const porRole = ordens.find((o) => o.coluna === 'role')
    expect(porRole, 'sem desempate, a resposta pode aparecer acima da pergunta').toBeTruthy()
    // Ascendente na consulta (descendente depois do reverse): 'user' > 'assistant'.
    expect(porRole?.ascending).toBe(true)
  })
})

// ── A mídia entra uma vez ───────────────────────────────────────────────────

describe('historicoParaPrompt', () => {
  it('leva a MARCA do anexo, nunca o anexo', () => {
    const texto = historicoParaPrompt([
      { ...linha('user', 'é esse aparelho?'), media_kind: 'video' },
      linha('assistant', 'a amplitude está curta'),
    ])
    expect(texto).toContain('[enviou um vídeo]')
    expect(texto).toContain('é esse aparelho?')
    // Nada que pareça bytes/URI de arquivo pode entrar no histórico.
    expect(texto).not.toMatch(/inlineData|fileData|base64|https?:\/\//)
  })
})
