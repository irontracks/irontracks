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
  it('não renderiza mais o modal bloqueante', () => {
    // Asserção sobre JSX, não sobre texto: os comentários do arquivo CITAM o
    // modal removido ("Atualizar agora") pra explicar a mudança, e procurar a
    // frase daria falso-positivo. O que importa é não haver markup nenhum.
    expect(sw).not.toContain('fixed inset-0 z-[3000]')
    expect(sw).not.toMatch(/<div/)
    expect(sw).not.toMatch(/<button/)
    // E o componente devolve null explicitamente.
    expect(sw).toMatch(/\n\s*return null\n\}/)
  })

  it('aplica sozinho, sem depender de clique', () => {
    expect(sw).toContain("postMessage({ type: 'SKIP_WAITING' })")
    // Sem handler de clique — não há mais botão.
    expect(sw).not.toMatch(/onClick=\{applyUpdate\}/)
  })

  it('NUNCA recarrega no meio de um treino com o app à vista', () => {
    // A guarda que impede o reload mid-série.
    expect(sw).toContain("dataset.workoutActive === '1'")
    expect(sw).toMatch(/if \(!hidden && workoutInProgress\(\)\) return/)
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
