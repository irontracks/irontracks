/**
 * libraryScope — de QUEM é a biblioteca de alimentos que este usuário enxerga.
 *
 * A biblioteca (`nutrition_custom_foods`) deixou de ser de uma pessoa só em
 * 07/09/2026: casal que mora junto e faz a mesma dieta cadastra uma vez e vale
 * para os dois (pedido do dono — ele e a Fran). O vínculo mora em
 * `nutrition_library_partners`, uma linha por SENTIDO: `(user_id = dono da
 * biblioteca, partner_id = quem enxerga)`. Mútuo = duas linhas, cada uma criada
 * pelo dono da biblioteca que ela abre — é isso que impede alguém de se
 * auto-conceder acesso à biblioteca alheia (a RLS só deixa inserir com
 * `user_id = auth.uid()`; mesma armadilha que a auditoria de 2026-07-11 fechou
 * no VIP).
 *
 * ⚠️ Por que isto existe em vez de simplesmente APAGAR o `.eq('user_id', …)` e
 * deixar a RLS resolver: os sete leitores da biblioteca recebem o
 * `SupabaseClient` por injeção, e nada garante que o chamador não passe um
 * cliente service-role — que ignora RLS. Sem filtro explícito, esse caminho
 * serviria a biblioteca de TODOS os usuários. O escopo tem de ser pedido, não
 * presumido.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ids cujas bibliotecas este usuário pode ler: a dele + a de quem o declarou
 * parceiro. O próprio id vem SEMPRE primeiro e nunca é omitido.
 *
 * Degrada para `[userId]` em qualquer falha — sem vínculo, sem rede, tabela
 * ausente. Perder o alimento do parceiro é incômodo; derrubar o lançamento de
 * refeição por causa disso seria bem pior, e vazar biblioteca de terceiro,
 * inaceitável. Os dois modos de falha andam para o lado seguro.
 */
export async function resolveLibraryUserIds(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<string[]> {
  const dono = String(userId ?? '').trim()
  if (!dono) return []
  try {
    const { data, error } = await supabase
      .from('nutrition_library_partners')
      .select('user_id')
      .eq('partner_id', dono)
    // O supabase-js NÃO lança em erro de leitura — devolve `{ error }`. Sem
    // destruturar, uma falha viraria "sem parceiro" indistinguível de "não tem".
    if (error) return [dono]
    const parceiros = (Array.isArray(data) ? data : [])
      .map((r) => String((r as { user_id?: unknown })?.user_id ?? '').trim())
      .filter((id) => id && id !== dono)
    return [dono, ...Array.from(new Set(parceiros))]
  } catch {
    return [dono]
  }
}
