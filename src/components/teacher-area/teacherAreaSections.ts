import { Home, Users, Dumbbell, Wallet, ListChecks, BookOpen, type LucideIcon } from 'lucide-react';

/**
 * Navegação da Área do professor. Vocabulário de coaching, próprio — NÃO reusa
 * ADMIN_CATEGORIES (que é sabor admin). Cada `key` é um `tab` que o
 * useAdminPanelController já entende; o shell só apresenta os mesmos componentes
 * de tab numa casca de coach. Ao adicionar seções nas próximas fases (Agenda,
 * Conversas), acrescente aqui.
 */
export interface TeacherSection {
    key: string;
    label: string;
    Icon: LucideIcon;
}

/** Seções fixas na barra inferior (as mais usadas no dia a dia do coach). */
export const TEACHER_PRIMARY_SECTIONS: TeacherSection[] = [
    { key: 'dashboard', label: 'Início', Icon: Home },
    { key: 'students', label: 'Alunos', Icon: Users },
    { key: 'templates', label: 'Treinos', Icon: Dumbbell },
    { key: 'billing', label: 'Financeiro', Icon: Wallet },
];

/** Seções secundárias, acessíveis pelo botão "Mais". */
export const TEACHER_MORE_SECTIONS: TeacherSection[] = [
    { key: 'priorities', label: 'Prioridades', Icon: ListChecks },
    { key: 'guide', label: 'Guia', Icon: BookOpen },
];

export const TEACHER_ALL_SECTIONS: TeacherSection[] = [
    ...TEACHER_PRIMARY_SECTIONS,
    ...TEACHER_MORE_SECTIONS,
];

/** Todos os tabs que a Área do professor conhece (para validar o tab ativo). */
export const TEACHER_SECTION_KEYS = new Set(TEACHER_ALL_SECTIONS.map((s) => s.key));

/** Rótulo humano de um tab (fallback 'Início'). */
export function labelForSection(key: string): string {
    return TEACHER_ALL_SECTIONS.find((s) => s.key === key)?.label ?? 'Início';
}

/** true se o tab pertence ao grupo "Mais" (para destacar o botão). */
export function isMoreSection(key: string): boolean {
    return TEACHER_MORE_SECTIONS.some((s) => s.key === key);
}
