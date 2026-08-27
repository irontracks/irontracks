'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { InAppNotificationsProvider } from '@/contexts/InAppNotificationsContext'
import { BackButton } from '@/components/ui/BackButton'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'

type AppointmentRow = {
  id: string
  title: string
  start_time: string
  end_time: string
  type: 'personal' | 'assessment' | 'other'
  notes: string | null
  student_id: string | null
}

type StudentRow = {
  id: string
  name: string | null
  email: string | null
}

type FormState = {
  date: string
  startTime: string
  endTime: string
  studentId: string
  type: 'personal' | 'assessment' | 'other'
}

const DEFAULT_APPOINTMENT_DURATION_MINUTES = 60

const WEEKDAY_LABELS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'] as const

const APPOINTMENT_TYPES = [
  { value: 'personal', label: 'Personal' },
  { value: 'assessment', label: 'Avaliação' },
  { value: 'other', label: 'Outro' },
] as const

function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toTimeInputValue(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** `new Date('2026-07-25')` seria interpretado como UTC — aqui precisa ser local. */
function parseDateInput(value: string) {
  const [year, month, day] = (value || '').split('-').map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day)
}

function startOfWeek(date: Date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  return start
}

function capitalize(value: string) {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatMonthYear(date: Date) {
  return capitalize(date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
}

function formatLongDate(date: Date) {
  return capitalize(date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))
}

function formatTime(iso: string) {
  if (!iso) return ''
  const date = new Date(iso)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Duração exibida no sheet — espelha a regra do submit (fim inválido = 60 min). */
function formatDuration(startTime: string, endTime: string) {
  const [startHour, startMin] = (startTime || '').split(':').map(Number)
  if (!Number.isFinite(startHour) || !Number.isFinite(startMin)) return ''
  const [endHour, endMin] = (endTime || '').split(':').map(Number)

  const start = startHour * 60 + startMin
  const parsedEnd =
    Number.isFinite(endHour) && Number.isFinite(endMin) ? endHour * 60 + endMin : Number.NaN
  const end =
    Number.isFinite(parsedEnd) && parsedEnd > start
      ? parsedEnd
      : start + DEFAULT_APPOINTMENT_DURATION_MINUTES

  const total = end - start
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours && minutes) return `${hours}h${String(minutes).padStart(2, '0')}`
  if (hours) return `${hours}h`
  return `${minutes}min`
}

function getTypeLabel(type: 'personal' | 'assessment' | 'other') {
  if (type === 'personal') return 'Personal'
  if (type === 'assessment') return 'Avaliação'
  return 'Outro'
}

export default function SchedulePage() {
  const supabase = useMemo(() => createClient(), [])

  const today = new Date()
  const initialDate = toDateInputValue(today)
  const initialStartTime = toTimeInputValue(today)
  const initialEndTime = toTimeInputValue(addMinutes(today, DEFAULT_APPOINTMENT_DURATION_MINUTES))

  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [editingAppointment, setEditingAppointment] = useState<AppointmentRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AppointmentRow | null>(null)

  const [form, setForm] = useState<FormState>({
    date: initialDate,
    startTime: initialStartTime,
    endTime: initialEndTime,
    studentId: '',
    type: 'personal',
  })

  const selectedDateObj = useMemo(() => parseDateInput(selectedDate), [selectedDate])
  const todayValue = useMemo(() => toDateInputValue(new Date()), [])

  const durationLabel = useMemo(
    () => formatDuration(form.startTime, form.endTime),
    [form.startTime, form.endTime]
  )

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDateObj)
    return Array.from({ length: 7 }, (_, index) => addDays(start, index))
  }, [selectedDateObj])

  const loadAppointmentsForDate = useCallback(
    async (dateString: string) => {
      const safeDate = dateString || toDateInputValue(new Date())
      const startOfDay = new Date(`${safeDate}T00:00:00`)
      const endOfDay = new Date(`${safeDate}T23:59:59.999`)

      const { data, error: queryError } = await supabase
        .from('appointments')
        .select('id, title, start_time, end_time, type, notes, student_id')
        .gte('start_time', startOfDay.toISOString())
        .lte('start_time', endOfDay.toISOString())
        .order('start_time', { ascending: true })

      if (queryError) throw queryError
      setAppointments(Array.isArray(data) ? data : [])
    },
    [supabase]
  )

  const loadStudentsForCoach = useCallback(async () => {
    const { data, error } = await supabase
      .from('students')
      .select('id, name, email')
      .order('name', { ascending: true })

    if (error) throw error
    setStudents(Array.isArray(data) ? data : [])
  }, [supabase])

  useEffect(() => {
    let isMounted = true

    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const { data } = await supabase.auth.getUser()
        const currentUser = data?.user
        if (!currentUser) {
          if (!isMounted) return
          setError('Você precisa estar autenticado para ver a agenda.')
          setLoading(false)
          return
        }
        if (!isMounted) return
        setUserId(currentUser.id)
        const baseDate = toDateInputValue(new Date())
        setSelectedDate(baseDate)
        setForm(prev => ({
          ...prev,
          date: baseDate,
        }))
        await loadStudentsForCoach()
      } catch (e: unknown) {
        if (!isMounted) return
        setError(getErrorMessage(e) || 'Erro ao carregar agenda.')
      } finally {
        if (!isMounted) return
        setLoading(false)
      }
    }

    load()

    return () => {
      isMounted = false
    }
  }, [supabase, loadStudentsForCoach])

  useEffect(() => {
    if (!userId || !selectedDate) return
    let isCancelled = false

    const loadDay = async () => {
      try {
        setLoading(true)
        await loadAppointmentsForDate(selectedDate)
      } catch (e: unknown) {
        if (isCancelled) return
        setError(getErrorMessage(e) || 'Erro ao carregar agenda.')
      } finally {
        if (isCancelled) return
        setLoading(false)
      }
    }

    loadDay()

    return () => {
      isCancelled = true
    }
  }, [userId, selectedDate, loadAppointmentsForDate])

  const shiftWeek = (direction: -1 | 1) => {
    setSelectedDate(toDateInputValue(addDays(selectedDateObj, direction * 7)))
  }

  const handleOpenModal = () => {
    const base = new Date()
    const baseDate = selectedDate || toDateInputValue(base)
    const start = toTimeInputValue(base)
    const end = toTimeInputValue(addMinutes(base, DEFAULT_APPOINTMENT_DURATION_MINUTES))
    setForm(prev => ({
      ...prev,
      date: baseDate,
      startTime: start,
      endTime: end,
    }))
    setEditingAppointment(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    if (saving) return
    setIsModalOpen(false)
  }

  const notifyStudentAppointment = async (studentId: string | null, baseTitle: string, start: Date) => {
    if (!studentId) return
    try {
      const dateLabel = start.toLocaleDateString('pt-BR')
      const timeLabel = start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      const title = baseTitle
      const message = `Você tem um agendamento ${baseTitle.toLowerCase()} em ${dateLabel} às ${timeLabel}.`
      await fetch('/api/notifications/appointment-created', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          title,
          message,
          type: 'appointment',
        }),
      })
    } catch (e: unknown) {
      logError('error', 'Erro ao enviar notificação de agendamento:', e)
    }
  }

  const handleSubmitAppointment = async (event: { preventDefault?: () => void } | null | undefined) => {
    event?.preventDefault?.()
    if (!userId) {
      setError('Usuário não identificado.')
      return
    }

    const trimmedDate = (form.date || '').trim()
    const trimmedStart = (form.startTime || '').trim()
    const trimmedEnd = (form.endTime || '').trim()
    const type = form.type

    if (!trimmedDate || !trimmedStart || !type) {
      setError('Preencha data, horário e tipo do agendamento.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const start = new Date(`${trimmedDate}T${trimmedStart}:00`)
      let end = trimmedEnd ? new Date(`${trimmedDate}T${trimmedEnd}:00`) : addMinutes(start, DEFAULT_APPOINTMENT_DURATION_MINUTES)
      if (end <= start) {
        end = addMinutes(start, DEFAULT_APPOINTMENT_DURATION_MINUTES)
      }

      const chosenStudentId = form.studentId || null

      const mappedStudent = students.find(s => s.id === chosenStudentId) || null
      const baseTitle = getTypeLabel(type)
      const studentName = mappedStudent?.name || mappedStudent?.email || ''
      const computedTitle = studentName ? `${baseTitle} · ${studentName}` : baseTitle

      if (editingAppointment) {
        const { error: updateError } = await supabase
          .from('appointments')
          .update({
            student_id: chosenStudentId,
            title: computedTitle,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            type,
          })
          .eq('id', editingAppointment.id)
          .eq('coach_id', userId)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from('appointments')
          .insert({
            coach_id: userId,
            student_id: chosenStudentId,
            title: computedTitle,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            type,
            notes: null,
          })
        if (insertError) throw insertError
        await notifyStudentAppointment(chosenStudentId, baseTitle, start)
      }

      const targetDate = selectedDate || trimmedDate
      await loadAppointmentsForDate(targetDate)

      setIsModalOpen(false)
      setEditingAppointment(null)
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Erro ao salvar agendamento.')
    } finally {
      setSaving(false)
    }
  }

  const handleEditAppointment = (item: AppointmentRow) => {
    const start = new Date(item.start_time)
    const end = new Date(item.end_time)
    const dateStr = toDateInputValue(start)
    const startStr = toTimeInputValue(start)
    const endStr = toTimeInputValue(end)
    const studentId = item.student_id || ''
    const type = item.type
    setForm({
      date: dateStr,
      startTime: startStr,
      endTime: endStr,
      studentId,
      type,
    })
    setEditingAppointment(item)
    setIsModalOpen(true)
  }

  const handleConfirmDelete = async () => {
    const item = deleteTarget
    if (!item) return
    if (!userId) {
      setError('Usuário não identificado.')
      setDeleteTarget(null)
      return
    }
    try {
      setSaving(true)
      setError('')
      const { error: deleteError } = await supabase
        .from('appointments')
        .delete()
        .eq('id', item.id)
        .eq('coach_id', userId)
      if (deleteError) throw deleteError
      const targetDate = selectedDate || toDateInputValue(new Date())
      await loadAppointmentsForDate(targetDate)
      setDeleteTarget(null)
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Erro ao excluir agendamento.')
    } finally {
      setSaving(false)
    }
  }

  const studentsById = new Map<string, StudentRow>()
  const safeStudents = Array.isArray(students) ? students : []
  for (const s of safeStudents) {
    if (!s || !s.id) continue
    studentsById.set(s.id, s)
  }

  const safeAppointments = Array.isArray(appointments) ? appointments : []

  return (
    <InAppNotificationsProvider>
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
        {/* ── Header ───────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 bg-neutral-950/95 backdrop-blur-md border-b border-white/5 px-2 pt-[env(safe-area-inset-top)]">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center h-14">
            <div className="justify-self-start">
              <BackButton label="" className="px-2" />
            </div>
            <h1 className="text-base font-bold tracking-tight">Agenda</h1>
            <div className="justify-self-end relative">
              <button
                type="button"
                aria-label="Escolher data"
                className="w-11 h-11 flex items-center justify-center rounded-full text-neutral-400 active:scale-95 transition-transform"
              >
                <CalendarDays size={20} />
              </button>
              {/* Input nativo sobreposto: abre o date picker do sistema ao toque */}
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                aria-label="Escolher data"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>
        </header>

        {/* ── Seletor de semana ────────────────────────────────────── */}
        <section className="px-4 pt-4 pb-3 border-b border-white/5">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => shiftWeek(-1)}
              aria-label="Semana anterior"
              className="tap-44 w-9 h-9 -ml-2 flex items-center justify-center rounded-full text-neutral-400 hover:text-white active:scale-95 transition"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
              {formatMonthYear(selectedDateObj)}
            </span>
            <button
              type="button"
              onClick={() => shiftWeek(1)}
              aria-label="Próxima semana"
              className="tap-44 w-9 h-9 -mr-2 flex items-center justify-center rounded-full text-neutral-400 hover:text-white active:scale-95 transition"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {weekDays.map(day => {
              const value = toDateInputValue(day)
              const isSelected = value === selectedDate
              const isToday = value === todayValue
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedDate(value)}
                  aria-label={formatLongDate(day)}
                  aria-current={isSelected ? 'date' : undefined}
                  className={`flex flex-col items-center gap-1 py-2 rounded-xl transition-colors active:scale-95 ${
                    isSelected ? 'bg-yellow-500 text-black' : 'text-neutral-400 hover:bg-white/5'
                  }`}
                >
                  <span className={`text-[10px] font-bold tracking-wider ${isSelected ? 'text-black/60' : 'text-neutral-400'}`}>
                    {WEEKDAY_LABELS[day.getDay()]}
                  </span>
                  <span className={`text-sm tabular-nums ${isSelected ? 'font-black' : 'font-semibold text-white'}`}>
                    {day.getDate()}
                  </span>
                  <span
                    className={`w-1 h-1 rounded-full ${
                      isToday ? (isSelected ? 'bg-black/50' : 'bg-yellow-500') : 'bg-transparent'
                    }`}
                  />
                </button>
              )
            })}
          </div>
        </section>

        {/* ── Conteúdo ─────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col px-4 pt-5 pb-[max(env(safe-area-inset-bottom),112px)]">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-semibold text-neutral-300">{formatLongDate(selectedDateObj)}</h2>
            {!loading && safeAppointments.length > 0 && (
              <span className="text-xs text-neutral-400 tabular-nums">
                {safeAppointments.length} {safeAppointments.length === 1 ? 'agendamento' : 'agendamentos'}
              </span>
            )}
          </div>

          {error && (
            <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-200 text-sm px-3 py-2.5 rounded-xl">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Carregando agenda">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-[76px] rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse" />
              ))}
            </div>
          ) : safeAppointments.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center pb-12">
              <div className="w-20 h-20 rounded-full bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-5">
                <CalendarDays size={30} className="text-neutral-600" strokeWidth={1.5} />
              </div>
              <h3 className="text-base font-bold text-neutral-200 mb-1.5">Dia livre</h3>
              {/* Sem CTA aqui de propósito: a FAB "Agendar" fica visível neste
                  estado e dois botões para a mesma ação viram redundância. */}
              <p className="text-sm text-neutral-400 max-w-[16rem] leading-relaxed">
                Nenhum agendamento marcado. Use este espaço para encaixar um aluno.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {safeAppointments.map(item => {
                const student = item.student_id ? studentsById.get(item.student_id) || null : null
                const label = getTypeLabel(item.type)
                const studentName = student?.name || student?.email || ''
                // `title` é montado como "Tipo · Aluno"; sem aluno ele vira só o tipo
                // e repetiria o badge — nesse caso não vale a pena exibir.
                const secondary = studentName || (item.title && item.title !== label ? item.title : '')
                return (
                  <li
                    key={item.id}
                    className="bg-white/[0.035] border border-white/[0.07] rounded-2xl p-3.5 flex items-stretch gap-3.5"
                  >
                    <div className="flex flex-col items-center justify-center min-w-[3.25rem]">
                      <span className="text-base font-black tabular-nums leading-none">{formatTime(item.start_time)}</span>
                      <span className="text-[11px] text-neutral-400 tabular-nums mt-1 leading-none">
                        {formatTime(item.end_time)}
                      </span>
                    </div>

                    <div className="w-px bg-white/10 rounded-full" aria-hidden="true" />

                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-400">
                          {label}
                        </span>
                      </div>
                      {secondary ? (
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                          <User size={13} className="text-neutral-400 shrink-0" />
                          <span className="truncate">{secondary}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-neutral-400">Sem aluno vinculado</div>
                      )}
                    </div>

                    <div className="flex flex-col justify-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditAppointment(item)}
                        aria-label={`Editar ${item.title}`}
                        className="tap-44 w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/5 active:scale-95 transition"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        aria-label={`Excluir ${item.title}`}
                        className="tap-44 w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </main>

        {/* ── FAB ──────────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleOpenModal}
          aria-label="Novo agendamento"
          className="fixed right-5 z-40 flex items-center gap-2 h-14 pl-4 pr-5 rounded-full bg-yellow-500 text-black font-black text-sm uppercase tracking-wide shadow-lg shadow-black/50 active:scale-95 transition-transform"
          style={{ bottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}
        >
          <Plus size={20} strokeWidth={3} />
          Agendar
        </button>

        {/* ── Modal criar/editar ───────────────────────────────────── */}
        {isModalOpen && (
          <div className="overlay-enter fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:px-4">
            <div
              className="overlay-content-enter bg-neutral-900 border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}
            >
              {/* Handle: sinaliza folha arrastável, padrão de sheet nativo */}
              <div className="pt-3 pb-1 flex justify-center" aria-hidden="true">
                <div className="w-9 h-1 rounded-full bg-white/15" />
              </div>

              <div className="px-5 pt-2 pb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-black tracking-tight">
                    {editingAppointment ? 'Editar agendamento' : 'Novo agendamento'}
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5 truncate">
                    {formatLongDate(parseDateInput(form.date))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  aria-label="Fechar"
                  className="tap-44 w-9 h-9 shrink-0 -mr-1 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/5 active:scale-95 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitAppointment} className="px-5 space-y-5">
                {/* Quando ─ data + janela de horário, agrupadas porque decidem a mesma coisa */}
                <fieldset className="space-y-2">
                  <legend className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
                    Quando
                  </legend>
                  <input
                    type="date"
                    value={form.date}
                    aria-label="Data"
                    onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full appearance-none bg-white/[0.04] border border-white/10 rounded-xl px-3.5 h-12 text-[15px] text-white focus:outline-none focus:border-yellow-500/70 focus:bg-white/[0.06] transition"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={form.startTime}
                      aria-label="Hora de início"
                      onChange={e => setForm(prev => ({ ...prev, startTime: e.target.value }))}
                      className="w-full appearance-none bg-white/[0.04] border border-white/10 rounded-xl px-3.5 h-12 text-[15px] text-white focus:outline-none focus:border-yellow-500/70 focus:bg-white/[0.06] transition"
                    />
                    <input
                      type="time"
                      value={form.endTime}
                      aria-label="Hora de término"
                      onChange={e => setForm(prev => ({ ...prev, endTime: e.target.value }))}
                      className="w-full appearance-none bg-white/[0.04] border border-white/10 rounded-xl px-3.5 h-12 text-[15px] text-white focus:outline-none focus:border-yellow-500/70 focus:bg-white/[0.06] transition"
                    />
                  </div>
                  {durationLabel && (
                    <p className="text-xs text-neutral-400 pl-0.5">Duração de {durationLabel}</p>
                  )}
                </fieldset>

                {/* Tipo ─ 3 opções fixas viram chips: escolha visível sem abrir picker */}
                <fieldset>
                  <legend className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
                    Tipo
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    {APPOINTMENT_TYPES.map(option => {
                      const isActive = form.type === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => setForm(prev => ({ ...prev, type: option.value }))}
                          className={`h-11 rounded-xl text-sm font-bold transition active:scale-95 ${
                            isActive
                              ? 'bg-yellow-500 text-black'
                              : 'bg-white/[0.04] border border-white/10 text-neutral-300 hover:bg-white/[0.07]'
                          }`}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>

                {/* Aluno ─ segue select (lista dinâmica), mas com chevron próprio */}
                <fieldset>
                  <legend className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
                    Aluno
                  </legend>
                  <div className="relative">
                    <select
                      value={form.studentId}
                      aria-label="Aluno"
                      onChange={e => setForm(prev => ({ ...prev, studentId: e.target.value }))}
                      className="w-full appearance-none bg-white/[0.04] border border-white/10 rounded-xl pl-3.5 pr-10 h-12 text-[15px] text-white focus:outline-none focus:border-yellow-500/70 focus:bg-white/[0.06] transition"
                    >
                      <option value="">Sem aluno vinculado</option>
                      {safeStudents.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name || s.email || 'Aluno sem nome'}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={16}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                    />
                  </div>
                </fieldset>

                {/* Salvar domina; cancelar é texto — não competem pelo mesmo peso */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    disabled={saving}
                    className="px-4 min-h-[52px] text-sm font-bold text-neutral-400 hover:text-white disabled:opacity-50 active:scale-95 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 min-h-[52px] rounded-2xl bg-yellow-500 text-black text-[15px] font-black disabled:opacity-50 active:scale-[0.98] transition"
                  >
                    {saving ? 'Salvando…' : editingAppointment ? 'Salvar alterações' : 'Agendar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal de exclusão (substitui o window.confirm) ───────── */}
        {deleteTarget && (
          <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center px-4">
            <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-sm p-5 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <AlertTriangle size={22} className="text-red-400" />
              </div>
              <h2 className="text-base font-bold mb-1.5">Excluir agendamento?</h2>
              <p className="text-sm text-neutral-400 mb-5 leading-relaxed">
                {deleteTarget.title} · {formatTime(deleteTarget.start_time)}. Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={saving}
                  className="flex-1 min-h-[48px] px-4 rounded-xl border border-white/10 text-neutral-300 text-sm font-bold hover:bg-white/5 disabled:opacity-50 active:scale-95 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={saving}
                  className="flex-1 min-h-[48px] px-4 rounded-xl bg-red-500 text-white text-sm font-black disabled:opacity-50 active:scale-95 transition"
                >
                  {saving ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </InAppNotificationsProvider>
  )
}
