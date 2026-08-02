// Construção do payload APNs isolada em funções puras para teste (auditoria push H2/M1).
//   - H2: aps.badge respeita o __badge explícito do caller (inclusive 0 do clear-badge);
//   - M1: push silencioso de verdade — quando não há alert (clear-badge), o aps leva
//     content-available (não alert/sound) e o envio usa push-type=background.

export function isSilentApnsPush(
  title: string,
  body: string,
  extra?: Record<string, unknown>,
): boolean {
  // clear-badge manda content-available:1 + título/corpo vazios só pra zerar o badge.
  return extra?.['content-available'] === 1 || (!String(title ?? '').trim() && !String(body ?? '').trim())
}

export function buildApnsAps(
  title: string,
  body: string,
  extra: Record<string, unknown> | undefined,
  opts: { notifType: string; wakesScreen: boolean; hasRichImage: boolean },
): Record<string, unknown> {
  if (isSilentApnsPush(title, body, extra)) {
    const aps: Record<string, unknown> = { 'content-available': 1 }
    // badge ainda aplica em push silencioso — é assim que o clear-badge zera o ícone.
    if (typeof extra?.__badge === 'number') aps.badge = extra.__badge
    return aps
  }
  // time-sensitive fura o Focus e acorda a tela; 'active' p/ eventos sociais leves.
  const passive = ['story_like', 'workout_like', 'pr_achieved']
  return {
    alert: { title, body },
    sound: 'default',
    badge: (extra?.__badge as number | undefined) ?? 1,
    'interruption-level': passive.includes(opts.notifType) ? 'active' : 'time-sensitive',
    ...(opts.wakesScreen || opts.hasRichImage ? { 'mutable-content': 1 } : {}),
    ...(opts.notifType === 'morning_briefing' ? { category: 'REST_DAY_PROMPT' } : {}),
    // Push "aluno iniciou o treino": categoria com a ação nativa "Assumir treino"
    // (registrada no IronTracksNativePlugin.swift). Sem o build nativo, o tap ainda abre o app.
    ...(opts.notifType === 'student_workout_start' ? { category: 'TEACHER_ASSUME_CONTROL' } : {}),
  }
}
