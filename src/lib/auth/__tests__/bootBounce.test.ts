/**
 * Guards do freio de ricochete do boot.
 *
 * O bug original: `/` mandava para `/dashboard` (marca `it.logged_in`, que nunca
 * expira) e `/dashboard` devolvia para `/?next=/dashboard` (sessão inválida).
 * Ping-pong infinito, uma navegação completa por volta — o iPhone piscava na
 * tela de carregamento e só reinstalar resolvia.
 *
 * Provado por mutação (ver o teste de fiação do middleware no fim do arquivo):
 * tirar a guarda `!bouncedFromDashboard` do middleware, ou trocar `tripped` por
 * `false` nos hooks, deixa estes testes vermelhos.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  registerBounce,
  readBounce,
  resetBounce,
  parseBounce,
  decideBootRedirect,
  BOUNCE_KEY,
  BOUNCE_WINDOW_MS,
  MAX_BOUNCES,
  type BounceStorage,
} from '../bootBounce'

const makeStore = (initial: Record<string, string> = {}): BounceStorage & { dump: () => Record<string, string> } => {
  const data: Record<string, string> = { ...initial }
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v },
    removeItem: (k: string) => { delete data[k] },
    dump: () => ({ ...data }),
  }
}

const ROOT = join(__dirname, '..', '..', '..', '..')
const readSource = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/**
 * Reduz ao código EXECUTÁVEL: comentário e string somem. Sem isto um
 * source-guard casa com a própria documentação que explica o padrão proibido —
 * um dos jeitos conhecidos de escrever guard falso neste repo.
 */
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')

describe('bootBounce — contagem', () => {
  it('a primeira volta não trava nada', () => {
    const store = makeStore()
    const r = registerBounce(store, 1_000)
    expect(r).toEqual({ count: 1, tripped: false })
  })

  it('trava só DEPOIS de MAX_BOUNCES voltas na janela', () => {
    const store = makeStore()
    const t0 = 1_000
    // Literais de propósito: assertar contra a própria constante seria
    // tautológico (baixar MAX_BOUNCES mudaria a expectativa junto).
    expect(registerBounce(store, t0).tripped).toBe(false)
    expect(registerBounce(store, t0 + 100).tripped).toBe(false)
    expect(registerBounce(store, t0 + 200)).toEqual({ count: 3, tripped: true })
    expect(MAX_BOUNCES).toBe(2)
  })

  it('volta fora da janela recomeça a contagem — boot são não herda o loop de ontem', () => {
    const store = makeStore()
    const t0 = 1_000
    registerBounce(store, t0)
    registerBounce(store, t0 + 100)
    const later = registerBounce(store, t0 + BOUNCE_WINDOW_MS + 1)
    expect(later).toEqual({ count: 1, tripped: false })
  })

  it('sem storage não trava o redirecionamento (storage bloqueado ≠ loop)', () => {
    expect(registerBounce(null, 1_000)).toEqual({ count: 0, tripped: false })
  })

  it('entrada corrompida no storage vira contagem zerada, não NaN', () => {
    expect(parseBounce('lixo|lixo')).toEqual({ t: 0, c: 0 })
    expect(parseBounce(null)).toEqual({ t: 0, c: 0 })
    const store = makeStore({ [BOUNCE_KEY]: 'lixo|lixo' })
    expect(registerBounce(store, 5_000)).toEqual({ count: 1, tripped: false })
  })

  it('readBounce observa sem contar', () => {
    const store = makeStore()
    registerBounce(store, 1_000)
    expect(readBounce(store, 1_100).count).toBe(1)
    expect(readBounce(store, 1_200).count).toBe(1)
  })

  it('readBounce esquece ricochete velho — o socorro não aparece num boot são', () => {
    const store = makeStore()
    registerBounce(store, 1_000)
    expect(readBounce(store, 1_000 + BOUNCE_WINDOW_MS + 1).count).toBe(0)
  })

  it('resetBounce zera de verdade', () => {
    const store = makeStore()
    registerBounce(store, 1_000)
    registerBounce(store, 1_100)
    resetBounce(store)
    expect(store.dump()[BOUNCE_KEY]).toBeUndefined()
    expect(registerBounce(store, 1_200)).toEqual({ count: 1, tripped: false })
  })

  it('storage que lança em toda operação não derruba o boot', () => {
    const hostile: BounceStorage = {
      getItem: () => { throw new Error('bloqueado') },
      setItem: () => { throw new Error('bloqueado') },
      removeItem: () => { throw new Error('bloqueado') },
    }
    expect(() => registerBounce(hostile, 1_000)).not.toThrow()
    expect(() => readBounce(hostile, 1_000)).not.toThrow()
    expect(() => resetBounce(hostile)).not.toThrow()
  })
})

describe('bootBounce — decisão do boot', () => {
  it('servidor confirma a sessão → sobe', () => {
    expect(decideBootRedirect({ tripped: false, ping: 'alive' })).toBe('enter')
  })

  it('servidor recusa a sessão → fica no login (era aqui que o loop nascia)', () => {
    expect(decideBootRedirect({ tripped: false, ping: 'dead' })).toBe('show-login')
  })

  it('sem rede → sobe otimista; offline não é sessão inválida', () => {
    expect(decideBootRedirect({ tripped: false, ping: 'unknown' })).toBe('enter-optimistic')
  })

  it('ricochete vence até um ping vivo — é o caminho da sessão válida que não hidrata', () => {
    expect(decideBootRedirect({ tripped: true, ping: 'alive' })).toBe('show-login')
    expect(decideBootRedirect({ tripped: true, ping: 'unknown' })).toBe('show-login')
  })
})

describe('fiação — os dois lados do ping-pong usam o freio', () => {
  // O middleware foi ativado em 11/08/2026 (mudou de lugar, da raiz para
  // `src/`) SEM o atalho `/` → `/dashboard` que existia na versão morta. Aquele
  // atalho subia só por VER um cookie, sem conferir se valia, e o dashboard
  // devolvia — ping-pong de SERVIDOR, que nenhum contador do cliente alcança
  // porque nenhum JS chega a rodar. Este guard impede que ele volte junto.
  it('o middleware não tem atalho da raiz para o dashboard', () => {
    const src = codeOnly(readSource('src/middleware.ts'))
    expect(src).not.toMatch(/pathname === ''/)
    expect(src).not.toMatch(/pathname = ''/)
  })

  it('a raiz confere a sessão no servidor antes de subir', () => {
    const src = codeOnly(readSource('src/hooks/useLoginScreen.ts'))
    expect(src).toMatch(/decideBootRedirect/)
    expect(src).toMatch(/registerBounce/)
    // Não pode existir um replace para /dashboard solto no restore de sessão.
    expect(src).toMatch(/clearBoundLoginMark/)
  })

  it('o dashboard para de expulsar quando o freio dispara', () => {
    const src = codeOnly(readSource('src/hooks/useAppEffects.ts'))
    expect(src).toMatch(/registerBounce/)
    expect(src).toMatch(/if \(tripped\)/)
    // Boot saudável precisa zerar o contador, senão o freio pega um boot são.
    expect(src).toMatch(/resetBounce/)
  })

  it('o socorro do LoadingScreen lê o contador que sobrevive à recarga', () => {
    const src = codeOnly(readSource('src/components/LoadingScreen.tsx'))
    expect(src).toMatch(/readBounce/)
    expect(src).toMatch(/setStuck\(true\)/)
  })

  it('o freio nunca apaga cookie de sessão — derrubaria usuário legítimo em rede ruim', () => {
    const src = codeOnly(readSource('src/lib/auth/bootBounce.ts'))
    expect(src).not.toMatch(/document\.cookie/)
  })
})
