/**
 * Tests for resolveRoleByUser — core role resolution logic.
 * Mocks createAdminClient to avoid real DB calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock before importing the module under test
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}))

const makeSupabaseMock = (overrides: {
  profileRole?: string | null
  teacherById?: boolean
  teacherByEmail?: boolean
}) => {
  const from = vi.fn().mockImplementation((table: string) => {
    const select = vi.fn().mockReturnThis()
    const eq = vi.fn().mockReturnThis()
    const ilike = vi.fn().mockReturnThis()
    const maybeSingle = vi.fn().mockImplementation(async () => {
      if (table === 'profiles') {
        return { data: overrides.profileRole !== undefined ? { role: overrides.profileRole } : null }
      }
      if (table === 'teachers') {
        const isEmailCall = ilike.mock.calls.length > 0
        if (isEmailCall && overrides.teacherByEmail) return { data: { id: 'teacher-uuid' } }
        if (!isEmailCall && overrides.teacherById) return { data: { id: 'teacher-uuid' } }
        return { data: null }
      }
      return { data: null }
    })
    return { select, eq, ilike, maybeSingle }
  })
  return { from }
}

describe('resolveRoleByUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.IRONTRACKS_ADMIN_EMAIL = 'admin@irontracks.com'
  })

  it('returns admin role for the configured admin email', async () => {
    const { createAdminClient } = await import('@/utils/supabase/admin')
    vi.mocked(createAdminClient).mockReturnValue(makeSupabaseMock({}) as never)

    const { resolveRoleByUser } = await import('@/utils/auth/route')
    const result = await resolveRoleByUser({ id: 'any-uuid', email: 'admin@irontracks.com' })
    expect(result.role).toBe('admin')
  })

  it('returns admin role when profile.role = admin', async () => {
    const { createAdminClient } = await import('@/utils/supabase/admin')
    vi.mocked(createAdminClient).mockReturnValue(makeSupabaseMock({ profileRole: 'admin' }) as never)

    const { resolveRoleByUser } = await import('@/utils/auth/route')
    const result = await resolveRoleByUser({ id: 'user-123', email: 'other@example.com' })
    expect(result.role).toBe('admin')
  })

  it('returns teacher role when profile.role = teacher', async () => {
    const { createAdminClient } = await import('@/utils/supabase/admin')
    vi.mocked(createAdminClient).mockReturnValue(makeSupabaseMock({ profileRole: 'teacher' }) as never)

    const { resolveRoleByUser } = await import('@/utils/auth/route')
    const result = await resolveRoleByUser({ id: 'user-123', email: 'teacher@example.com' })
    expect(result.role).toBe('teacher')
  })

  it('returns teacher role when teacher row found by user_id', async () => {
    const { createAdminClient } = await import('@/utils/supabase/admin')
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabaseMock({ profileRole: 'user', teacherById: true }) as never
    )

    const { resolveRoleByUser } = await import('@/utils/auth/route')
    const result = await resolveRoleByUser({ id: 'user-123', email: 'someone@example.com' })
    expect(result.role).toBe('teacher')
  })

  it('returns user role when no admin/teacher match found', async () => {
    const { createAdminClient } = await import('@/utils/supabase/admin')
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabaseMock({ profileRole: 'user', teacherById: false, teacherByEmail: false }) as never
    )

    const { resolveRoleByUser } = await import('@/utils/auth/route')
    const result = await resolveRoleByUser({ id: 'user-123', email: 'student@example.com' })
    expect(result.role).toBe('user')
  })

  it('returns user role when userId is empty', async () => {
    const { createAdminClient } = await import('@/utils/supabase/admin')
    vi.mocked(createAdminClient).mockReturnValue(makeSupabaseMock({}) as never)

    const { resolveRoleByUser } = await import('@/utils/auth/route')
    const result = await resolveRoleByUser({ id: '', email: 'someone@example.com' })
    expect(result.role).toBe('user')
  })

  it('handles DB errors gracefully and falls through to user role', async () => {
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockRejectedValue(new Error('DB error')),
    })
    const { createAdminClient } = await import('@/utils/supabase/admin')
    vi.mocked(createAdminClient).mockReturnValue({ from } as never)

    const { resolveRoleByUser } = await import('@/utils/auth/route')
    const result = await resolveRoleByUser({ id: 'user-123', email: 'someone@example.com' })
    expect(result.role).toBe('user')
  })
})
