'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, ArrowLeft, Clock, User, Plus, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { InAppNotificationsProvider } from '@/contexts/InAppNotificationsContext'

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

function formatTimeRange(startIso: string, endIso: string) {
  if (!startIso || !endIso) return ''
  const start = new Date(startIso)
  const end = new Date(endIso)
  const startHours = String(start.getHours()).padStart(2, '0')
  const startMinutes = String(start.getMinutes()).padStart(2, '0')
  const endHours = String(end.getHours()).padStart(2, '0')
  const endMinutes = String(end.getMinutes()).padStart(2, '0')
  return `${startHours}:${startMinutes} - ${endHours}:${endMinutes}`
}

function getTypeLabel(type: 'personal' | 'assessment' | 'other') {
  if (type === 'personal') return 'Personal'
  if (type === 'assessment') return 'Avaliação'
  return 'Outro'
}

export default function SchedulePage() {
  const router = useRouter()
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

  const [form, setForm] = useState<FormState>({
    date: initialDate,
    startTime: initialStartTime,
    endTime: initialEndTime,
    studentId: '',
    type: 'personal',
  })

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
      } catch (e: any) {
        if (!isMounted) return
        setError(e?.message || 'Erro ao carregar agenda.')
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
      } catch (e: any) {
        if (isCancelled) return
        setError(e?.message || 'Erro ao carregar agenda.')
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
    } catch (e: any) {
      console.error('Erro ao enviar notificação de agendamento:', e)
    }
  }

  const handleSubmitAppointment = async (event: any) => {
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
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar agendamento.')
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

  const handleDeleteAppointment = async (item: AppointmentRow) => {
    if (!userId) {
      setError('Usuário não identificado.')
      return
    }
    const confirmed = typeof window === 'undefined' ? false : window.confirm('Deseja realmente excluir este agendamento?')
    if (!confirmed) return
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
    } catch (e: any) {
      setError(e?.message || 'Erro ao excluir agendamento.')
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
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col">
      <header className="bg-neutral-950 border-b border-neutral-800 px-4 pt-[env(safe-area-inset-top)] pb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 text-neutral-400 hover:text-white px-3 py-2 rounded-full bg-neutral-900 border border-neutral-700 active:scale-95 transition-transform"
        >
          <ArrowLeft size={18} />
          <span className="text-xs font-bold uppercase tracking-wide">Voltar</span>
        </button>
        <div className="flex items-center gap-2">
          <Calendar size={20} className="text-yellow-500" />
          <div className="text-right">
            <div className="text-[10px] uppercase text-neutral-500 font-bold">Coach</div>
            <div className="text-sm font-black tracking-tight">Agenda do Dia</div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-[max(env(safe-area-inset-bottom),96px)] space-y-4">
        <section className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase text-neutral-500 mb-1">Data</div>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-yellow-500 min-h-[48px] w-full"
            />
          </div>
          <button
            type="button"
            onClick={handleOpenModal}
            className="flex items-center gap-2 bg-yellow-500 text-black font-black px-4 py-3 rounded-xl shadow-lg shadow-yellow-900/30 text-sm uppercase tracking-wide active:scale-95 transition-transform min-h-[44px]"
          >
            <Plus size={18} />
            Novo Agendamento
          </button>
        </section>

        {error && (
          <div className="bg-red-900/40 border border-red-500 text-red-100 text-sm px-3 py-2 rounded-xl">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-neutral-400 text-sm">
            Carregando agenda...
          </div>
        ) : safeAppointments.length === 0 ? (
          <div className="mt-4 bg-neutral-800 border border-neutral-700 rounded-2xl px-4 py-6 flex flex-col items-center text-center">
            <Calendar size={32} className="text-neutral-500 mb-3" />
            <h2 className="text-base font-bold mb-1">Nenhum agendamento para este dia</h2>
            <p className="text-xs text-neutral-400 mb-4">Aproveite o descanso! ☕</p>
          </div>
        ) : (
          <section className="space-y-3">
            {safeAppointments.map(item => {
              const student = item.student_id ? studentsById.get(item.student_id) || null : null
              const label = getTypeLabel(item.type)
              const range = formatTimeRange(item.start_time, item.end_time)
              const studentName = student?.name || student?.email || ''
              return (
                <div
                  key={item.id}
                  className="bg-neutral-800 border border-neutral-700 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center">
                      <Clock size={18} className="text-yellow-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/40">
                          {label}
                        </span>
                        {studentName ? (
                          <span className="flex items-center gap-1 text-[11px] text-neutral-300">
                            <User size={12} className="text-neutral-400" />
                            {studentName}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-sm font-semibold text-white mb-0.5">
                        {item.title}
                      </div>
                      <div className="text-xs text-neutral-400 flex items-center gap-1">
                        <Clock size={12} />
                        {range}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditAppointment(item)}
                      className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-neutral-300 active:scale-95 transition-transform"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAppointment(item)}
                      className="w-9 h-9 rounded-full bg-red-900/40 border border-red-700/60 flex items-center justify-center text-red-400 active:scale-95 transition-transform"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </section>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black flex items-center gap-2">
                <Calendar size={20} className="text-yellow-500" />
                Novo Agendamento
              </h2>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-neutral-400 hover:text-white px-2 py-1 rounded-full active:scale-95 transition-transform"
              >
                <ArrowLeft size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitAppointment} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-neutral-500">Data</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 min-h-[44px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase text-neutral-500">Hora início</label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={e => setForm(prev => ({ ...prev, startTime: e.target.value }))}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 min-h-[44px]"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase text-neutral-500">Hora fim (opcional)</label>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={e => setForm(prev => ({ ...prev, endTime: e.target.value }))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 min-h-[44px]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase text-neutral-500">Aluno</label>
                <select
                  value={form.studentId}
                  onChange={e => setForm(prev => ({ ...prev, studentId: e.target.value }))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 min-h-[44px]"
                >
                  <option value="">Sem aluno vinculado</option>
                  {safeStudents.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name || s.email || 'Aluno sem nome'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase text-neutral-500">Tipo</label>
                <select
                  value={form.type}
                  onChange={e => setForm(prev => ({ ...prev, type: e.target.value as FormState['type'] }))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 min-h-[44px]"
                >
                  <option value="personal">Personal</option>
                  <option value="assessment">Avaliação</option>
                  <option value="other">Outro</option>
                </select>
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={saving}
                  className="flex-1 min-h-[44px] px-4 py-3 rounded-xl border border-neutral-700 text-neutral-300 text-sm font-bold uppercase bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 active:scale-95 transition-transform"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black text-sm font-black uppercase tracking-wide hover:bg-yellow-400 disabled:opacity-50 active:scale-95 transition-transform"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </InAppNotificationsProvider>
  )
}
