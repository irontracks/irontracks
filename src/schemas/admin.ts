import { z } from 'zod'

export const AssignTeacherSchema = z.object({
  student_id: z.string().uuid('student_id inválido'),
  teacher_id: z.string().uuid('teacher_id inválido'),
})
export type AssignTeacher = z.infer<typeof AssignTeacherSchema>

export const StudentStatusSchema = z.object({
  student_id: z.string().uuid('student_id inválido'),
  status: z.enum(['active', 'inactive']),
})
export type StudentStatus = z.infer<typeof StudentStatusSchema>

export const TeacherStatusSchema = z.object({
  teacher_id: z.string().uuid('teacher_id inválido'),
  status: z.enum(['active', 'inactive', 'suspended']),
})
export type TeacherStatus = z.infer<typeof TeacherStatusSchema>

export const AccessRequestActionSchema = z.object({
  request_id: z.string().uuid('request_id inválido'),
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
})
export type AccessRequestAction = z.infer<typeof AccessRequestActionSchema>

export const VipEntitlementSchema = z.object({
  user_id: z.string().uuid('user_id inválido'),
  plan: z.enum(['basic', 'pro', 'elite']),
  expires_at: z.string().datetime().nullable().optional(),
  credits: z.number().int().min(0).optional(),
})
export type VipEntitlement = z.infer<typeof VipEntitlementSchema>
