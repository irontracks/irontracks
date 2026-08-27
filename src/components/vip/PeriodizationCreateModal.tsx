'use client'

import React, { useCallback, useState } from 'react'
import { getErrorMessage } from '@/utils/errorMessage'
import { apiVip } from '@/lib/api'
import { NumericInput } from '@/components/ui/NumericInput'
import { backdropProps, dialogProps } from '@/utils/a11y/backdrop'
import { useFocusTrap } from '@/hooks/useFocusTrap'

/**
 * Criador de periodização — o MESMO formulário nas duas telas que precisam dele.
 *
 * Nasceu de um pedido do dono (04/08/2026) olhando a aba "Periodizados" da tela de
 * treinos: ela dizia "Crie sua periodização na aba VIP para ela aparecer aqui" e
 * parava por aí. Quem quisesse um programa tinha de sair da tela, achar a aba VIP,
 * rolar até o painel e só então criar — para voltar ao ponto de partida. A ação
 * agora acontece onde a falta dela é percebida.
 *
 * Extraído em vez de copiado de propósito: o painel VIP e o vazio da lista mostram
 * o MESMO formulário, com as mesmas validações e a mesma chamada. Duas cópias desta
 * tela divergiriam no primeiro campo novo — foi assim que a nutrição quebrou (ver
 * `displayGoals` e `phase` no CLAUDE.md).
 *
 * O componente NÃO decide se o usuário pode criar: quem renderiza é que sabe se está
 * bloqueado (`vipLocked`). Aqui só existe o formulário.
 */

export type PeriodizationForm = {
  model: string
  weeks: number
  goal: string
  level: string
  daysPerWeek: number
  timeMinutes: number
  equipment: string[]
  limitations: string
  startDate: string
}

export const DEFAULT_PERIODIZATION_FORM: PeriodizationForm = {
  model: 'linear',
  weeks: 6,
  goal: 'hypertrophy',
  level: 'intermediate',
  daysPerWeek: 4,
  timeMinutes: 60,
  equipment: ['gym'],
  limitations: '',
  startDate: '',
}

const safeString = (v: unknown) => {
  try {
    return String(v ?? '').trim()
  } catch {
    return ''
  }
}

/** Máscara dd/mm/aaaa enquanto digita. */
export const formatBrazilDate = (raw: string) => {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8)
  const dd = digits.slice(0, 2)
  const mm = digits.slice(2, 4)
  const yyyy = digits.slice(4, 8)
  if (digits.length <= 2) return dd
  if (digits.length <= 4) return `${dd}/${mm}`
  return `${dd}/${mm}/${yyyy}`
}

/** dd/mm/aaaa → ISO, ou `null` se a data não existe no calendário. */
export const brToIsoDate = (raw: string): string | null => {
  const s = String(raw || '').trim()
  if (!s) return null
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const dd = Number(m[1])
  const mm = Number(m[2])
  const yyyy = Number(m[3])
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null
  if (yyyy < 2000 || yyyy > 2100) return null
  if (mm < 1 || mm > 12) return null
  if (dd < 1 || dd > 31) return null
  const iso = `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  const dt = new Date(`${iso}T00:00:00.000Z`)
  if (Number.isNaN(dt.getTime())) return null
  if (dt.toISOString().slice(0, 10) !== iso) return null
  return iso
}

/** Código de erro da rota → frase que o usuário entende. */
export const friendlyCreateError = (codeRaw: unknown) => {
  const code = String(codeRaw || '').trim().toLowerCase()
  if (!code) return 'Falha ao criar periodização.'
  if (code === 'workout_not_found') return 'Falha ao salvar os treinos do programa. Tente criar novamente.'
  if (code === 'vip_required') return 'Disponível apenas no VIP pago.'
  if (code === 'failed_to_create_workout') return 'Não foi possível criar um dos treinos. Tente novamente.'
  if (code === 'failed_to_create_program') return 'Não foi possível criar o programa. Tente novamente.'
  return String(codeRaw || 'Falha ao criar periodização.')
}

export default function PeriodizationCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  /** Chamado após criar com sucesso — quem abriu recarrega o que precisar. */
  onCreated?: () => void | Promise<void>
}) {
  const [form, setForm] = useState<PeriodizationForm>(DEFAULT_PERIODIZATION_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const daysPerWeekN = Number(form.daysPerWeek)
  const timeMinutesN = Number(form.timeMinutes)
  const daysPerWeekInvalid = !Number.isFinite(daysPerWeekN) || daysPerWeekN < 2 || daysPerWeekN > 6
  const timeMinutesInvalid = !Number.isFinite(timeMinutesN) || timeMinutesN < 30 || timeMinutesN > 90

  const createProgram = useCallback(async () => {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const startDateIso = brToIsoDate(form.startDate)
      if (String(form.startDate || '').trim() && !startDateIso) {
        setError('Data inválida. Use o formato dd/mm/aaaa.')
        return
      }
      /**
       * O que o `<select>` devolve é `string`; a rota é `.strict()` com enums.
       * Normalizar num lugar só — e cair no primeiro valor quando vier algo
       * fora da lista — é o que garante que o payload SEMPRE case com o schema.
       */
      const umDe = <T extends string>(v: unknown, opcoes: readonly T[]): T =>
        opcoes.includes(String(v) as T) ? (String(v) as T) : opcoes[0]

      const payload = {
        // O <select> só oferece estes dois, mas o estado é `string` e a rota
        // exige o enum. Normalizar aqui é o que faz o TIPO valer alguma coisa —
        // era a frouxidão do payload antigo que deixava o modal compilar
        // mandando um objeto que a rota rejeitava.
        model: umDe(form.model, ['linear', 'undulating'] as const),
        weeks: (Number(form.weeks) === 4 ? 4 : Number(form.weeks) === 8 ? 8 : 6) as 4 | 6 | 8,
        goal: umDe(form.goal, ['hypertrophy', 'strength', 'recomp'] as const),
        level: umDe(form.level, ['beginner', 'intermediate', 'advanced'] as const),
        daysPerWeek: Math.max(2, Math.min(6, Number(form.daysPerWeek) || 4)),
        timeMinutes: Math.max(30, Math.min(90, Number(form.timeMinutes) || 60)),
        equipment: Array.isArray(form.equipment) ? form.equipment : [],
        limitations: safeString(form.limitations),
        startDate: startDateIso,
      }
      // O `payload` acima já é exatamente o shape que a rota espera. Enviar um
      // subconjunto com `focusAreas` (chave que a rota não conhece) e sem
      // `model` (obrigatório) fazia o `.strict()` reprovar pelos dois motivos.
      const json = await apiVip.createPeriodization(payload).catch(() => null)
      if (!json?.ok) {
        setError(friendlyCreateError((json as Record<string, unknown> | null)?.error))
        return
      }
      await onCreated?.()
      onClose()
    } catch (e: unknown) {
      setError(getErrorMessage(e) ? String(getErrorMessage(e)) : 'Falha ao criar periodização.')
    } finally {
      setLoading(false)
    }
  }, [form, loading, onClose, onCreated])

  // Antes do `return null`: hook atrás de condicional quebra a ordem de hooks.
  const dialogRef = useFocusTrap(open, onClose)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 pt-safe" {...backdropProps(onClose)}>
      <div ref={dialogRef} {...dialogProps('Criar periodização')} className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-3xl border border-neutral-800 bg-neutral-900">
        <div className="sticky top-0 z-10 bg-neutral-900 p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="font-black text-white">Criar periodização</div>
          <button type="button" onClick={onClose} className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 text-xs font-black text-white">
            Fechar
          </button>
        </div>
        <div className="p-5 space-y-3">
          {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Duração do programa</div>
              <select
                value={form.weeks}
                onChange={(e) => setForm((p) => ({ ...p, weeks: Number(e.target.value) }))}
                className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold"
                aria-label="Duração do programa"
              >
                <option value={4}>4 semanas</option>
                <option value={6}>6 semanas</option>
                <option value={8}>8 semanas</option>
              </select>
              <div className="text-[11px] text-neutral-400">Escolha 4, 6 ou 8 semanas.</div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Modelo de progressão</div>
              <select
                value={form.model}
                onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
                className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold"
                aria-label="Modelo de progressão"
              >
                <option value="linear">Linear</option>
                <option value="undulating">Undulatória</option>
              </select>
              <div className="text-[11px] text-neutral-400">Linear sobe gradualmente. Undulatória varia estímulo na semana.</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Objetivo</div>
              <select
                value={form.goal}
                onChange={(e) => setForm((p) => ({ ...p, goal: e.target.value }))}
                className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold"
                aria-label="Objetivo"
              >
                <option value="hypertrophy">Hipertrofia</option>
                <option value="strength">Força</option>
                <option value="recomp">Recomposição</option>
              </select>
              <div className="text-[11px] text-neutral-400">Define foco de reps, carga e volume.</div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Nível</div>
              <select
                value={form.level}
                onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))}
                className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold"
                aria-label="Nível"
              >
                <option value="beginner">Iniciante</option>
                <option value="intermediate">Intermediário</option>
                <option value="advanced">Avançado</option>
              </select>
              <div className="text-[11px] text-neutral-400">Ajusta complexidade e volume do programa.</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Frequência</div>
              <NumericInput
                decimal={false}
                min={2}
                max={6}
                value={form.daysPerWeek}
                onValueChange={(n) => setForm((p) => ({ ...p, daysPerWeek: n ?? 0 }))}
                placeholder="Ex.: 4"
                className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold"
                aria-label="Dias por semana"
              />
              {daysPerWeekInvalid ? <div className="text-[11px] text-red-300">Use de 2 a 6 dias por semana.</div> : <div className="text-[11px] text-neutral-400">Quantos dias você treina por semana.</div>}
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Duração da sessão</div>
              <NumericInput
                decimal={false}
                min={30}
                max={90}
                value={form.timeMinutes}
                onValueChange={(n) => setForm((p) => ({ ...p, timeMinutes: n ?? 0 }))}
                placeholder="Ex.: 60"
                className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold"
                aria-label="Minutos por sessão"
              />
              {timeMinutesInvalid ? <div className="text-[11px] text-red-300">Use de 30 a 90 minutos.</div> : <div className="text-[11px] text-neutral-400">Tempo médio disponível por treino.</div>}
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Equipamentos disponíveis</div>
              <div className="text-[11px] text-neutral-400">Marque onde você realmente vai treinar nesse ciclo.</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-sm text-white font-bold">
                <input
                  type="checkbox"
                  aria-label="Academia completa"
                  checked={form.equipment.includes('gym')}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, equipment: e.target.checked ? Array.from(new Set([...p.equipment, 'gym'])) : p.equipment.filter((x) => x !== 'gym') }))
                  }
                />
                Academia completa
              </label>
              <label className="flex items-center gap-2 rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-sm text-white font-bold">
                <input
                  type="checkbox"
                  aria-label="Casa / equipamento limitado"
                  checked={form.equipment.includes('home')}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, equipment: e.target.checked ? Array.from(new Set([...p.equipment, 'home'])) : p.equipment.filter((x) => x !== 'home') }))
                  }
                />
                Casa (home gym)
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Data de início (opcional)</div>
            <input
              inputMode="numeric"
              value={form.startDate}
              onChange={(e) => setForm((p) => ({ ...p, startDate: formatBrazilDate(e.target.value) }))}
              placeholder="dd/mm/aaaa"
              className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold"
              aria-label="Data de início"
            />
            <div className="text-[11px] text-neutral-400">Define o calendário do programa (formato dd/mm/aaaa). Se vazio, fica sem datas.</div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Limitações (opcional)</div>
            <textarea
              value={form.limitations}
              onChange={(e) => setForm((p) => ({ ...p, limitations: e.target.value }))}
              placeholder="Ex.: dor no ombro, evitar agachamento, sem barra, sem polia..."
              rows={3}
              className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-medium"
              aria-label="Limitações"
            />
            <div className="text-[11px] text-neutral-400">Isso ajuda o sistema a ajustar exercícios e volume.</div>
          </div>

          <button
            type="button"
            onClick={createProgram}
            disabled={loading}
            className="w-full rounded-xl bg-yellow-500 px-4 py-3.5 font-black text-black hover:bg-yellow-400 disabled:opacity-60"
          >
            {loading ? 'Criando...' : 'Criar programa'}
          </button>
        </div>
      </div>
    </div>
  )
}
