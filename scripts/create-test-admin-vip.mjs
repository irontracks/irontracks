#!/usr/bin/env node
/**
 * Create a test account with admin role + VIP Elite entitlement.
 *
 * Why both?
 *   - role='admin' grants admin panel access (Usuários, VIP, Solicitações)
 *     and is itself a fast-path to VIP Elite limits inside getVipPlanLimits.
 *   - user_entitlements row with plan_id='vip_elite' covers the entitlements-
 *     table code path, so anything that bypasses the role shortcut still
 *     resolves to Elite tier (analytics, chef_ai, offline, unlimited macros).
 *
 * Usage:
 *   node scripts/create-test-admin-vip.mjs                       # default email
 *   node scripts/create-test-admin-vip.mjs --email foo@bar.com   # custom email
 *   node scripts/create-test-admin-vip.mjs --password mypass123  # custom password
 *   node scripts/create-test-admin-vip.mjs --days 365            # entitlement length
 *
 * Reads SUPABASE credentials from `.env.local`. Prints email + password +
 * user_id at the end so you can log in immediately.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// ─── Load .env.local ───────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), '.env.local')
const envText = await readFile(envPath, 'utf8').catch(() => '')
for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env.local')
    process.exit(1)
}

// ─── Parse CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(name, fallback) {
    const idx = args.indexOf(`--${name}`)
    if (idx >= 0 && args[idx + 1]) return args[idx + 1]
    return fallback
}

const email = getArg('email', 'admin-test@irontracks.com.br').toLowerCase()
const password = getArg('password', generatePassword(20))
const days = Number(getArg('days', '365'))
const fullName = getArg('name', 'Admin Teste')

function generatePassword(length) {
    // Strong password — alphanumeric + symbols, base64url-style for shell-safe copy/paste
    return crypto.randomBytes(length).toString('base64url').slice(0, length)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
})

console.log('Configuration:')
console.log('  email :', email)
console.log('  name  :', fullName)
console.log('  days  :', days, '(VIP Elite duration)')
console.log('')

// ─── 1. Create or find auth user ───────────────────────────────────────────
console.log('→ Looking up existing user...')
let userId = null
{
    // Supabase admin doesn't have a "find by email" helper that scales —
    // we list and filter. For test setup that's fine; production code paths
    // would never do this.
    const { data: list } = await admin.auth.admin.listUsers()
    const found = list?.users?.find((u) => String(u.email || '').toLowerCase() === email)
    if (found) {
        userId = found.id
        console.log(`  Found existing user: ${userId}`)
        // Reset the password so the caller can log in even if they don't
        // remember the old one.
        const { error: pwErr } = await admin.auth.admin.updateUserById(userId, {
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName, display_name: fullName },
        })
        if (pwErr) {
            console.error('❌ Failed to reset password:', pwErr.message)
            process.exit(1)
        }
        console.log('  Password reset.')
    }
}

if (!userId) {
    // The Supabase auth.users INSERT trigger gates all signups: the email
    // must already be on the admin whitelist (admin_emails), have an
    // access_request with status pending/approved/accepted, or already
    // exist in students/teachers. For test accounts we drop a synthetic
    // approved access_request first, then create the user — the gate
    // accepts that path even for fresh emails.
    console.log('→ Pre-creating approved access_request (gate bypass)...')
    const { error: arErr } = await admin
        .from('access_requests')
        .upsert(
            {
                email,
                full_name: fullName,
                status: 'approved',
                // role_requested check constraint accepts 'student'/'teacher';
                // 'student' is the default path the handle_new_user trigger
                // takes for non-teacher users — we promote to admin afterwards.
                role_requested: 'student',
            },
            { onConflict: 'email' },
        )
    if (arErr && !String(arErr.message).toLowerCase().includes('duplicate')) {
        // duplicate is fine — the trigger only checks existence
        console.error('❌ Failed to seed access_request:', arErr.message)
        process.exit(1)
    }

    console.log('→ Creating new auth user...')
    const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, display_name: fullName },
    })
    if (error || !data?.user?.id) {
        console.error('❌ Failed to create user:', error?.message || 'unknown error')
        process.exit(1)
    }
    userId = data.user.id
    console.log(`  Created: ${userId}`)
}

// ─── 2. Wait for handle_new_user trigger to populate profiles ──────────────
console.log('→ Waiting for profiles row...')
let profileExists = false
for (let attempt = 1; attempt <= 5; attempt++) {
    const { data } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle()
    if (data?.id) { profileExists = true; break }
    await new Promise((r) => setTimeout(r, 500))
}

if (!profileExists) {
    // Trigger didn't fire (or was disabled). Insert manually.
    console.log('  Trigger did not run — inserting profile manually...')
    const { error: pErr } = await admin.from('profiles').insert({
        id: userId,
        email,
        display_name: fullName,
        role: 'admin',
        is_approved: true,
    })
    if (pErr) {
        console.error('❌ Failed to insert profile:', pErr.message)
        process.exit(1)
    }
} else {
    console.log('  Profile exists.')
}

// ─── 3. Promote to admin (idempotent) ──────────────────────────────────────
console.log('→ Promoting to admin role...')
const { error: roleErr } = await admin
    .from('profiles')
    .update({ role: 'admin', is_approved: true, display_name: fullName })
    .eq('id', userId)
if (roleErr) {
    console.error('❌ Failed to set admin role:', roleErr.message)
    process.exit(1)
}
console.log('  role=admin, is_approved=true')

// ─── 4. Grant VIP Elite entitlement ────────────────────────────────────────
console.log('→ Granting VIP Elite entitlement...')
const now = new Date()
const validFrom = now.toISOString()
const validUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()

// Look for an existing admin-grant entitlement we can extend; otherwise insert.
const { data: existing } = await admin
    .from('user_entitlements')
    .select('id, plan_id, provider, valid_until, status')
    .eq('user_id', userId)
    .eq('provider', 'admin')
    .eq('plan_id', 'vip_elite')
    .order('valid_until', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

if (existing?.id) {
    const { error: upErr } = await admin
        .from('user_entitlements')
        .update({ status: 'active', valid_from: validFrom, valid_until: validUntil })
        .eq('id', existing.id)
    if (upErr) {
        console.error('❌ Failed to update entitlement:', upErr.message)
        process.exit(1)
    }
    console.log(`  Renewed existing entitlement until ${validUntil}`)
} else {
    const { error: insErr } = await admin.from('user_entitlements').insert({
        user_id: userId,
        plan_id: 'vip_elite',
        status: 'active',
        provider: 'admin',
        valid_from: validFrom,
        valid_until: validUntil,
    })
    if (insErr) {
        console.error('❌ Failed to create entitlement:', insErr.message)
        process.exit(1)
    }
    console.log(`  Created entitlement valid until ${validUntil}`)
}

// ─── Done ──────────────────────────────────────────────────────────────────
console.log('')
console.log('✅ Test account ready!')
console.log('')
console.log('  Email    :', email)
console.log('  Password :', password)
console.log('  User ID  :', userId)
console.log('  Role     : admin')
console.log('  VIP Tier : vip_elite (until', validUntil + ')')
console.log('')
console.log('Login at http://localhost:3000 (dev) or https://irontracks.com.br (prod).')
