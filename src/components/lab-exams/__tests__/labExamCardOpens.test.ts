import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Bug relatado pelo dono (ago/2026): "esse card do exame não está clicável e
 * nem abrindo os resultados".
 *
 * Causa confirmada no banco, não por leitura de código: o exame estava
 * `status: 'done'` com 34 marcadores extraídos e `protocol` NULL. Três travas
 * independentes exigiam o PROTOCOLO para abrir qualquer coisa:
 *   1. `onView={() => exam.protocol && setViewing(exam)}` — clique morria ali;
 *   2. `{viewing?.protocol && (...)}` — o modal não renderizava;
 *   3. o card mostrava a seta ">" mesmo assim, prometendo o que não cumpria.
 *
 * Os resultados são o dado PRIMÁRIO — existem desde a extração e valem por si.
 */
const CARD = readFileSync('src/components/lab-exams/LabExamCard.tsx', 'utf8')
const SECTION = readFileSync('src/components/lab-exams/LabExamsSection.tsx', 'utf8')

describe('card do exame abre os resultados', () => {
    it('o clique NÃO exige mais protocolo', () => {
        expect(SECTION).not.toMatch(/onView=\{\(\) => exam\.protocol && setViewing\(exam\)\}/)
        expect(SECTION).toMatch(/if \(!exam\.protocol && !exam\.extracted_markers\) return/)
    })

    it('o modal abre com marcadores OU protocolo', () => {
        expect(SECTION).not.toMatch(/\{viewing\?\.protocol && \(/)
        expect(SECTION).toMatch(/viewing && \(viewing\.extracted_markers \|\| viewing\.protocol\)/)
    })

    it('exame FALHO com marcadores também abre', () => {
        // A rota marca `failed` quando a IA devolve algo fora do schema — mas a
        // extração já tinha dado certo. Trancar aí esconderia resultados que já
        // são do usuário E o próprio botão de tentar de novo.
        expect(CARD).toMatch(/const podeAbrir = \(isDone \|\| isFailed\) && temConteudo/)
        expect(SECTION).toMatch(/viewing\.status === 'failed'/)
        expect(SECTION).toMatch(/A geração do protocolo falhou/)
    })

    it('a seta só aparece quando há mesmo o que abrir', () => {
        // Prometer com a seta e não abrir ao toque foi o pior sintoma: a pessoa
        // acha que o app travou.
        expect(CARD).toMatch(/const temConteudo = !!\(exam\.extracted_markers \|\| exam\.protocol\)/)
        expect(CARD).toMatch(/\{podeAbrir && <ChevronRight/)
        expect(CARD).toMatch(/disabled=\{!podeAbrir\}/)
    })

    it('mostra os marcadores, não só o protocolo', () => {
        expect(SECTION).toMatch(/<LabExamMarkersView extracted=\{viewing\.extracted_markers\}/)
    })

    it('oferece gerar o protocolo que faltou', () => {
        // Antes não havia NENHUM caminho na UI para completar uma análise que
        // parou no meio — o exame ficava preso assim para sempre.
        expect(SECTION).toMatch(/'\/api\/ai\/lab-exam-protocol'/)
        expect(SECTION).toMatch(/Protocolo ainda não gerado/)
        expect(SECTION).toMatch(/Gerar protocolo/)
    })

    it('falha ao gerar aparece na tela', () => {
        // Erro engolido aqui devolveria o mesmo "toquei e não aconteceu nada".
        expect(SECTION).toMatch(/setErroProtocolo/)
        expect(SECTION).toMatch(/\{erroProtocolo\}/)
    })
})

describe('view de marcadores', () => {
    const VIEW = readFileSync('src/components/lab-exams/LabExamMarkersView.tsx', 'utf8')

    it('mostra os alterados primeiro — é o que a pessoa foi ver', () => {
        expect(VIEW).toMatch(/Fora da referência/)
        expect(VIEW).toMatch(/const alterados = markers\.filter\(\(m\) => m\.status !== 'normal'\)/)
    })

    it('distingue alterado de CRÍTICO por cor', () => {
        // 'high' e 'critical_high' não podem ter o mesmo peso visual.
        expect(VIEW).toMatch(/critical_low:/)
        expect(VIEW).toMatch(/critical_high:/)
        expect(VIEW).toMatch(/#f87171/)
    })

    it('mostra a faixa de referência quando o laboratório imprimiu', () => {
        expect(VIEW).toMatch(/formatarReferencia/)
        expect(VIEW).toMatch(/ref\. \{ref\}/)
    })

    it('valor ausente vira travessão, não zero', () => {
        // `value: null` significa "não consegui ler", não "deu zero".
        expect(VIEW).toMatch(/if \(m\.value == null\) return '—'/)
    })
})
