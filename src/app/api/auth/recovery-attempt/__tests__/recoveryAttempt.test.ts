import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * "Pedi o e-mail de recuperação e não chegou" (06/08/2026).
 *
 * A investigação mostrou que o Supabase NUNCA tinha sido acionado para aquela
 * conta: `recovery_sent_at` nulo e zero `user_recovery_requested` no histórico —
 * o endereço digitado não era o do cadastro. O `resetPasswordForEmail` responde
 * sucesso mesmo para e-mail inexistente (proteção contra enumeração de contas),
 * então ninguém — nem o usuário, nem o dono — tinha como saber disso.
 *
 * Esta rota é o registro que faltava. O que ela NÃO pode fazer é desmanchar a
 * proteção: de fora, um e-mail cadastrado e um inventado precisam ser
 * indistinguíveis. O `matched` vai só para o banco.
 */

const inserts: Record<string, unknown>[] = []
let emailCadastrado = 'existe@irontracks.com.br'
let rateLimitOk = true

vi.mock('@/utils/rateLimit', () => ({
  checkRateLimitAsync: async () => ({ allowed: rateLimitOk, retryAfterSeconds: 60 }),
  getRequestIp: () => '127.0.0.1',
}))
vi.mock('@/lib/logger', () => ({ logError: () => undefined, logWarn: () => undefined }))
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, value: string) => ({
          maybeSingle: async () => ({
            data: value === emailCadastrado ? { id: 'user-1' } : null,
            error: null,
          }),
        }),
      }),
      insert: async (row: Record<string, unknown>) => { inserts.push({ table, ...row }); return { error: null } },
    }),
  }),
}))

const post = async (body: unknown) => {
  const { POST } = await import('../route')
  const res = await POST(new Request('http://localhost/api/auth/recovery-attempt', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'jsdom-test' },
    body: JSON.stringify(body),
  }))
  return { status: res.status, json: await res.json() as Record<string, unknown> }
}

beforeEach(() => {
  inserts.length = 0
  rateLimitOk = true
  emailCadastrado = 'existe@irontracks.com.br'
})

describe('a resposta não revela se a conta existe', () => {
  it('e-mail cadastrado e e-mail inventado respondem EXATAMENTE a mesma coisa', async () => {
    const cadastrado = await post({ email: 'existe@irontracks.com.br' })
    const inventado = await post({ email: 'naoexiste@qualquer.com' })
    expect(cadastrado).toEqual(inventado)
    expect(cadastrado.json).toEqual({ ok: true })
  })

  it('a resposta nunca carrega o `matched`', async () => {
    const { json } = await post({ email: 'existe@irontracks.com.br' })
    expect(Object.keys(json)).toEqual(['ok'])
  })
})

describe('o que fica no banco responde "por que não chegou"', () => {
  it('e-mail fora do cadastro grava matched=false', async () => {
    await post({ email: 'typo@icloud.com' })
    expect(inserts).toHaveLength(1)
    expect(inserts[0]!.table).toBe('audit_events')
    expect(inserts[0]!.action).toBe('password_recovery_requested')
    expect((inserts[0]!.metadata as Record<string, unknown>).matched).toBe(false)
    expect(inserts[0]!.actor_id).toBeNull()
  })

  it('e-mail cadastrado grava matched=true e o dono da conta', async () => {
    await post({ email: 'existe@irontracks.com.br' })
    expect((inserts[0]!.metadata as Record<string, unknown>).matched).toBe(true)
    expect(inserts[0]!.actor_id).toBe('user-1')
  })

  it('o e-mail é normalizado — senão "Fulano@X" e "fulano@x" viram casos diferentes', async () => {
    await post({ email: '  EXISTE@IronTracks.com.BR ' })
    expect(inserts[0]!.actor_email).toBe('existe@irontracks.com.br')
    expect((inserts[0]!.metadata as Record<string, unknown>).matched).toBe(true)
  })
})

describe('telemetria nunca derruba um fluxo de senha', () => {
  it('corpo inválido responde ok e não grava', async () => {
    const { status, json } = await post({ email: 'isso-nao-e-email' })
    expect(status).toBe(200)
    expect(json).toEqual({ ok: true })
    expect(inserts).toHaveLength(0)
  })

  it('rate limit responde ok (nunca um 429 na cara de quem perdeu a senha)', async () => {
    rateLimitOk = false
    const { status, json } = await post({ email: 'existe@irontracks.com.br' })
    expect(status).toBe(200)
    expect(json).toEqual({ ok: true })
    expect(inserts).toHaveLength(0)
  })
})

describe('a tela parou de afirmar que enviou', () => {
  const hook = readFileSync('src/hooks/useLoginScreen.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('a mensagem é condicional, não uma promessa', () => {
    expect(hook).toMatch(/Se existir uma conta com esse e-mail/)
    expect(hook).not.toMatch(/E-mail de recuperação enviado/)
  })

  it('registra a tentativa, sem deixar a telemetria quebrar a tela', () => {
    expect(hook).toMatch(/apiAuth\.logRecoveryAttempt\(email\)\.catch\(\(\) => \{ \}\)/)
  })

  it('continua no modo `recover` — voltar pro login escondia a saída do código', () => {
    // Ancorado no envio em si: `authMode === 'recover'` também aparece na conta do cooldown.
    const bloco = hook.slice(hook.indexOf('resetPasswordForEmail'), hook.indexOf("authMode === 'recover_code'"))
    expect(bloco).not.toMatch(/setAuthMode\('login'\)/)
  })
})

describe('o caminho do código de recuperação deixou de ser beco sem saída', () => {
  /*
   * O app já tinha a VERIFICAÇÃO (`/api/auth/recovery-code`) e o link na tela de
   * login, mas nenhuma tela chamava a RPC que GERA os códigos: a tabela
   * `password_recovery_codes` estava vazia no projeto inteiro. O link levava a
   * uma tela onde ninguém tinha o que digitar.
   */
  const settings = readFileSync('src/components/SettingsModal.tsx', 'utf8')
  const login = readFileSync('src/components/LoginScreen.tsx', 'utf8')

  it('as Configurações geram os códigos', () => {
    expect(settings).toMatch(/rpc\('create_recovery_codes', \{ p_count: 8 \}\)/)
  })

  it('avisa que os códigos aparecem uma vez só — o banco guarda só o hash', () => {
    expect(settings).toMatch(/não aparecem de novo/i)
  })

  it('a tela de login não promete mais um código que a pessoa talvez nunca tenha gerado', () => {
    expect(login).not.toMatch(/código de recuperação gerado nas configurações para redefinir/)
    expect(login).toMatch(/Sem tê-los gerado antes, este caminho não funciona/)
  })
})
