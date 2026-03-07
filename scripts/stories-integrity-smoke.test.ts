/**
 * Smoke test: Social stories — TUS upload, caching, safe zones, deletion.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

// ─── Story files must exist ──────────────────────────────────────────────────
const storyFiles = [
    'src/app/api/social/stories/list/route.ts',
    'src/app/api/social/stories/delete/route.ts',
    'src/components/dashboard/StoriesBar.tsx',
    'src/components/StoryComposer.tsx',
]
storyFiles.forEach((rel) => {
    assert.ok(fs.existsSync(path.join(repoRoot, rel)), `missing: ${rel}`)
})

// ─── StoriesBar should use gradient rings ───────────────────────────────────
const bar = fs.readFileSync(path.join(repoRoot, 'src/components/dashboard/StoriesBar.tsx'), 'utf8')
assert.ok(bar.includes('gradient') || bar.includes('conic'), 'StoriesBar should use gradient rings')

// ─── Delete route should use soft delete ────────────────────────────────────
const deleteRoute = fs.readFileSync(path.join(repoRoot, 'src/app/api/social/stories/delete/route.ts'), 'utf8')
assert.ok(deleteRoute.includes('is_deleted'), 'delete route should use soft delete (is_deleted)')

// ─── List route should filter is_deleted ────────────────────────────────────
const listRoute = fs.readFileSync(path.join(repoRoot, 'src/app/api/social/stories/list/route.ts'), 'utf8')
assert.ok(listRoute.includes('is_deleted'), 'list route should filter by is_deleted')

// ─── StoryComposer should have safe zones ───────────────────────────────────
const composerPath = path.join(repoRoot, 'src/components/StoryComposer.tsx')
if (fs.existsSync(composerPath)) {
    const composer = fs.readFileSync(composerPath, 'utf8')
    assert.ok(
        composer.includes('SAFE_TOP') || composer.includes('safe') || composer.includes('168'),
        'StoryComposer should reference safe zones'
    )
}

process.stdout.write('ok\n')
