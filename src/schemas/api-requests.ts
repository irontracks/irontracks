import { z } from 'zod'

// Paginação padrão
export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
export type Pagination = z.infer<typeof PaginationSchema>

// UUID param
export const UuidParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
})

// User ID param
export const UserIdParamSchema = z.object({
  user_id: z.string().uuid('user_id inválido'),
})

// Student ID param
export const StudentIdParamSchema = z.object({
  student_id: z.string().uuid('student_id inválido'),
})

// Busca textual
export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
})

// Date range
export const DateRangeSchema = z.object({
  from: z.string().datetime({ message: 'Data inicial inválida' }).optional(),
  to: z.string().datetime({ message: 'Data final inválida' }).optional(),
})
