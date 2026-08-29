/**
 * O rótulo de papel mostrado sob o nome, no menu do avatar.
 *
 * Era `isCoach ? 'Coach' : role === 'admin' ? 'Admin' : null` — exclusivo, e com
 * `isCoach` testado primeiro. No IronTracks o admin normalmente TAMBÉM dá aula,
 * então quem tinha os dois papéis via "Coach" e nunca "Admin": o papel de maior
 * alcance ficava invisível justamente para quem o tem.
 *
 * Os dois são verdade ao mesmo tempo, e o menu abaixo já oferece as duas portas
 * ("Área do professor" e "Painel de Controle"). O rótulo passa a dizer os dois.
 */

export interface PapelDoUsuario {
    /** `profiles.role` — 'admin', 'teacher', 'student'… */
    role?: string | null
    /** Se o usuário atende alunos. */
    isCoach?: boolean
}

/** Separador entre papéis. */
export const SEPARADOR_DE_PAPEL = ' · '

/**
 * Devolve o rótulo, ou `null` quando não há papel a anunciar (aluno comum —
 * mostrar "Aluno" seria ruído: é o caso default do app).
 *
 * Admin vem primeiro: é o de maior alcance, e é o que explica por que o menu
 * tem itens que os outros não têm.
 */
export function rotuloDePapel({ role, isCoach }: PapelDoUsuario): string | null {
    const papeis: string[] = []
    if (String(role ?? '').toLowerCase().trim() === 'admin') papeis.push('Admin')
    if (isCoach) papeis.push('Coach')
    return papeis.length ? papeis.join(SEPARADOR_DE_PAPEL) : null
}
