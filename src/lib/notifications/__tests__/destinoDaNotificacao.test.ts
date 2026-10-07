import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  destinoDaNotificacao,
  executarDestino,
  rotaInternaDoApp,
  SEM_DESTINO_DE_PROPOSITO,
  tipoTemDecisao,
  type AcoesDoDestino,
} from '../destinoDaNotificacao'

/**
 * O toque numa notificação leva à tela certa — no PUSH e no card do sino.
 *
 * Relato do dono (06/10/2026): "tem muito card que ao clicar só entra no app".
 * O push só navegava quando quem enviou punha um `link`, e quase ninguém punha;
 * o sino tinha a tabela certa, mas o push não a usava.
 */

const acoesEspiao = () => {
  const a = {
    abrirRota: vi.fn(),
    abrirNutricao: vi.fn(),
    abrirMedicamentos: vi.fn(),
    abrirTreinoAtivo: vi.fn(),
    abrirPainelAdmin: vi.fn(),
  } satisfies AcoesDoDestino
  return a
}

const tocar = (n: Parameters<typeof destinoDaNotificacao>[0]) => {
  const a = acoesEspiao()
  const foi = executarDestino(destinoDaNotificacao(n), a)
  return { a, foi }
}

describe('os exemplos do dono: o push sem link chega na tela certa', () => {
  it('remédio abre os medicamentos', () => {
    for (const type of ['medication_reminder', 'medication_updated']) {
      const { a } = tocar({ type })
      expect(a.abrirMedicamentos, type).toHaveBeenCalledTimes(1)
      expect(a.abrirRota, type).not.toHaveBeenCalled()
    }
  })

  it('refeição, água, dieta e meta do dia abrem a Nutrição — a janela, não a página', () => {
    for (const type of ['meal_reminder', 'water_reminder', 'diet_updated', 'daily_goal_hit', 'rest_day']) {
      const { a } = tocar({ type })
      expect(a.abrirNutricao, type).toHaveBeenCalledTimes(1)
      expect(a.abrirRota, type).not.toHaveBeenCalled()
    }
  })

  it('o tipo vence o link: dieta com link da PÁGINA ainda abre a janela', () => {
    // O servidor manda `/dashboard/nutrition` no aviso de dieta; no app essa
    // página não é a aba Nutrição que a pessoa usa.
    const { a } = tocar({ type: 'diet_updated', link: '/dashboard/nutrition' })
    expect(a.abrirNutricao).toHaveBeenCalledTimes(1)
    expect(a.abrirRota).not.toHaveBeenCalled()
  })

  it('movimento social leva à Comunidade', () => {
    for (const type of ['friend_pr', 'story_like', 'follow_request', 'challenge_created', 'workout_finish']) {
      const { a } = tocar({ type })
      expect(a.abrirRota, type).toHaveBeenCalledWith('/dashboard/community')
    }
  })

  it('cutucão de treino leva à lista de treinos', () => {
    for (const type of ['streak_at_risk', 'inactivity', 'pr_close', 'morning_briefing', 'workout_assigned']) {
      const { a } = tocar({ type })
      expect(a.abrirRota, type).toHaveBeenCalledWith('/dashboard')
    }
  })

  it('descanso e controle do professor abrem o treino em andamento', () => {
    for (const type of ['rest_timer', 'teacher_control_request', 'team_chat', 'mentioned_in_chat']) {
      const { a } = tocar({ type })
      expect(a.abrirTreinoAtivo, type).toHaveBeenCalledTimes(1)
    }
  })

  it('admin abre o painel na aba certa', () => {
    expect(tocar({ type: 'admin_new_signup', link: '/admin' }).a.abrirPainelAdmin).toHaveBeenCalledWith('requests')
    expect(tocar({ type: 'admin_vip_expiring' }).a.abrirPainelAdmin).toHaveBeenCalledWith('vip')
  })

  it('mensagem sem remetente leva à lista de conversas', () => {
    expect(tocar({ type: 'message' }).a.abrirRota).toHaveBeenCalledWith('/dashboard/chat')
  })
})

describe('nada tira a pessoa do app', () => {
  it('convite em dupla com o link antigo `/` (hoje a página comercial) fica no app', () => {
    const { a } = tocar({ type: 'team_invite', link: '/' })
    expect(a.abrirRota).toHaveBeenCalledWith('/dashboard')
  })

  it('link externo, `//host`, `/` e `/admin` nunca viram destino', () => {
    for (const link of ['https://evil.com', '//evil.com', '/', '/admin', '/comercial', '', 'dashboard']) {
      expect(rotaInternaDoApp(link), link).toBe('')
      expect(tocar({ type: 'tipo_que_ninguem_conhece', link }).foi, link).toBe(false)
    }
  })

  it('tipo desconhecido com link do app ainda navega (desempate pelo link)', () => {
    expect(tocar({ type: 'tipo_novo', link: '/dashboard/history' }).a.abrirRota).toHaveBeenCalledWith('/dashboard/history')
  })
})

describe('resumo semanal: só abre quando sabe QUAL semana', () => {
  it('pelo metadata (sino) ou pelo link (push)', () => {
    const rota = '/dashboard/report/weekly?week=2026-09-27'
    expect(tocar({ type: 'weekly_recap', metadata: { week_start: '2026-09-27' } }).a.abrirRota).toHaveBeenCalledWith(rota)
    expect(tocar({ type: 'weekly_recap', link: rota }).a.abrirRota).toHaveBeenCalledWith(rota)
    expect(tocar({ type: 'muscle_weekly_insights', link: rota }).a.abrirRota).toHaveBeenCalledWith(rota)
  })

  it('sem a semana não abre — a semana errada é pior que nenhuma', () => {
    expect(tocar({ type: 'weekly_recap' }).foi).toBe(false)
    expect(tocar({ type: 'weekly_recap', link: '/dashboard' }).foi).toBe(false)
  })

  it('o cron grava o link no metadata — é ele que vai no push', () => {
    const cron = readFileSync('src/app/api/cron/weekly-recap/route.ts', 'utf8')
    expect(cron).toMatch(/link:\s*`\/dashboard\/report\/weekly\?week=\$\{encodeURIComponent\(startDay\)\}`/)
  })
})

describe('sem destino é decisão declarada, não esquecimento', () => {
  it('cada um tem motivo e realmente não navega', () => {
    for (const [type, motivo] of Object.entries(SEM_DESTINO_DE_PROPOSITO)) {
      expect(motivo.length, type).toBeGreaterThan(15)
      expect(tocar({ type, link: '/dashboard' }).foi, type).toBe(false)
    }
  })
})

/**
 * Guard de CLASSE: lê os EMISSORES, não uma lista que eu conheço hoje. Tipo de
 * push novo sem decisão aqui reprova — senão volta a "só abrir o app" calado.
 */
describe('todo tipo que o servidor envia tem decisão de destino', () => {
  const ENVIA = /insertNotifications|from\(\s*['"]notifications['"]\s*\)\s*\.insert|notifyFollowers\(|createNotification\(|sendPushToAllPlatforms\(|sendPushToUsers\(|sendApns\(|sendFcmToUsers\(/
  const arquivos: string[] = []
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome)
      if (nome === '__tests__' || nome === 'node_modules') continue
      if (statSync(p).isDirectory()) andar(p)
      else if (/\.(ts|tsx)$/.test(nome)) arquivos.push(p)
    }
  }
  andar('src')

  const enviados = new Map<string, string>()
  for (const arq of arquivos) {
    // Os próprios transportes repassam o `type` que recebem.
    if (/lib\/push\/(apns|fcm|sender)\.ts$/.test(arq)) continue
    const src = readFileSync(arq, 'utf8')
    if (!ENVIA.test(src)) continue
    for (const m of src.matchAll(/\btype:\s*['"]([a-z_]+)['"]/g)) enviados.set(m[1], arq)
  }
  // Tipos montados por VARIÁVEL, que a varredura por literal não enxerga.
  for (const t of ['workout_assigned', 'workout_updated', 'diet_updated', 'medication_updated', 'appointment']) {
    enviados.set(t, '(montado por variável)')
  }

  it('o varredor achou os emissores de verdade', () => {
    expect(enviados.size).toBeGreaterThan(40)
    expect(enviados.has('meal_reminder')).toBe(true)
    expect(enviados.has('rest_timer')).toBe(true)
  })

  it('nenhum tipo enviado fica sem decisão', () => {
    const sem = [...enviados].filter(([t]) => !tipoTemDecisao(t)).map(([t, a]) => `${t} (${a})`)
    expect(sem, `tipos sem destino nem motivo: ${sem.join(', ')}`).toEqual([])
  })
})

describe('fiação: o shell e o sino usam ESTA decisão', () => {
  const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')
  const shell = semComentarios(readFileSync('src/app/app/(app)/dashboard/IronTracksAppClientImpl.tsx', 'utf8'))
  const sino = semComentarios(readFileSync('src/components/NotificationCenter.tsx', 'utf8'))
  const hook = semComentarios(readFileSync('src/hooks/usePushNotifications.ts', 'utf8'))

  it('o roteador do shell executa o destino da tabela', () => {
    const i = shell.indexOf("addEventListener('irontracks:push:navigate'")
    const handler = shell.slice(shell.lastIndexOf('const onPushNavigate', i), i)
    expect(handler).toMatch(/executarDestino\(destinoDaNotificacao\(detail \?\? \{\}\)/)
    expect(handler).toMatch(/abrirNutricao:\s*openNutrition/)
    expect(handler).toMatch(/abrirMedicamentos:\s*\(\)\s*=>\s*setMedicationsOpen\(true\)/)
    expect(handler).toMatch(/abrirRota:\s*\(rota\)\s*=>\s*router\.push\(rota\)/)
    // O fallback cru de link (que aceitava qualquer `/x`) não volta.
    expect(handler).not.toMatch(/router\.push\(link\)/)
  })

  it('o sino não tem tabela própria', () => {
    expect(sino).toMatch(/destinoDaNotificacao\(item\)/)
    expect(sino).not.toMatch(/DESTINO_POR_TIPO|ROTEADOS_PELO_TIPO/)
  })

  it('o hook do push não manda para a PÁGINA da nutrição', () => {
    expect(hook).not.toMatch(/\/dashboard\/nutrition/)
  })
})
