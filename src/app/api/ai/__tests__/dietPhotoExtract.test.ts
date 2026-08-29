import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Import de dieta por foto/PDF (ideia #5).
 *
 * Guard de forma e de política: a rota é I/O puro (multipart + Gemini), e o que
 * precisa ficar travado são as decisões — onde o gate mora, o que ele cobra, e
 * o fato de a saída cair no parser que já existe em vez de num segundo
 * normalizador que divergiria com o tempo.
 */

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (f: string) =>
    f.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const ROTA = semComentarios(ler('src/app/api/ai/diet-photo-extract/route.ts'))
const GATE = semComentarios(ler('src/utils/vip/dietImportAccess.ts'))
const MODAL = semComentarios(ler('src/components/dashboard/nutrition/DietJsonImportModal.tsx'))

describe('o gate cobra onde se paga, e só ali', () => {
    it('a rota de foto/PDF é gateada', () => {
        expect(ROTA).toMatch(/checkDietImportAccess\s*\(/)
    })

    it('o gate roda ANTES de ler o arquivo', () => {
        // Travar depois do upload gastaria a banda do usuário para negar em
        // seguida — a mesma razão pela qual o import de treino põe o gate na
        // porta de entrada.
        const gate = ROTA.search(/checkDietImportAccess\s*\(/)
        const leitura = ROTA.indexOf('req.formData()')
        expect(gate).toBeGreaterThan(-1)
        expect(leitura).toBeGreaterThan(-1)
        expect(gate).toBeLessThan(leitura)
    })

    it('o import por JSON continua SEM gate — ele não gasta IA', () => {
        // Se um gate aparecer no caminho do texto, a promessa "JSON é grátis"
        // cai sem que nenhum teste de comportamento perceba.
        const at = MODAL.indexOf("'/api/nutrition/diet-plan'")
        expect(at).toBeGreaterThan(-1)
        expect(MODAL.slice(Math.max(0, at - 900), at)).not.toMatch(/vip|VIP_|checkVip/)
    })

    it('a primeira é por nossa conta, como na ficha de treino', () => {
        expect(GATE).toMatch(/first_free/)
    })

    it('falha ao CONTAR não vira acesso liberado', () => {
        // Seria bypass do gate por indisponibilidade do banco.
        const at = GATE.indexOf('catch')
        expect(at).toBeGreaterThan(-1)
        expect(GATE.slice(at)).toMatch(/allowed:\s*false/)
    })
})

describe('a demonstração gratuita só é consumida quando funciona', () => {
    it('o registro em audit_events acontece DEPOIS da extração', () => {
        const extraiu = ROTA.indexOf('could_not_read')
        const registrou = ROTA.indexOf('ACAO_IMPORT_DIETA,')
        expect(extraiu).toBeGreaterThan(-1)
        expect(registrou).toBeGreaterThan(-1)
        expect(registrou, 'gravar antes faria uma leitura falha queimar a primeira grátis').toBeGreaterThan(extraiu)
    })
})

describe('a saída cai no parser que já existe', () => {
    it('a rota devolve o JSON CRU, sem normalizar por conta', () => {
        // Um segundo normalizador divergiria do primeiro — é o padrão que este
        // repo já pagou caro (14 renderers, 5 listas de status, 3 cálculos de
        // semana).
        expect(ROTA).toMatch(/diet:\s*json/)
        expect(ROTA).not.toMatch(/importarDietaDeJson/)
    })

    it('e o modal joga o resultado no MESMO campo de texto', () => {
        // Assim prévia, tetos, avisos e resolução de macros valem de graça.
        expect(MODAL).toMatch(/setTexto\(JSON\.stringify\(json\.diet/)
    })

    it('a pessoa CONFERE antes de virar o plano dela', () => {
        // O resultado não salva sozinho: a IA leu o papel dela, e ela precisa
        // ver o que foi lido antes de isso substituir o plano atual.
        //
        // Fatiado pela FUNÇÃO, não por uma janela de caracteres: a primeira
        // versão media 400 chars adiante e alcançava a `salvar` que vem logo
        // depois no arquivo.
        const ini = MODAL.indexOf('const lerArquivo')
        expect(ini, 'a leitura de arquivo sumiu — o guard perdeu o alvo').toBeGreaterThan(-1)
        const corpo = MODAL.slice(ini, MODAL.indexOf('const salvar', ini))
        expect(corpo).toMatch(/setTexto\(JSON\.stringify\(json\.diet/)
        expect(corpo, 'a extração não pode salvar sozinha').not.toMatch(/salvar\(\)|diet-plan/)
    })
})

describe('contrato com o Gemini', () => {
    it('passa o schema na CHAMADA, não só no texto do prompt', () => {
        // Padrão do repo desde 02/08/2026 — pedir JSON só no prompt reprovava
        // 8 de 12 chamadas no safeParse.
        expect(ROTA).toMatch(/responseMimeType:\s*'application\/json'/)
        expect(ROTA).toMatch(/responseSchema/)
    })

    it('aceita PDF e foto', () => {
        expect(ROTA).toMatch(/application\/pdf/)
        expect(ROTA).toMatch(/image\/heic/)
    })

    it('o prompt proíbe inventar o que não está no papel', () => {
        expect(ROTA).toMatch(/NÃO invente/)
    })
})
