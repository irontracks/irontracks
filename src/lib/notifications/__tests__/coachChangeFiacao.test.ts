/**
 * Guard de FIAÇÃO: o trabalho do coach não pode voltar a chegar calado.
 *
 * O módulo `coachChangeNotice` passa verde sozinho enquanto ninguém o chama —
 * é a ponta certa com a fiação errada, o defeito que a suíte deste repo já
 * deixou passar mais de uma vez (o card do Diário depois de um early return, a
 * Central com `metadata` não copiada). Aqui a checagem é em QUEM ESCREVE:
 * cada superfície em que o coach altera treino ou dieta precisa disparar o
 * aviso, e a preferência do aluno precisa existir dos DOIS lados (schema e
 * mapa de tipos) — senão o toggle aparece e não faz nada, ou o tipo é enviado
 * sem toggle para desligar.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NOTIFICATION_TYPE_TO_PREFERENCE } from '@/lib/social/notifyFollowers'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const semComentarios = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

/** As superfícies em que o coach mexe no plano do aluno, e o que cada uma dispara. */
const SUPERFICIES: Array<{ arquivo: string; o_que: string }> = [
    // Dieta: escrita no SERVIDOR, chama o módulo direto.
    { arquivo: 'src/app/api/teacher/diet/prescribe/route.ts', o_que: 'prescreve o plano alimentar' },
    { arquivo: 'src/app/api/teacher/diet/note/route.ts', o_que: 'escreve a orientação de uma refeição' },
    // Medicamentos: o professor edita a lista do aluno pela rota própria (POST/PATCH/DELETE).
    { arquivo: 'src/app/api/teacher/medications/route.ts', o_que: 'cria, edita e apaga os remédios do aluno' },
    // Treino: sync de templates roda no servidor…
    { arquivo: 'src/app/api/admin/workouts/sync-templates/route.ts', o_que: 'empurra os templates para o aluno' },
    // …e a edição do painel é gravada pelo CLIENTE, por isso passa pela rota.
    { arquivo: 'src/components/admin-panel/StudentDetailPanel.tsx', o_que: 'edita o treino do aluno' },
]

describe('quem altera o plano do aluno avisa o aluno', () => {
    it.each(SUPERFICIES)('$arquivo ($o_que) dispara o aviso', ({ arquivo }) => {
        const código = semComentarios(ler(arquivo))
        // A CHAMADA, não o import: um import órfão sobrevive à remoção da
        // chamada e deixaria este guard verde com o aviso já morto.
        expect(código).toMatch(/notifyCoachChange\s*\(|notifyStudentWorkoutUpdated\s*\(/)
    })

    it('a rota de coach-change checa canCoachStudent — professor não notifica aluno alheio', () => {
        const código = semComentarios(ler('src/app/api/notifications/coach-change/route.ts'))
        expect(código).toMatch(/canCoachStudent\s*\(/)
        expect(código).toMatch(/requireRole\(\[['"]admin['"], ['"]teacher['"]\]\)/)
    })

    it('o aviso é best-effort: nenhuma escrita do coach falha porque o push falhou', () => {
        for (const { arquivo } of SUPERFICIES) {
            const código = semComentarios(ler(arquivo))
            const chamadas = código.match(/notifyCoachChange\s*\([\s\S]{0,400}?\)\s*[,;)]/g) ?? []
            for (const c of chamadas) {
                expect(c, `${arquivo}: envolva em waitUntil/catch`).toMatch(/catch/)
            }
        }
    })
})

describe('medicamentos: o aviso do professor sai de TODA escrita da rota', () => {
    it('as três escritas (POST, PATCH, DELETE) avisam com o tipo e a origem certos', () => {
        const código = semComentarios(ler('src/app/api/teacher/medications/route.ts'))
        // O guard genérico de cima só pede que exista ALGUMA chamada no arquivo:
        // remover o aviso de UM método o deixaria verde. Aqui cada escrita é conferida.
        const chamadas = código.match(/notifyCoachChange\s*\(/g) ?? []
        const escritas = código.match(/export async function (POST|PATCH|DELETE)\b/g) ?? []
        expect(escritas).toHaveLength(3)
        // O aviso mora num helper (`avisarAluno`) acionado por cada método, e só
        // depois de o núcleo devolver sucesso.
        expect(chamadas.length).toBeGreaterThanOrEqual(1)
        for (const metodo of ['POST', 'PATCH', 'DELETE']) {
            const corpo = código.split(new RegExp(`export async function ${metodo}\\b`))[1]?.split(/export async function /)[0] ?? ''
            expect(corpo, `${metodo} precisa avisar o aluno`).toMatch(/avisarAluno\s*\(/)
            expect(corpo, `${metodo}: aviso só DEPOIS da escrita confirmada`).toMatch(
                /Core\([\s\S]*?if \(!r\.ok\)[\s\S]*?avisarAluno\s*\(/,
            )
        }
        expect(código).toMatch(/kind:\s*'medication_updated'/)
        expect(código).toMatch(/origem:\s*'medication_edit'/)
    })

    it('medication_updated tem toggle (schema + tela) e a Central o conhece e o roteia pelo TIPO', () => {
        const pref = NOTIFICATION_TYPE_TO_PREFERENCE['medication_updated']
        expect(pref, 'sem mapa, o tipo é enviado sem como desligar').toBeTruthy()
        expect(ler('src/schemas/settings.ts')).toContain(`${pref}:`)
        expect(ler('src/components/settings/SettingsSections.tsx')).toContain(pref)
        const centro = ler('src/components/NotificationCenter.tsx')
        expect(centro, 'cairia no default "Info"').toMatch(/medication_updated:\s*tipo\(/)
        // A tela de medicamentos é um modal do shell, não uma URL: o toque é roteado
        // pelo tipo (ROTEADOS_PELO_TIPO), e não por DESTINO_POR_TIPO.
        const roteados = centro.split('ROTEADOS_PELO_TIPO = new Set([')[1]?.split(']')[0] ?? ''
        expect(roteados).toContain('medication_updated')
    })
})

describe('os dois tipos novos têm toggle de verdade', () => {
    const schema = ler('src/schemas/settings.ts')
    const settingsUI = ler('src/components/settings/SettingsSections.tsx')

    it.each(['workout_updated', 'diet_updated'])('%s está mapeado para uma preferência', (tipo) => {
        const pref = NOTIFICATION_TYPE_TO_PREFERENCE[tipo]
        expect(pref, 'sem mapa, o tipo é enviado sem como desligar').toBeTruthy()
        // O toggle precisa existir no schema E na tela — um sem o outro é um
        // botão que não faz nada, ou uma preferência que ninguém alcança.
        expect(schema).toContain(`${pref}:`)
        expect(settingsUI).toContain(pref)
    })

    it('a Central de Notificações conhece os tipos — senão viram sino cinza "Info"', () => {
        const centro = ler('src/components/NotificationCenter.tsx')
        for (const tipo of ['workout_assigned', 'workout_updated', 'diet_updated']) {
            expect(centro, `${tipo} cairia no default`).toMatch(new RegExp(`${tipo}:\\s*tipo\\(`))
            expect(centro, `${tipo} sem destino: o toque não leva a lugar nenhum`)
                .toMatch(new RegExp(`${tipo}:\\s*'/dashboard`))
        }
    })
})
