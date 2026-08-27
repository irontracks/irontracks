/**
 * Ratchet: e-mail de terceiro não chega à tela em superfície SOCIAL.
 *
 * A pergunta do dono ("isso está no app todo?") expôs que não estava. O
 * `publicDisplayName` tinha sido aplicado só na lista de Conversas, e o mesmo
 * `display_name` — que em 9 dos 58 perfis É o e-mail — chegava cru em:
 *
 *   ChatDirectScreen  cabeçalho da conversa, avatar e nome de cada remetente
 *   LeaderboardPanel  o RANKING, visível para toda a base
 *   CommunityClient   lista de quem está treinando agora
 *   StoryViewer       autor do story e dos comentários
 *
 * Corrigir uma tela e declarar a classe resolvida é o erro que este arquivo
 * existe para impedir.
 *
 * ⚠️ Fronteira deliberada: superfícies ADMINISTRATIVAS ficam de fora. O
 * professor e o admin PRECISAM ver o e-mail do aluno para gestão — mascarar ali
 * seria esconder dado de quem tem direito a ele. A regra vale onde um usuário
 * comum vê outro usuário comum.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Onde um usuário comum vê o nome de outro usuário comum. */
const SOCIAIS = [
  join('src', 'components', 'ChatListScreen.tsx'),
  join('src', 'components', 'ChatDirectScreen.tsx'),
  join('src', 'components', 'stories', 'StoryViewer.tsx'),
  join('src', 'app', '(app)', 'community', 'CommunityClient.tsx'),
  join('src', 'app', '(app)', 'community', 'LeaderboardPanel.tsx'),
  join('src', 'components', 'dashboard', 'StoriesBar.tsx'),
]

/** Interpolação JSX que leva nome para a tela (ou para o leitor de tela). */
const NOME_NA_TELA = /\{[^{}]{0,90}?(display_name|displayName)[^{}]{0,70}?\}/g

/**
 * O MESMO nome, colhido para uma variável antes de ser exibido:
 *
 *   const name = safeString(p.display_name).trim() || 'Usuário'
 *   …
 *   <div>{name}</div>
 *
 * A interpolação final não cita `display_name`, então `NOME_NA_TELA` não vê
 * nada — foi por aqui que o e-mail alheio voltou à lista de descoberta da
 * Comunidade, ao autor do story e ao rótulo da StoriesBar, com este arquivo
 * passando 3/3 verde. Mesma classe do `semanaComecaNoDomingo`, que perdeu o
 * agrupamento do histórico porque o cálculo passava por `dayOfWeek`:
 * **guard de forma erra quando a forma muda.**
 *
 * ⚠️ Não basta acusar toda variável que toca `display_name` — isso reprovaria
 * o consumo CORRETO, que é a outra metade do guard falso. Medido: o filtro de
 * busca faz `.toLowerCase()` e não exibe; o ranking usa o nome só para extrair
 * iniciais; e o `ChatDirectScreen` guarda o nome no estado e mascara na hora
 * de renderizar. Os três são certos.
 *
 * Por isso a regra tem TRÊS partes: a variável recebe o nome, é interpolada em
 * JSX neste arquivo, e essa interpolação não passa por `publicDisplayName`.
 */
/** Passagem de dado, não exibição — não é o alvo do guard. */
const ehPassagemDeDado = (trecho: string): boolean =>
  /(display_name|displayName)\s*:/.test(trecho) || /senderName|photo_url/.test(trecho)

/**
 * Consumo que NÃO é exibição do nome — cada entrada com o motivo, e a lista só
 * encolhe. Existe porque um source-guard não conhece escopo: as duas variáveis
 * abaixo se chamam como variáveis de exibição em OUTROS blocos do mesmo
 * arquivo, e a busca textual não distingue os escopos.
 *
 * Reprovar aqui seria a outra metade do guard falso — proibir o consumo certo.
 */
const NAO_E_EXIBICAO = [
  // Chave de comparação do campo de busca. `.toLowerCase()` alimenta um
  // `.includes()`; o que a lista mostra é mascarado no ponto de exibição.
  'const name = safeString(p.display_name).toLowerCase()',
  // Só as INICIAIS do avatar do ranking. O nome completo nunca chega à tela
  // por esta variável — e uma inicial não publica endereço de ninguém.
  'const initials = entry.displayName.split(',
]

const ATRIBUICAO = /(?:const|let|var)\s+(\w+)\s*=\s*([^\n;]*\b(?:display_name|displayName)\b[^\n;]*)/g

/** A variável vai para a tela em algum ponto do arquivo? */
const chegaNaTela = (src: string, nome: string): boolean =>
  new RegExp(`[={]\\s*${nome}\\s*[}]|=\\{${nome}\\}`).test(src)

/** …e alguém a mascara antes de exibir? */
const jaMascarada = (src: string, nome: string): boolean =>
  new RegExp(`publicDisplayName\\([^)]*\\b${nome}\\b`).test(src)

describe('nome alheio nas superfícies sociais', () => {
  it('nenhum display_name cru chega à tela', () => {
    const crus: string[] = []
    for (const rel of SOCIAIS) {
      const src = readFileSync(rel, 'utf8')
      for (const m of src.matchAll(NOME_NA_TELA)) {
        const t = m[0]
        if (t.includes('publicDisplayName') || ehPassagemDeDado(t)) continue
        crus.push(`${rel}: ${t.replace(/\s+/g, ' ').slice(0, 70)}`)
      }
      for (const m of src.matchAll(ATRIBUICAO)) {
        const [trecho, nome, valor] = m
        if (valor.includes('publicDisplayName') || ehPassagemDeDado(valor)) continue
        if (NAO_E_EXIBICAO.some((ok) => trecho.replace(/\s+/g, ' ').includes(ok))) continue
        if (!chegaNaTela(src, nome) || jaMascarada(src, nome)) continue
        crus.push(`${rel}: ${trecho.replace(/\s+/g, ' ').slice(0, 70)}`)
      }
    }
    expect(
      crus,
      '9 de 58 perfis têm o e-mail salvo em display_name. Use publicDisplayName ' +
        '— o handle identifica sem publicar onde escrever para a pessoa.',
    ).toEqual([])
  })

  it('todas as superfícies sociais importam o leitor', () => {
    const sem = SOCIAIS.filter((rel) => !readFileSync(rel, 'utf8').includes('publicDisplayName'))
    expect(sem).toEqual([])
  })

  it('a lista de sociais não encolhe sem alguém notar', () => {
    expect(SOCIAIS.length).toBeGreaterThanOrEqual(6)
  })
})
