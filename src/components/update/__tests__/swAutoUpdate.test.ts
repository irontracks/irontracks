import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard da atualização automática do service worker.
 *
 * Reportado pelo dono: a cada deploy o app exibia um modal COBRINDO a tela
 * inteira ("Nova versão pronta") que só saía tocando em "Atualizar agora" —
 * um pedágio a cada versão. Agora a atualização é silenciosa.
 *
 * O invariante delicado NÃO é "não ter UI": é não recarregar a página no meio
 * de uma série. Aplicar o update dispara controllerchange -> reload; se isso
 * pegar o usuário treinando, ele perde o contexto sem entender por quê.
 */
const sw = readFileSync(
  join(process.cwd(), 'src/components/ServiceWorkerRegister.tsx'),
  'utf8',
)
const session = readFileSync(
  join(process.cwd(), 'src/hooks/useActiveSession.ts'),
  'utf8',
)

describe('atualização automática do service worker', () => {
  it('não renderiza modal bloqueante — nada de pedágio a cada deploy', () => {
    // O que o dono reclamou foi o modal COBRINDO a tela e travando o app até
    // alguém tocar em "Atualizar agora". A regra original era "markup nenhum",
    // e ela custou caro: quando a atualização ficava adiada por treino ativo,
    // NINGUÉM sabia nem tinha como forçar, e o app passou horas atrás do
    // servidor (ago/2026 — uma sessão inteira de correções testada contra
    // código velho). O invariante de verdade é NÃO BLOQUEAR, não "não existir".
    // Olha só o MARKUP: os comentários do arquivo citam o modal removido para
    // explicar a história, e varrer o texto inteiro daria falso-positivo.
    const jsx = sw.slice(sw.lastIndexOf('return ('))
    expect(jsx).not.toContain('fixed inset-0')     // não cobre a tela
    expect(jsx).not.toMatch(/backdrop|role="dialog"/)
  })

  it('no caso normal segue invisível — o aviso é exceção, não regra', () => {
    expect(sw).toContain("postMessage({ type: 'SKIP_WAITING' })")
    // Sem versão nova travada, o componente não desenha nada.
    expect(sw).toMatch(/if \(!deferredByWorkout \|\| updating\) return null/)
  })

  it('NUNCA recarrega no meio de um treino com o app à vista', () => {
    // A guarda que impede o reload mid-série. Continua valendo: o aviso novo só
    // aplica por TOQUE do usuário, nunca sozinho.
    expect(sw).toContain("dataset.workoutActive === '1'")
    expect(sw).toMatch(/if \(!hidden && workoutInProgress\(\)\) \{ setDeferredByWorkout\(true\); return \}/)
  })

  it('o treino ativo realmente marca o atributo que a guarda lê', () => {
    // Sem esta ponta, a guarda acima leria sempre false e o reload voltaria a
    // acontecer no meio da série.
    expect(session).toContain("dataset.workoutActive = '1'")
    expect(session).toContain('delete document.documentElement.dataset.workoutActive')
  })

  it('reavalia depois — quem estava treinando ainda recebe a versão', () => {
    // Sem reavaliação, adiar por causa do treino viraria "nunca atualiza".
    expect(sw).toContain("addEventListener('visibilitychange', applyIfSafe)")
    expect(sw).toMatch(/setInterval\(applyIfSafe/)
    // E com cleanup (regra fixa do repo).
    expect(sw).toContain("removeEventListener('visibilitychange', applyIfSafe)")
    expect(sw).toMatch(/clearInterval\(retry\)/)
  })
})
