
import type { Workout, Exercise } from '@/types/app'

export interface AdminUser {
  id: string;
  email?: string;
  name?: string;
  displayName?: string;
  role?: string;
  photo_url?: string;
  status?: string;
  teacher_id?: string;
  created_at?: string;
  last_sign_in_at?: string;
  plan?: string;
  phone?: string;
  birth_date?: string;
  gender?: string;
  objective?: string;
  injuries?: string;
  training_days?: string;
  experience_level?: string;
  gym_access?: boolean;
  active?: boolean;
  workouts?: Workout[];
  last_workout?: Workout | null;
  [key: string]: unknown;
}

export interface AdminTeacher extends AdminUser {
  specialty?: string;
  bio?: string;
  instagram?: string;
  students_count?: number;
}

export interface AdminStudent extends AdminUser {
  teacher_name?: string;
  last_workout_date?: string;
  workouts_count?: number;
  [key: string]: unknown;
}

export interface ErrorReport {
  id: string;
  user_id?: string;
  user_email?: string;
  userEmail?: string; // Legacy support
  message: string;
  stack?: string;
  pathname?: string;
  created_at: string;
  status: 'open' | 'resolved' | 'ignored' | string;
  browser_info?: string;
  os_info?: string;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ExecutionVideo {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  exercise_name: string;
  video_url: string;
  feedback?: string;
  status: 'pending' | 'reviewed' | 'approved' | 'rejected' | string;
  created_at: string;
  workout_id?: string;
  [key: string]: unknown;
}

export interface AdminWorkoutTemplate {
  id: string;
  title: string;
  description?: string;
  exercises: Exercise[];
  created_at: string;
  updated_at?: string;
  is_public?: boolean;
  owner_id?: string;
  tags?: string[];
  difficulty?: string;
  [key: string]: unknown;
}
