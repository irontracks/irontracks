import { z } from 'zod';

export const StudentIdParamSchema = z.object({
  studentId: z.string().uuid('ID do aluno inválido'),
});

export const CodeParamSchema = z.object({
  code: z.string().min(1, 'Código inválido'),
});

export const IdParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
});
