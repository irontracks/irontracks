'use client'

import React from 'react'

import StudentDashboard, { type DashboardWorkout } from './StudentDashboard'

type MaybePromise<T> = T | Promise<T>

type Props = {
  workouts: DashboardWorkout[]
  profileIncomplete: boolean
  onOpenCompleteProfile: () => void
  view: 'dashboard' | 'assessments'
  onChangeView: (next: 'dashboard' | 'assessments') => void
  assessmentsContent?: React.ReactNode
  onCreateWorkout: () => MaybePromise<void>
  onQuickView: (w: DashboardWorkout) => void
  onStartSession: (w: DashboardWorkout) => MaybePromise<void | boolean>
  onShareWorkout: (w: DashboardWorkout) => MaybePromise<void>
  onDuplicateWorkout: (w: DashboardWorkout) => MaybePromise<void>
  onEditWorkout: (w: DashboardWorkout) => MaybePromise<void>
  onDeleteWorkout: (id?: string, title?: string) => MaybePromise<void>
  currentUserId?: string
  exportingAll?: boolean
  onExportAll: () => MaybePromise<void>
  onOpenJsonImport: () => void
}

export default function TeacherDashboard(props: Props) {
  return <StudentDashboard {...props} />
}
