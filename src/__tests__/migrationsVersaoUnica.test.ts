/**
 * Guard do incidente de 14/08/2026: um arquivo de migration
 * (20260625140000_harden_increment_counter.sql) ficou meses fora do git com uma
 * VERSÃO que já existia aplicada em produção com outro nome
 * (fix_try_parse_numeric_decimal). Ferramenta de migration pularia o arquivo em
 * silêncio — a correção que ele carregava nunca rodou e o bug ficou vivo.
 * No mesmo dia, o guard achou uma segunda colisão entre arquivos RASTREADOS:
 * bootstrap_rpc_deterministic_limit estava nomeado 20260703220000, mas o
 * registro de produção o aplicou como 20260703213937 (renomeado para casar).
 *
 * O CI não enxerga o registro de produção; o que ele PODE travar é a metade
 * local da classe: duas migrations com o mesmo timestamp no diretório, e
 * arquivo fora do formato de versão (que escaparia da ordenação).
 * A outra metade é convenção: migration nova SEMPRE via MCP
 * (mcp__supabase__apply_migration), que registra e devolve a versão — o
 * arquivo local espelha o registro, nunca nasce antes dele.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations')

/**
 * Convenção antiga (só DATA, 8 dígitos) — história aplicada, não se renomeia.
 * Lista CONGELADA: só encolhe; arquivo novo com 8 dígitos reprova no formato.
 */
const LEGADO_PRE_CONVENCAO = new Set([
  '20260309_rls_performance_optimization.sql',
  '20260310_team_chat_messages.sql',
  '20260319_add_water_ml.sql',
  '20260319_nutrition_learned_foods.sql',
  '20260321_gps_features.sql',
  '20260401_add_email_indexes.sql',
  '20260401_approve_access_request_rpc.sql',
  '20260401_auth_profile_trigger.sql',
  '20260401_delete_student_cascade.sql',
  '20260401_fix_rls_security.sql',
  '20260401_normalize_access_request_status.sql',
  '20260409_teacher_plans.sql',
  '20260409_teacher_workout_mirror.sql',
])

describe('migrations com versão única (incidente 14/08/2026)', () => {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  const modernas = files.filter((f) => !LEGADO_PRE_CONVENCAO.has(f))

  it('a lista de legado só encolhe (entrada morta sai daqui)', () => {
    const mortas = [...LEGADO_PRE_CONVENCAO].filter((f) => !files.includes(f))
    expect(mortas, 'arquivo legado sumiu do diretório — remova da lista').toEqual([])
  })

  it('toda migration fora do legado segue <YYYYMMDDHHMMSS>_<nome>.sql', () => {
    const fora = modernas.filter((f) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(f))
    expect(
      fora,
      'migration fora do formato escapa da ordenação por versão e vira o próximo arquivo órfão'
    ).toEqual([])
  })

  it('nenhuma versão se repete entre as migrations modernas', () => {
    const porVersao = new Map<string, string[]>()
    for (const f of modernas) {
      const version = f.slice(0, 14)
      porVersao.set(version, [...(porVersao.get(version) ?? []), f])
    }
    const duplicadas = [...porVersao.entries()].filter(([, lista]) => lista.length > 1)
    expect(
      duplicadas.map(([v, lista]) => `${v} → ${lista.join(', ')}`),
      'versão duplicada: foi assim que o harden_increment_counter ficou órfão por 2 meses'
    ).toEqual([])
  })
})
