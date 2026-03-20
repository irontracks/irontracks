'use client'

import React, { Suspense } from 'react'
import { ViewTransition } from '@/components/ui/ViewTransition'
import SectionErrorBoundary from '@/components/SectionErrorBoundary'
import ErrorBoundary from '@/components/ErrorBoundary'
import StudentDashboard from '@/components/dashboard/StudentDashboard'
import type { DashboardWorkout } from '@/types/dashboard'

// Lazy loaded heavy views
import dynamic from 'next/dynamic'
const ExerciseEditor = dynamic(() => import('@/components/ExerciseEditor'), { ssr: false })
const ActiveWorkout = dynamic(() => import('@/components/ActiveWorkout'), { ssr: false })
const HistoryList = dynamic(() => import('@/components/HistoryList'), { ssr: false })
const WorkoutReport = dynamic(() => import('@/components/WorkoutReport'), { ssr: false })
const ProfilePage = dynamic(() => import('@/components/ProfilePage'), { ssr: false })
const ChatScreen = dynamic(() => import('@/components/ChatScreen'), { ssr: false })
const ChatListScreen = dynamic(() => import('@/components/ChatListScreen'), { ssr: false })
const ChatDirectScreen = dynamic(() => import('@/components/ChatDirectScreen'), { ssr: false })
const AdminPanelV2 = dynamic(() => import('@/components/AdminPanelV2'), { ssr: false })
const AssessmentHistory = dynamic(() => import('@/components/assessment/AssessmentHistory'), { ssr: false })
const CommunityClient = dynamic(() => import('@/app/(app)/community/CommunityClient'), { ssr: false })
const VipHub = dynamic(() => import('@/components/VipHub'), { ssr: false })
const WorkoutRecoveryBanner = dynamic(() => import('@/components/WorkoutRecoveryBanner'), { ssr: false })
const WorkoutWizardModal = dynamic(() => import('@/components/dashboard/WorkoutWizardModal'), { ssr: false })

import type { AdminUser } from '@/types/admin'
import type { Workout } from '@/types/app'

// ActiveSession type alias (hook only exports the hook, not the type directly)
type ActiveWorkoutSession = Record<string, unknown>

// ────────────────────────────────────────────────────────────────
// Helper
// ────────────────────────────────────────────────────────────────
const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

// ────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────

export interface DashboardViewRouterProps {
  // Current view state
  view: string
  setView: (v: string) => void

  // User & auth
  user: Record<string, unknown> | null
  initialUserObj: Record<string, unknown> | null
  isCoach: boolean

  // VIP
  vipAccess: { hasVip?: boolean } | null
  hideVipOnIos: boolean
  vipStatus: Record<string, unknown> | null
  openVipView: () => void

  // Settings
  userSettingsApi: {
    settings: Record<string, unknown> | null
    save?: (v: unknown) => Promise<{ ok: boolean; error?: string }>
  } | null

  // Workouts
  workouts: DashboardWorkout[]
  profileIncomplete: boolean
  streakStats: Record<string, unknown> | null
  exportingAll: boolean
  fetchWorkouts: () => Promise<void>

  // Active session
  activeSession: Record<string, unknown> | null
  setActiveSession: React.Dispatch<React.SetStateAction<Record<string, unknown> | null>>
  nextWorkout: unknown

  // Current workout editor
  currentWorkout: unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setCurrentWorkout: (w: any) => void

  // Edit active workout
  editActiveOpen: boolean
  editActiveDraft: unknown
  setEditActiveDraft: (w: unknown) => void
  handleCloseActiveWorkoutEditor: () => void
  handleSaveActiveWorkoutEditor: (w: unknown) => void
  handleOpenActiveWorkoutEditor: (opts?: { addExercise?: boolean }) => void
  normalizeWorkoutForEditor: (w: unknown) => unknown

  // Report
  reportData: { current: unknown; previous: unknown }
  setReportData: (v: unknown) => void
  reportBackView: string

  // Export
  showExportModal: boolean
  setShowExportModal: (v: boolean) => void
  exportWorkout: unknown
  handleExportPdf: () => void
  handleExportJson: () => void

  // Student list
  openStudent: unknown
  setOpenStudent: (v: unknown) => void

  // Direct chat
  directChat: Record<string, unknown> | null
  setDirectChat: (v: Record<string, unknown>) => void

  // Wizard
  createWizardOpen: boolean
  setCreateWizardOpen: (v: boolean) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generateWorkoutFromWizard: (answers: any, dayIndex: number) => Record<string, unknown>
  formatProgramWorkoutTitle: (title: string, index: number, opts?: { startDay?: unknown }) => string
  createWorkout: (args: { title: string; exercises: unknown[] }) => Promise<{ ok: boolean; error?: string } | undefined>

  // Handlers
  handleCreateWorkout: () => void
  handleStartSession: (w: unknown) => void
  handleRestoreWorkout: (w: unknown) => void
  handleShareWorkout: (w: unknown) => void
  handleEditWorkout: (w: unknown) => void
  handleDeleteWorkout: (id: string, title: string) => void
  handleBulkEditWorkouts: (items: { id: string; title: string; sort_order: number }[]) => Promise<void>
  handleSaveWorkout: (w: unknown) => void
  handleUpdateSessionLog: (...args: unknown[]) => void
  handleFinishSession: (...args: unknown[]) => void
  handlePersistWorkoutTemplateFromSession: (...args: unknown[]) => void
  handleStartTimer: (...args: unknown[]) => void
  handleNormalizeAiWorkoutTitles: () => void
  handleNormalizeExercises: () => void
  handleApplyTitleRule: () => void
  handleSaveProfile: (v: unknown) => void
  handleExportAllWorkouts: () => void
  openManualWorkoutEditor: () => void
  handleAddStory: () => void
  handleMyStoryStateChange: (v: boolean) => void
  handleOpenHistory: () => void
  handleOpenChatList: () => void

  // Scroll ref
  mainScrollRef: React.RefObject<HTMLDivElement | null>

  // Header visibility
  isHeaderVisible: boolean

  // Misc
  showJsonImportModal: boolean
  setShowJsonImportModal: (v: boolean) => void

  // Logging
  logError: (context: string, error: unknown) => void
  getErrorMessage: (e: unknown) => string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  alert: (msg: string, title?: string) => Promise<any>

  // Back button
  BackButton: React.ComponentType<{ onClick: () => void; className?: string }>

  // Quick view
  setQuickViewWorkout: (w: unknown) => void
}

// ────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────

export function DashboardViewRouter(props: DashboardViewRouterProps) {
  const {
    view, setView, user, initialUserObj, isCoach, vipAccess, hideVipOnIos, vipStatus,
    openVipView, userSettingsApi, workouts, profileIncomplete, streakStats, exportingAll,
    fetchWorkouts, activeSession, setActiveSession, nextWorkout, currentWorkout, setCurrentWorkout,
    editActiveOpen, editActiveDraft, setEditActiveDraft, handleCloseActiveWorkoutEditor,
    handleSaveActiveWorkoutEditor, handleOpenActiveWorkoutEditor, normalizeWorkoutForEditor,
    reportData, setReportData, reportBackView, showExportModal, setShowExportModal,
    exportWorkout, handleExportPdf, handleExportJson, openStudent, setOpenStudent,
    directChat, setDirectChat, createWizardOpen, setCreateWizardOpen,
    generateWorkoutFromWizard, formatProgramWorkoutTitle, createWorkout,
    handleCreateWorkout, handleStartSession, handleRestoreWorkout, handleShareWorkout,
    handleEditWorkout, handleDeleteWorkout, handleBulkEditWorkouts, handleSaveWorkout,
    handleUpdateSessionLog, handleFinishSession, handlePersistWorkoutTemplateFromSession,
    handleStartTimer, handleNormalizeAiWorkoutTitles, handleNormalizeExercises,
    handleApplyTitleRule, handleExportAllWorkouts, openManualWorkoutEditor,
    handleAddStory, handleMyStoryStateChange, handleOpenHistory, handleOpenChatList,
    mainScrollRef, isHeaderVisible, setShowJsonImportModal, logError, getErrorMessage,
    alert, BackButton, setQuickViewWorkout,
  } = props

  const setReportBackView = (v: string) => { /* implemented via parent reportBackView prop */ }

  return (
    <div
      ref={mainScrollRef}
      className="flex-1 overflow-y-auto custom-scrollbar relative"
      style={({
        ['--dashboard-sticky-top' as unknown as keyof React.CSSProperties]: isHeaderVisible
          ? 'calc(4rem + env(safe-area-inset-top))'
          : '0px',
        paddingTop: isHeaderVisible ? 'calc(4rem + env(safe-area-inset-top))' : undefined,
      } as React.CSSProperties)}
    >
      <ViewTransition viewKey={view}>
      {/* Dashboard / Assessments / Community / VIP */}
      {(view === 'dashboard' || view === 'assessments' || view === 'community' || view === 'vip') && (
        <>
          {view === 'dashboard' && <WorkoutRecoveryBanner userId={String(user?.id || initialUserObj?.id || '')} />}
          <StudentDashboard
            workouts={Array.isArray(workouts) ? workouts : []}
            profileIncomplete={Boolean(profileIncomplete)}
            onOpenCompleteProfile={() => setView('profile')}
            view={view === 'assessments' ? 'assessments' : view === 'community' ? 'community' : view === 'vip' ? 'vip' : 'dashboard'}
            onChangeView={(next: string) => setView(next)}
            assessmentsContent={
              (user?.id || initialUserObj?.id) ? (
                <ErrorBoundary>
                  <Suspense fallback={<div className="p-4 text-neutral-400">Carregando…</div>}>
                    <AssessmentHistory studentId={String(user?.id || initialUserObj?.id || '')} onClose={() => setView('dashboard')} />
                  </Suspense>
                </ErrorBoundary>
              ) : null
            }
            communityContent={(user?.id || initialUserObj?.id) ? <CommunityClient embedded /> : null}
            vipContent={
              hideVipOnIos ? null :
                <VipHub
                  user={user as AdminUser}
                  locked={!vipAccess?.hasVip}
                  onOpenWorkoutEditor={(w: unknown) => handleEditWorkout(w)}
                  onOpenVipTab={() => openVipView()}
                  onStartSession={(w: unknown) => handleStartSession(w)}
                  onOpenWizard={() => setCreateWizardOpen(true)}
                  onOpenHistory={handleOpenHistory}
                  onOpenReport={(s: unknown) => {
                    setReportData({ current: s, previous: null });
                    setView('report');
                  }}
                />
            }
            vipLabel="VIP"
            vipLocked={hideVipOnIos ? true : !vipAccess?.hasVip}
            vipEnabled={!hideVipOnIos}
            settings={userSettingsApi?.settings ?? null}
            onCreateWorkout={handleCreateWorkout}
            onQuickView={(w) => setQuickViewWorkout(w)}
            onStartSession={(w) => handleStartSession(w)}
            onRestoreWorkout={(w: unknown) => handleRestoreWorkout(w)}
            onShareWorkout={(w: unknown) => handleShareWorkout(w)}
            onEditWorkout={(w: unknown) => handleEditWorkout(w)}
            onDeleteWorkout={(id: unknown, title: unknown) => {
              if (id) handleDeleteWorkout(String(id), String(title || ''))
            }}
            onBulkEditWorkouts={handleBulkEditWorkouts}
            currentUserId={String(user?.id || initialUserObj?.id || '')}
            exportingAll={Boolean(exportingAll)}
            onExportAll={handleExportAllWorkouts}
            streakStats={streakStats as { currentStreak: number; bestStreak: number; totalWorkouts: number; totalVolumeKg: number; badges: { id: string; label: string; kind: string }[] } | null}
            onOpenJsonImport={() => setShowJsonImportModal(true)}
            onNormalizeAiWorkoutTitles={handleNormalizeAiWorkoutTitles}
            onNormalizeExercises={handleNormalizeExercises}
            onApplyTitleRule={handleApplyTitleRule}
            onOpenIronScanner={() => {
              try { openManualWorkoutEditor() } catch { }
            }}
            onMyStoryStateChange={handleMyStoryStateChange}
            onAddStory={handleAddStory}
          />
        </>
      )}

      {/* Workout Wizard */}
      <WorkoutWizardModal
        isOpen={createWizardOpen}
        onClose={() => setCreateWizardOpen(false)}
        onManual={() => openManualWorkoutEditor()}
        onGenerate={async (answers, options) => {
          const mode = String(options?.mode || 'single').trim().toLowerCase();
          try {
            const res = await fetch('/api/ai/workout-wizard', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ answers, mode }),
            })
            const data = await res.json().catch((): unknown => null)
            if (!res.ok) {
              const msg = data?.error ? String(data.error) : 'Falha ao gerar treino com IA.'
              throw new Error(msg)
            }
            if (mode === 'program') {
              const drafts = Array.isArray(data?.drafts) ? data.drafts : null
              if (drafts && drafts.length) return { drafts }
              if (data?.ok === false && Array.isArray(data?.drafts) && data.drafts.length) return { drafts: data.drafts }
              throw new Error(data?.error ? String(data.error) : 'Resposta inválida da IA.')
            }
            const draft = data?.draft && typeof data.draft === 'object' ? data.draft : null
            if (draft?.exercises && Array.isArray(draft.exercises) && draft.exercises.length > 0) return draft
            if (data?.ok === false && data?.draft) return data.draft
            throw new Error(data?.error ? String(data.error) : 'Resposta inválida da IA.')
          } catch (e: unknown) {
            const msg = getErrorMessage(e)
            const lower = msg.toLowerCase()
            const isConfig = lower.includes('api de ia não configurada') || lower.includes('google_generative_ai_api_key')
            if (isConfig) throw e
            if (mode === 'program') {
              const days = Math.max(2, Math.min(6, Number(answers?.daysPerWeek || 3) || 3))
              const drafts: Array<Record<string, unknown>> = [];
              for (let i = 0; i < days; i++) {
                drafts.push(generateWorkoutFromWizard(answers, i))
              }
              return { drafts }
            }
            return generateWorkoutFromWizard(answers, 0)
          }
        }}
        onSaveDrafts={async (drafts) => {
          const list = Array.isArray(drafts) ? drafts : []
          if (!list.length) return
          try {
            for (let i = 0; i < list.length; i += 1) {
              const d = list[i]
              const baseTitle = String(d?.title || 'Treino').trim() || 'Treino'
              const finalTitle = formatProgramWorkoutTitle(baseTitle, i, { startDay: userSettingsApi?.settings?.programTitleStartDay })
              const exercises = Array.isArray(d?.exercises) ? d.exercises : []
              const res = await createWorkout({ title: finalTitle, exercises })
              if (!res?.ok) throw new Error(String(res?.error || 'Falha ao salvar treino'))
            }
            try {
              await fetchWorkouts()
            } catch (e) { logError('IronTracksApp.refetchAfterSaveDrafts', e) }
            setCreateWizardOpen(false)
            await alert(`Plano salvo: ${list.length} treinos criados.`)
          } catch (e: unknown) {
            const msg = getErrorMessage(e)
            await alert('Erro ao salvar plano: ' + msg)
          }
        }}
        onUseDraft={(draft) => {
          try {
            const title = String(draft?.title || '').trim() || 'Treino'
            const exercises = (Array.isArray(draft?.exercises) ? draft.exercises : []) as import('@/types/app').Exercise[]
            setCurrentWorkout({ title, exercises } as unknown as Record<string, unknown>)
            setView('edit')
          } finally {
            setCreateWizardOpen(false)
          }
        }}
      />

      {/* Editor */}
      {view === 'edit' && (
        <SectionErrorBoundary section="Editor de Treino" fullScreen onReset={() => setView('dashboard')}>
          <ExerciseEditor
            workout={currentWorkout as unknown as Workout}
            onCancel={() => setView('dashboard')}
            onChange={(w: unknown) => setCurrentWorkout(w as unknown as ActiveWorkoutSession)}
            onSave={async (w: unknown) => { handleSaveWorkout(w) }}
            onSaved={() => {
              fetchWorkouts().catch(() => { });
              setView('dashboard');
            }}
          />
        </SectionErrorBoundary>
      )}

      {/* Active Workout */}
      {view === 'active' && activeSession && (
        <SectionErrorBoundary section="Treino Ativo" fullScreen onReset={() => setView('dashboard')}>
          <ActiveWorkout
            session={activeSession as Record<string, unknown>}
            user={user as AdminUser}
            settings={userSettingsApi?.settings ?? null}
            onUpdateLog={(...args: unknown[]) => handleUpdateSessionLog(...args)}
            onFinish={(...args: unknown[]) => handleFinishSession(...args)}
            onPersistWorkoutTemplate={(...args: unknown[]) => handlePersistWorkoutTemplateFromSession(...args)}
            onBack={() => setView('dashboard')}
            onStartTimer={(...args: unknown[]) => handleStartTimer(...args)}
            isCoach={isCoach}
            onUpdateSession={(updates: unknown) =>
              setActiveSession((prev) => {
                if (!prev) return prev
                const u = updates && typeof updates === 'object' ? (updates as Record<string, unknown>) : {}
                return { ...prev, ...(u as Partial<ActiveWorkoutSession>) }
              })
            }
            nextWorkout={nextWorkout as Record<string, unknown> | null}
            onEditWorkout={() => handleOpenActiveWorkoutEditor()}
            onAddExercise={() => handleOpenActiveWorkoutEditor({ addExercise: true })}
          />
        </SectionErrorBoundary>
      )}

      {/* Edit Active Workout Editor Overlay */}
      {editActiveOpen && view === 'active' && editActiveDraft && (
        <div
          className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 pt-safe"
          onClick={() => handleCloseActiveWorkoutEditor()}
        >
          <div
            className="w-full max-w-5xl h-[92vh] bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <ExerciseEditor
              workout={editActiveDraft as unknown as Workout}
              onCancel={() => handleCloseActiveWorkoutEditor()}
              onChange={(w: unknown) => setEditActiveDraft(normalizeWorkoutForEditor(w))}
              onSave={async (w: unknown) => { handleSaveActiveWorkoutEditor(w) }}
              onSaved={() => {
                fetchWorkouts().catch(() => { });
                handleCloseActiveWorkoutEditor();
              }}
            />
          </div>
        </div>
      )}

      {/* History */}
      {view === 'history' && (
        <SectionErrorBoundary section="Histórico" fullScreen onReset={() => setView('dashboard')}>
          <HistoryList
            user={user as AdminUser}
            settings={(userSettingsApi?.settings ?? undefined) as Record<string, unknown> | undefined}
            onViewReport={(s: unknown) => { setReportData({ current: s, previous: null }); setView('report'); }}
            onBack={() => setView('dashboard')}
            targetId={String(user?.id || '')}
            targetEmail={user?.email ? String(user.email) : ''}
            readOnly={false}
            title="Histórico"
            vipLimits={(vipStatus?.limits as Record<string, unknown>) ?? undefined}
            onUpgrade={() => openVipView()}
          />
        </SectionErrorBoundary>
      )}

      {/* Report */}
      {view === 'report' && reportData.current && (
        <div className="fixed inset-0 z-[1200] bg-neutral-900 overflow-y-auto pt-safe">
          <SectionErrorBoundary section="Relatório" fullScreen onReset={() => setView(reportBackView || 'dashboard')}>
            <WorkoutReport
              session={reportData.current as Record<string, unknown> | null}
              previousSession={reportData.previous as Record<string, unknown> | null}
              user={user as AdminUser}
              isVip={vipAccess?.hasVip}
              settings={userSettingsApi?.settings ?? null}
              onUpgrade={() => openVipView()}
              onClose={() => setView(reportBackView || 'dashboard')}
            />
          </SectionErrorBoundary>
        </div>
      )}

      {/* Profile Page */}
      {view === 'profile' && (
        <div className="fixed inset-0 z-[1200] bg-neutral-950 overflow-y-auto">
          <SectionErrorBoundary section="Perfil" fullScreen onReset={() => setView('dashboard')}>
            <ProfilePage
              settings={userSettingsApi?.settings as import('@/schemas/settings').UserSettings | null}
              displayName={String(user?.displayName || user?.email || 'Atleta')}
              onBack={() => setView('dashboard')}
              onSave={async (next) => {
                try {
                  const current = userSettingsApi?.settings && typeof userSettingsApi.settings === 'object'
                    ? (userSettingsApi.settings as Record<string, unknown>)
                    : {}
                  const merged = { ...current, ...next }
                  const saveFn = userSettingsApi?.save as ((v: unknown) => Promise<{ ok: boolean; error?: string }>) | undefined
                  const res = await saveFn?.(merged)
                  return !!res?.ok
                } catch (e) { logError('IronTracksApp.saveSettings', e); return false }
              }}
            />
          </SectionErrorBoundary>
        </div>
      )}

      {/* Chat */}
      {view === 'chat' && (
        <div className="absolute inset-0 z-50 bg-neutral-900">
          <SectionErrorBoundary section="Chat" fullScreen onReset={() => setView('dashboard')}>
            <ChatScreen user={user as AdminUser} onClose={() => setView('dashboard')} />
          </SectionErrorBoundary>
        </div>
      )}

      {view === 'globalChat' && (
        <div className="absolute inset-0 z-50 bg-neutral-900">
          <SectionErrorBoundary section="Chat Global" fullScreen onReset={() => setView('dashboard')}>
            <ChatScreen user={user as AdminUser} onClose={() => setView('dashboard')} />
          </SectionErrorBoundary>
        </div>
      )}

      {view === 'chatList' && (
        <div className="absolute inset-0 z-50 bg-neutral-900">
          <ChatListScreen
            user={user as AdminUser}
            onClose={() => setView('dashboard')}
            onSelectUser={() => { }}
            onSelectChannel={(c: unknown) => {
              const ch = isRecord(c) ? c : {}
              const channelId = String(ch.channel_id ?? ch.channelId ?? '')
              const otherUserId = String(ch.other_user_id ?? ch.otherUserId ?? ch.user_id ?? ch.userId ?? '')
              const otherUserName = String(ch.other_user_name ?? ch.otherUserName ?? ch.displayName ?? '')
              const photoUrlRaw = ch.other_user_photo ?? ch.otherUserPhoto ?? ch.photoUrl ?? null
              const photoUrl = photoUrlRaw != null ? String(photoUrlRaw) : null
              setDirectChat({
                channelId,
                userId: otherUserId,
                displayName: otherUserName || undefined,
                photoUrl,
                other_user_id: otherUserId,
                other_user_name: otherUserName || undefined,
                other_user_photo: photoUrl,
              })
              setView('directChat')
            }}
          />
        </div>
      )}

      {view === 'directChat' && directChat && (
        <div className="absolute inset-0 z-50 bg-neutral-900">
          <SectionErrorBoundary section="Chat Direto" fullScreen onReset={() => setView('chatList')}>
            <ChatDirectScreen
              user={user as AdminUser}
              targetUser={directChat}
              otherUserId={String(directChat.other_user_id ?? directChat.userId ?? '')}
              otherUserName={String(directChat.other_user_name ?? directChat.displayName ?? '')}
              otherUserPhoto={String(directChat.other_user_photo ?? directChat.photoUrl ?? '') || null}
              onClose={handleOpenChatList}
            />
          </SectionErrorBoundary>
        </div>
      )}

      </ViewTransition>

      {/* Admin — rendered OUTSIDE ViewTransition to avoid opacity transition hiding the fixed overlay */}
      {view === 'admin' && (
        <div className="fixed inset-0 z-[60]">
          <SectionErrorBoundary section="Painel Admin" fullScreen onReset={() => setView('dashboard')}>
            <AdminPanelV2 user={user as AdminUser} onClose={() => setView('dashboard')} />
          </SectionErrorBoundary>
        </div>
      )}
    </div>
  )
}
