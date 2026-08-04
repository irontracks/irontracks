import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Ratchet: quem ainda lê `user_settings` direto.
 *
 * `user_settings.preferences` é lido em ~20 lugares, cada um com o seu próprio
 * fallback quando um campo falta. Migrar todos de uma vez seria um PR impossível de
 * revisar, então a lista abaixo é o retrato do débito — e ela só pode ENCOLHER:
 *
 *  - arquivo NOVO lendo direto → teste vermelho (use `buildUserSnapshot`);
 *  - arquivo migrado que sai da leitura → teste vermelho até ser removido da lista.
 *
 * O segundo caso é de propósito: sem ele a lista viraria papel de parede e o débito
 * ficaria congelado com cara de resolvido. Mesmo mecanismo do teto de payload do
 * histórico.
 *
 * Não trava rota administrativa nem escrita — trava a LEITURA do perfil para decidir
 * algo, que é onde a divergência silenciosa nasce.
 */

const SRC = join(__dirname, '..', '..', '..')
const PADRAO = /from\(\s*['"]user_settings['"]\s*\)/

/** O dono legítimo da leitura — não faz parte do débito. */
const LEITOR_UNICO = 'lib/user/snapshot.ts'

const DEBITO: readonly string[] = [
  // Nutrição/coach: candidatos naturais aos próximos PRs — já existe setor no snapshot.
  'actions/nutrition-actions.ts',
  'app/api/ai/vip-coach/route.ts',
  'app/api/ai/workout-wizard/route.ts',
  'app/api/calories/estimate/route.ts',
  // Notificações e push: leem preferências de canal/horário, não o perfil físico.
  // Precisariam de um setor `notifications` no snapshot antes de migrar.
  'app/api/cron/streak-at-risk/route.ts',
  'app/api/notifications/appointment-created/route.ts',
  'app/api/notifications/direct-message/route.ts',
  'app/api/notifications/workout-assigned/route.ts',
  'app/api/social/follow/route.ts',
  'lib/push/sender.ts',
  'lib/social/notifyFollowers.ts',
  'lib/social/workoutNotifications.ts',
  // Administrativo (LGPD, painel do professor/admin): leem a linha inteira de
  // propósito — exportar/apagar/inspecionar não é "resolver um fato do usuário".
  'app/api/account/delete/route.ts',
  'app/api/account/export/route.ts',
  'app/api/admin/students/settings/route.ts',
  'app/api/admin/teachers/inbox/route.ts',
  'app/api/teacher/inbox/feed/route.ts',
  'components/admin-panel/hooks/useAdminPriorities.ts',
  // Infra de settings no client: `useUserSettings` é a porta de escrita/leitura das
  // preferências no app; o snapshot resolve fatos, não substitui o CRUD.
  'hooks/useUserSettings.ts',
  'hooks/useGuidedTour.ts',
]

function varrer(dir: string, out: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (entrada.name === '__tests__' || entrada.name === 'node_modules') continue
      varrer(caminho, out)
    } else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
      out.push(caminho)
    }
  }
  return out
}

const leitores = varrer(SRC)
  .filter((f) => PADRAO.test(readFileSync(f, 'utf8')))
  .map((f) => relative(SRC, f).split(/[\\/]/).join('/'))
  .filter((f) => f !== LEITOR_UNICO)
  .sort()

describe('ratchet — leitura direta de user_settings', () => {
  it('a varredura encontra os leitores (se zerar, o padrão quebrou, não o débito)', () => {
    expect(leitores.length).toBeGreaterThan(0)
  })

  it('nenhum arquivo NOVO lê direto — fatos do usuário vêm do buildUserSnapshot', () => {
    const novos = leitores.filter((f) => !DEBITO.includes(f))
    expect(novos).toEqual([])
  })

  it('a lista só encolhe: entrada que não lê mais precisa sair daqui', () => {
    const obsoletas = DEBITO.filter((f) => !leitores.includes(f))
    expect(obsoletas).toEqual([])
  })

  it('a página e o overlay de nutrição não voltam para a lista', () => {
    // As duas superfícies que o CLAUDE.md manda manter em sincronia — foram as
    // primeiras a sair do débito (PRs #667 e este).
    expect(leitores).not.toContain('app/(app)/dashboard/nutrition/page.tsx')
    expect(leitores).not.toContain('components/dashboard/nutrition/NutritionOverlay.tsx')
  })
})
