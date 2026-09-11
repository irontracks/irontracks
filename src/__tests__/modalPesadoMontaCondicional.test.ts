import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Modal cujos HOOKS custam rede não pode ser montado sempre.
 *
 * ⚠️ Este é um guard de FORMA, e declaro o limite: ele confere o call site, não
 * o comportamento. Para os dois casos abaixo a defesa REAL está em outro lugar
 * — `nutritionDayFlagsSoConsultaAberto.test.tsx` testa o hook por comportamento
 * e é provado por mutação. Este arquivo existe para o caso de alguém desfazer a
 * condicional achando que é ruído de JSX.
 *
 * O defeito é de ORDEM, e por isso ele não aparece lendo o componente: hooks
 * rodam ANTES do `return null`. Os dois modais devolviam `null` fechados e
 * mesmo assim iam à rede — `useNutritionDayFlags` com um SELECT por abertura da
 * aba Nutrição, `useAssessment` com um `auth.getUser()` por abertura da aba
 * Avaliações (o segundo da mesma tela). Varredura de classe de 10/09/2026.
 *
 * Nenhum dos dois tem animação de saída a preservar: o `AnimatePresence` do
 * QuickBIAModal está DEPOIS do `if (!isOpen) return null`.
 */
const raiz = join(__dirname, '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf8')

const CASOS = [
    {
        nome: 'NutritionHistoryModal',
        arquivo: 'src/components/dashboard/nutrition/NutritionMixer.tsx',
        condicional: /\{historyOpen && \(\s*<NutritionHistoryModal/,
        custo: 'SELECT em nutrition_day_flags',
    },
    {
        nome: 'QuickBIAModal',
        arquivo: 'src/components/assessment/AssessmentHistory.tsx',
        condicional: /\{studentId && quickBiaOpen && \(\s*<QuickBIAModal/,
        custo: 'supabase.auth.getUser()',
    },
]

describe('modal com hook de rede é montado condicionalmente', () => {
    for (const c of CASOS) {
        it(`${c.nome} não monta fechado (custo: ${c.custo})`, () => {
            const src = ler(c.arquivo)
            expect(
                src,
                `${c.nome} voltou a ser montado sempre — os hooks dele rodam antes do return null`,
            ).toMatch(c.condicional)
        })
    }
})
