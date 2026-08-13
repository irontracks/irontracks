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
]

/** Interpolação JSX que leva nome para a tela (ou para o leitor de tela). */
const NOME_NA_TELA = /\{[^{}]{0,90}?(display_name|displayName)[^{}]{0,70}?\}/g

/** Passagem de dado, não exibição — não é o alvo do guard. */
const ehPassagemDeDado = (trecho: string): boolean =>
  /(display_name|displayName)\s*:/.test(trecho) || /senderName|photo_url/.test(trecho)

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
    expect(SOCIAIS.length).toBeGreaterThanOrEqual(5)
  })
})
