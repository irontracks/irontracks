'use client'

import React from 'react'

import StudentDashboard, { type DashboardWorkout } from './StudentDashboard'

type Props = {
  workouts: DashboardWorkout[]
  profileIncomplete: boolean
  onOpenCompleteProfile: () => void
  view: 'dashboard' | 'assessments'
  onChangeView: (next: 'dashboard' | 'assessments') => void
  onCreateWorkout: () => void
  onQuickView: (w: DashboardWorkout) => void
  onStartSession: (w: DashboardWorkout) => void
  onShareWorkout: (w: DashboardWorkout) => void
  onDuplicateWorkout: (w: DashboardWorkout) => void
  onEditWorkout: (w: DashboardWorkout) => void
  onDeleteWorkout: (id?: string, title?: string) => void
  currentUserId?: string
  exportingAll?: boolean
  onExportAll: () => void
  onOpenJsonImport: () => void
}

export default function TeacherDashboard(props: Props) {
  return <StudentDashboard {...props} />
}

