// Teste simplificado da lógica de trimming
// Como não temos DOM real aqui, simulamos os eventos e estados

const MIN_DURATION = 1
const MAX_DURATION = 15

// Lógica pura de cálculo de range
const calculateNewRange = (
    currentStart, 
    currentEnd, 
    newTime, 
    type, // 'start' | 'end'
    duration
) => {
    let start = currentStart
    let end = currentEnd
    
    if (type === 'start') {
        const maxStart = end - MIN_DURATION
        const minStart = Math.max(0, end - MAX_DURATION)
        start = Math.max(minStart, Math.min(maxStart, newTime))
    } else {
        const minEnd = start + MIN_DURATION
        const maxEnd = Math.min(duration, start + MAX_DURATION)
        end = Math.max(minEnd, Math.min(maxEnd, newTime))
    }
    return [start, end]
}

// --- Test Runner ---
let passed = 0
let failed = 0

function assert(desc, cond) {
    if (cond) {
        console.log(`✅ ${desc}`)
        passed++
    } else {
        console.error(`❌ ${desc}`)
        failed++
    }
}

console.log('--- Iniciando Testes de Trimming Logic ---\n')

// Caso 1: Mover inicio normalmente
// 0-10s, mover inicio para 2s
let res = calculateNewRange(0, 10, 2, 'start', 60)
assert('Move Start Normal', res[0] === 2 && res[1] === 10)

// Caso 2: Tentar mover inicio além do fim (min duration)
// 0-10s, mover inicio para 9.5s (deve travar em 9s pois min é 1s)
res = calculateNewRange(0, 10, 9.5, 'start', 60)
assert('Constraint Min Duration (Start)', res[0] === 9 && res[1] === 10)

// Caso 3: Tentar estender fim além do max (max duration)
// 0-10s, mover fim para 20s (max é 15s, então deve ir até 15s)
res = calculateNewRange(0, 10, 20, 'end', 60)
assert('Constraint Max Duration (End)', res[0] === 0 && res[1] === 15)

// Caso 4: Mover fim para trás do inicio (min duration)
// 5-10s, mover fim para 5.5s (deve travar em 6s)
res = calculateNewRange(5, 10, 5.5, 'end', 60)
assert('Constraint Min Duration (End)', res[0] === 5 && res[1] === 6)

// Caso 5: Tentar mover inicio para trás demais (max duration constraint relative to end)
// 20-30s, mover inicio para 0s (deve travar em 15s pois 30-15=15)
res = calculateNewRange(20, 30, 0, 'start', 60)
assert('Constraint Max Duration (Start)', res[0] === 15 && res[1] === 30)

console.log(`\n--- Resultados: ${passed} Passou, ${failed} Falhou ---`)
if (failed > 0) process.exit(1)
