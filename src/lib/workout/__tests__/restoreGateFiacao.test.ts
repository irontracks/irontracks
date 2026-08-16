/**
 * Source-guard da FIAÇÃO do portão de restauração.
 *
 * Por que existe: `staleSession.test.ts` prova a conta e
 * `restoreSessionGate.test.ts` prova o efeito no `localStorage` — e os dois
 * seguiriam VERDES se alguém apagasse a chamada dos hooks, porque nenhum deles
 * exercita quem realmente restaura a sessão no app. É o jeito nº 3 de guard
 * falso do CLAUDE.md: as pontas certas e ninguém ligando os dois.
 *
 * O que se cobra aqui é o consumo REAL (a chamada), nunca só o import: import
 * órfão satisfaz uma busca por nome e não executa nada.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(__dirname, '..', '..', '..', '..')
const ler = (rel: string) => readFileSync(join(raiz, rel), 'utf8')

/** Remove comentários de linha e de bloco — um guard não pode ser satisfeito
 *  pela documentação que explica o próprio guard (jeito nº 2 do CLAUDE.md). */
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('fiação do portão de restauração', () => {
  it('useSessionSync hidrata pelo portão, não lendo o localStorage na mão', () => {
    const src = semComentarios(ler('src/hooks/useSessionSync.ts'))
    expect(src).toMatch(/readRestorableSession\s*\(/)
  })

  it('useLocalPersistence decide a view pelo portão', () => {
    // Sem isto o app abre em /dashboard/active com um treino que o
    // useSessionSync acabou de recusar hidratar: tela de treino sem treino.
    const src = semComentarios(ler('src/hooks/useLocalPersistence.ts'))
    expect(src).toMatch(/readRestorableSession\s*\(/)
  })

  it('nenhum dos dois volta a decidir restauração por "a chave existe"', () => {
    // A regressão concreta: `localStorage.getItem(chave)` seguido de
    // `setView('active')` sem olhar a idade — como era antes do portão.
    const persist = semComentarios(ler('src/hooks/useLocalPersistence.ts'))
    const trechoRestore = persist.slice(0, persist.indexOf('Persist current view'))
    expect(trechoRestore).not.toMatch(/localStorage\.getItem\([^)]*activeSession/)
  })

  it('a UI avisa quando a sessão retomada veio marcada como velha', () => {
    const src = semComentarios(ler('src/components/ActiveWorkout.tsx'))
    expect(src).toMatch(/_staleRestoreAgeMs/)
    expect(src).toMatch(/staleSessionAgeLabel\s*\(/)
  })

  it('o descarte é a ação DESTRUTIVA do diálogo, nunca o padrão do fechamento', () => {
    // O `confirm` resolve `false` ao fechar por fora. Se "descartar" fosse o
    // caminho do false, tocar fora do modal apagaria as séries de um treino em
    // andamento — a mesma inversão que já foi corrigida no rodapé do treino.
    const src = semComentarios(ler('src/components/ActiveWorkout.tsx'))
    const bloco = src.slice(src.indexOf('staleRestoreAgeMs'), src.indexOf('Painel de cardio'))
    expect(bloco).toMatch(/confirmText:\s*'Descartar treino'/)
    expect(bloco).toMatch(/destructive:\s*true/)
    // e o cancelamento continua o treino: só o `true` do confirm cancela a sessão
    expect(bloco).toMatch(/if\s*\(cancelled\s*\|\|\s*!descartar\)\s*return/)
  })

  it('as duas metades da mesma sessão expiram no MESMO prazo', () => {
    // O bug era exatamente esta divergência: IndexedDB expirava em 24 h e o
    // localStorage, em nunca. Se alguém mexer num prazo e esquecer o outro,
    // volta a haver sessão viva num armazenamento e morta no outro.
    const idb = ler('src/lib/offline/activeSessionPersistence.ts')
    const gate = ler('src/lib/workout/staleSession.ts')
    const idbHoras = idb.match(/MAX_SESSION_AGE_MS\s*=\s*(\d+)\s*\*\s*60\s*\*\s*60\s*\*\s*1000/)
    const gateHoras = gate.match(/SESSION_EXPIRED_MS\s*=\s*(\d+)\s*\*\s*60\s*\*\s*60\s*\*\s*1000/)
    expect(idbHoras?.[1]).toBeDefined()
    expect(gateHoras?.[1]).toBeDefined()
    expect(gateHoras?.[1]).toBe(idbHoras?.[1])
  })
})
