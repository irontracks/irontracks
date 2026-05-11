/**
 * adminPanelTabs.ts
 *
 * Mapping centralizado entre o `tab` key (string usada pelo controller)
 * e a nova estrutura de navegação por categorias com bottom tabs.
 *
 * Decisão de design
 * ─────────────────
 * Em vez de 14 botões de tab num menu vertical, agrupamos em 4
 * categorias visíveis no bottom tab bar (mobile-first):
 *
 *   home     → Dashboard (1 tab)
 *   students → Alunos / Solicitações / Professores (3 tabs)
 *   content  → Treinos / Vídeos / VIP / VIP Reports (4 tabs)
 *   more     → Cobranças / Prioridades / Plataforma / Feedback / Sistema / Guia (6 tabs)
 *
 * O controller continua usando a mesma `tab` string que sempre usou —
 * só o shell de navegação muda. Compatibilidade 100%.
 */

import type {
  LucideIcon,
} from 'lucide-react'
import {
  Home,
  Users,
  Library,
  MoreHorizontal,
  Crown,
  UserPlus,
  UserCog,
  AlertCircle,
  Dumbbell,
  Play,
  TrendingUp,
  MessageSquare,
  Settings,
  CreditCard,
  BookOpen,
  Activity,
} from 'lucide-react'

export type AdminCategory = 'home' | 'students' | 'content' | 'more'

export interface CategoryDef {
  id: AdminCategory
  label: string
  icon: LucideIcon
  /** Tab keys que pertencem a essa categoria, na ordem de exibição como chips */
  tabKeys: string[]
}

/**
 * Source-of-truth das 4 categorias. A ordem dos tabKeys é a ordem
 * em que os chips aparecem no topo do conteúdo.
 */
export const ADMIN_CATEGORIES: readonly CategoryDef[] = [
  {
    id: 'home',
    label: 'Início',
    icon: Home,
    tabKeys: ['dashboard'],
  },
  {
    id: 'students',
    label: 'Alunos',
    icon: Users,
    // Ordem reflete o uso real: lista de alunos primeiro, solicitações
    // (alta visibilidade quando há pendência), depois professores.
    tabKeys: ['students', 'requests', 'teachers'],
  },
  {
    id: 'content',
    label: 'Conteúdo',
    icon: Library,
    // 'vip_reports' foi mesclado em 'vip' (VipTabUnified com toggle interno).
    tabKeys: ['templates', 'videos', 'vip'],
  },
  {
    id: 'more',
    label: 'Mais',
    icon: MoreHorizontal,
    // 'platform_billing' mesclado em 'billing' (FinanceTabUnified).
    // 'acquisition' é um link pra página /admin/acquisition (page SSR
    // mais pesada, mantida fora do shell modal).
    tabKeys: ['priorities', 'billing', 'acquisition', 'crons', 'errors', 'system', 'guide'],
  },
] as const

/**
 * Metadata por tab key — icon + subtitle pra renderização.
 * Reuso do mesmo conjunto que estava em AdminPanelHeader.
 */
export const TAB_META: Record<string, { icon: LucideIcon; subtitle: string }> = {
  dashboard: { icon: Crown, subtitle: 'Resumo e métricas do seu negócio' },
  students: { icon: Users, subtitle: 'Gestão completa dos alunos' },
  requests: { icon: UserPlus, subtitle: 'Pedidos de acesso pendentes' },
  teachers: { icon: UserCog, subtitle: 'Professores e convites' },
  priorities: { icon: AlertCircle, subtitle: 'Triagem inteligente do coach' },
  templates: { icon: Dumbbell, subtitle: 'Biblioteca de treinos-base' },
  videos: { icon: Play, subtitle: 'Vídeos demonstrativos' },
  // 'vip' agora unifica assinantes + relatórios via VipTabUnified
  vip: { icon: Crown, subtitle: 'Assinantes VIP + relatórios' },
  errors: { icon: MessageSquare, subtitle: 'Feedbacks reportados' },
  system: { icon: Settings, subtitle: 'Mensagens em massa e manutenção' },
  // 'billing' agora unifica cobranças dos alunos + cobrança da plataforma
  billing: { icon: CreditCard, subtitle: 'Financeiro — cobranças e plataforma' },
  acquisition: { icon: TrendingUp, subtitle: 'Análise de aquisição (UTM, conversões)' },
  crons: { icon: Activity, subtitle: 'Status dos jobs agendados' },
  guide: { icon: BookOpen, subtitle: 'Manual completo para professores' },
}

/**
 * Retorna a categoria que contém um determinado tab key.
 * Default: 'home' (caso o tab seja desconhecido, o usuário cai no dashboard).
 */
export function categoryForTab(tabKey: string): AdminCategory {
  for (const cat of ADMIN_CATEGORIES) {
    if (cat.tabKeys.includes(tabKey)) return cat.id
  }
  return 'home'
}

/**
 * Retorna o primeiro tab key disponível de uma categoria,
 * filtrado pelos tabs que o usuário tem acesso.
 *
 * Usado quando o usuário toca numa bottom tab: precisamos abrir
 * o "primeiro" tab daquela categoria (ex: ao tocar em "Alunos",
 * abre a sub-tab "Alunos" — não "Solicitações").
 */
export function firstAvailableTabInCategory(
  category: AdminCategory,
  availableTabs: ReadonlySet<string>,
): string | null {
  const def = ADMIN_CATEGORIES.find(c => c.id === category)
  if (!def) return null
  for (const key of def.tabKeys) {
    if (availableTabs.has(key)) return key
  }
  return null
}

/**
 * Lista os tab keys de uma categoria, filtrando os que o usuário tem acesso.
 * Usado pelos chips no topo do conteúdo.
 */
export function visibleTabsForCategory(
  category: AdminCategory,
  availableTabs: ReadonlySet<string>,
): string[] {
  const def = ADMIN_CATEGORIES.find(c => c.id === category)
  if (!def) return []
  return def.tabKeys.filter(k => availableTabs.has(k))
}
