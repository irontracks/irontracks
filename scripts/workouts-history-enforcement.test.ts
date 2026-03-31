const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

const routePath = path.join(repoRoot, 'src', 'app', 'api', 'workouts', 'history', 'route.ts')
assert.ok(fs.existsSync(routePath), 'workouts/history route missing')
const routeText = fs.readFileSync(routePath, 'utf8')
assert.ok(routeText.includes('history_days'), 'workouts/history should expose history_days')
assert.ok(routeText.includes('getVipPlanLimits'), 'workouts/history must use getVipPlanLimits')

// HistoryList delegates fetching to useHistoryData hook
const useHistoryDataPath = path.join(repoRoot, 'src', 'components', 'history', 'hooks', 'useHistoryData.ts')
const historyListPath = path.join(repoRoot, 'src', 'components', 'HistoryList.tsx')
assert.ok(fs.existsSync(historyListPath), 'HistoryList.tsx missing')
const fetcherPath = fs.existsSync(useHistoryDataPath) ? useHistoryDataPath : historyListPath
const fetcherText = fs.readFileSync(fetcherPath, 'utf8')
assert.ok(fetcherText.includes('/api/workouts/history'), 'HistoryList (or its hook) should fetch /api/workouts/history')
assert.ok(!fetcherText.includes(".eq('user_id', baseUserId)"), 'HistoryList should not query workouts history via supabase client')

process.stdout.write('ok\n')

