import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Pedidos do dono (05/08/2026) sobre o visualizador de stories:
 *   1. "deixar a sequência igual do Instagram: primeiro as mais antigas".
 *   2. "a barra que corre do tempo do story está meio que travando, e isso dá a
 *      sensação de app amador".
 *
 * Os dois são de arquivos diferentes (rota de listagem e viewer) e por isso ficam
 * juntos aqui: é a mesma experiência.
 */

const listRoute = readFileSync('src/app/api/social/stories/list/route.ts', 'utf8')
const viewer = readFileSync('src/components/stories/StoryViewer.tsx', 'utf8')

/** Invariante se mede em código, não na prosa que o explica. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('1. ordem cronológica dentro do grupo (igual Instagram)', () => {
  it('a lista do grupo é invertida na montagem', () => {
    // A query precisa continuar DESC (o limite tem que pegar os mais recentes);
    // quem inverte é a montagem do grupo.
    expect(code(listRoute)).toContain(".order('created_at', { ascending: false })")
    expect(code(listRoute)).toMatch(/g\.stories\s*:\s*\[\]\)\.slice\(\)\.reverse\(\)/)
  })

  it('o grupo devolve a lista já invertida, não a original', () => {
    // Sem repassar `stories: storiesArr`, o spread `...g` devolveria a ordem antiga
    // e a inversão viraria letra morta.
    const bloco = code(listRoute).slice(code(listRoute).indexOf('const groups ='))
    expect(bloco).toMatch(/\.\.\.g,\s*stories: storiesArr,/)
  })

  it('`latestAt` passa a ler o ÚLTIMO item — senão a barra desordena', () => {
    /*
     * `latestAt` ordena os GRUPOS na barra (mais recente primeiro). Depois da
     * inversão, `[0]` é o story MAIS ANTIGO: mantê-lo colocaria quem postou há
     * 23 h à frente de quem postou agora.
     */
    expect(code(listRoute)).toMatch(/storiesArr\[storiesArr\.length - 1\]\?\.createdAt/)
    expect(code(listRoute)).not.toMatch(/latestAt: storiesArr\.length \? String\(storiesArr\[0\]/)
  })
})

describe('2. a barra de progresso do vídeo corre a 60 fps', () => {
  it('usa requestAnimationFrame', () => {
    /*
     * O bloco DIZIA "RAF loop" e não tinha um `requestAnimationFrame` sequer:
     * atualizava no evento `timeupdate`, que dispara a ~4×/s (perto de 250 ms no
     * Safari/iOS). A barra andava aos saltos.
     */
    expect(code(viewer)).toContain('requestAnimationFrame(tick)')
    expect(code(viewer)).toContain('cancelAnimationFrame(raf)')
  })

  it('não volta a depender de `timeupdate` para desenhar', () => {
    expect(code(viewer)).not.toContain("addEventListener('timeupdate'")
  })

  it('mantém `durationchange` — sem duração o desenho nem começa', () => {
    // `update()` sai cedo quando `duration <= 0`, e a duração só chega com os
    // metadados. Tirar este listener deixaria a barra parada no início.
    expect(code(viewer)).toContain("addEventListener('durationchange', update)")
  })
})

describe('abre no primeiro story não visto', () => {
  it('o índice inicial pula o que já foi visto', () => {
    /*
     * Com a ordem cronológica, começar sempre em 0 obrigaria o usuário a
     * reassistir tudo que já viu para chegar no story novo do amigo.
     */
    expect(code(viewer)).toMatch(/findIndex\(\(s\) => s\?\.viewed !== true\)/)
    expect(code(viewer)).not.toMatch(/const \[idx, setIdx\] = useState\(0\)/)
  })

  it('tudo visto volta ao início (para rever)', () => {
    expect(code(viewer)).toMatch(/first >= 0 \? first : 0/)
  })
})

describe('3. auditoria: curtidas, emojis e mensagens não podem falhar em silêncio', () => {
  /*
   * Auditoria pedida pelo dono. Todo achado abaixo foi confirmado no código antes
   * de virar guard — e os três eram do mesmo tipo: a ação parecia ter dado certo
   * na tela e não tinha acontecido no servidor.
   */

  it('a reação de emoji CHECA a resposta — `fetch` não rejeita em 4xx/5xx', () => {
    /*
     * Era `fetch(...)` cru com `catch {}` vazio. Como `fetch` só rejeita em erro
     * de REDE, um 403 (a RLS barra quem não pode ver o story), 429 ou 500 passava
     * como sucesso: emoji fixado + "Reação enviada!" com o banco intacto.
     */
    expect(code(viewer)).toMatch(/if \(!res\.ok \|\| !json\?\.ok\) throw/)
  })

  it('a reação REVERTE quando o servidor recusa', () => {
    expect(code(viewer)).toMatch(/const previous = myReaction/)
    expect(code(viewer)).toMatch(/setMyReaction\(previous\)/)
  })

  it('o envio de comentário devolve o texto ao campo quando falha', () => {
    // O campo é limpo ANTES do envio; sem devolver, a mensagem do usuário sumia.
    expect(code(viewer)).toMatch(/setCommentText\(text\)/)
    expect(code(viewer)).not.toMatch(/\} catch \{ \} finally \{\s*setSendingComment/)
  })

  it('os erros de listagem deixaram de ser estado morto', () => {
    // `_commentsError` e `_viewersError` eram escritos e nunca renderizados: falha
    // virava "Nada por aqui ainda.", indistinguível de lista vazia de verdade.
    expect(code(viewer)).not.toMatch(/_commentsError|_viewersError/)
    expect(code(viewer)).toMatch(/\{commentsError\}/)
    expect(code(viewer)).toMatch(/\{viewersError\}/)
  })

  it('"Nada por aqui ainda" não aparece quando houve ERRO', () => {
    expect(code(viewer)).toMatch(/!viewersLoading && !viewersError/)
    expect(code(viewer)).toMatch(/!commentsLoading && !commentsError/)
  })

  it('descurtir limpa a reação — as duas moram na MESMA linha do banco', () => {
    /*
     * `react` faz upsert em `social_story_likes` com o emoji; `like:false` faz
     * DELETE da linha inteira. Descurtir apaga a reação no servidor, e a tela
     * seguia mostrando o emoji fixado até o próximo carregamento.
     */
    expect(code(viewer)).toMatch(/if \(!nextLiked && previousReaction\) setMyReaction\(null\)/)
    expect(code(viewer)).toMatch(/setMyReaction\(previousReaction\)/)
  })

  it('trocar de story limpa comentários e rascunho', () => {
    // Rascunho não enviado seguia no campo do story seguinte, pronto para ir para
    // o story errado.
    const reset = code(viewer).slice(code(viewer).indexOf('setViewers([])'))
    expect(reset).toContain('setComments([])')
    expect(reset).toContain("setCommentText('')")
  })
})
