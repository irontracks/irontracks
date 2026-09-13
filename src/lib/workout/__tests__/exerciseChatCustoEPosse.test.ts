/**
 * Os invariantes do chat de IA por exercício que custam DINHEIRO ou expõem
 * arquivo de outra pessoa — os dois que nenhuma suíte verde pega sozinha.
 *
 * ⚠️ **A mídia entra UMA vez.** Um chat multi-turno que reenvia o vídeo a cada
 * pergunta multiplica o custo pelo número de turnos sem melhorar a resposta: a
 * chave do Gemini é paga e é a mesma de produção. A defesa aqui não é um
 * comentário pedindo cuidado — é o `SELECT` da thread não trazer o caminho da
 * mídia. Quem não tem o path não tem como reenviar o arquivo, e é isso que este
 * guard trava.
 *
 * ⚠️ **O arquivo é do próprio usuário.** O bucket `set-media` é privado com RLS
 * por prefixo `${userId}/`, mas o caminho chega no corpo do request — ou seja,
 * vem do cliente. Sem a checagem de prefixo, um usuário pediria análise de um
 * arquivo alheio pelo caminho, e a resposta da IA descreveria a mídia de outra
 * pessoa.
 *
 * ⚠️ **A cota certa em cada turno.** Turno com mídia cobra `media_analysis` (a
 * mesma chave da feature que este chat absorveu, com teto anti-abuso); turno de
 * texto cobra `chat_daily`. Trocar as duas faria um chat de texto consumir a
 * cota de análise de vídeo — e um vídeo passar pela cota de conversa.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { historicoParaPrompt, MAX_TURNOS_NO_PROMPT } from '@/lib/workout/exerciseChat'

const ler = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')
const semComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const MODULO = 'src/lib/workout/exerciseChat.ts'
const ROTA = 'src/app/api/ai/exercise-chat/route.ts'

const linha = (over: Record<string, unknown> = {}) => ({
    role: 'user' as const,
    content: 'e o aparelho certo?',
    media_kind: null,
    exercise_name: 'Supino reto',
    created_at: '2026-09-12T10:00:00Z',
    ...over,
})

describe('a mídia NÃO volta ao modelo nos turnos seguintes', () => {
    it('o histórico do prompt é só texto — a foto vira uma marca', () => {
        const prompt = historicoParaPrompt([
            linha({ media_kind: 'photo', content: 'é esse aparelho?' }),
            linha({ role: 'assistant', content: 'Sim, é o supino reto.' }),
        ])
        expect(prompt).toContain('[enviou uma foto]')
        expect(prompt).toContain('é esse aparelho?')
        // Nada que pareça arquivo/base64/caminho pode entrar no prompt.
        expect(prompt).not.toMatch(/base64|inlineData|fileData|\.mp4|\.jpg|https?:\/\//)
    })

    it('o vídeo também vira marca, nunca anexo', () => {
        const prompt = historicoParaPrompt([linha({ media_kind: 'video', content: 'minha execução' })])
        expect(prompt).toContain('[enviou um vídeo]')
    })

    it('⚠️ a thread nem LÊ o caminho da mídia do banco', () => {
        // A defesa estrutural: sem `media_path` no SELECT, reenviar o arquivo é
        // impossível — não há o que reenviar. Um guard que só olhasse o prompt
        // passaria verde no dia em que alguém acrescentasse a coluna "porque
        // pode ser útil".
        const src = semComentarios(ler(MODULO))
        const select = /const COLUNAS_DA_THREAD = '([^']+)'/.exec(src)
        expect(select, 'o SELECT da thread sumiu ou mudou de nome').not.toBeNull()
        expect(select?.[1]).not.toContain('media_path')
        expect(select?.[1]).not.toContain('media_mime')
    })

    it('o histórico é capado — conversa longa não vira prompt gigante', () => {
        const muitas = Array.from({ length: 30 }, (_, i) => linha({ content: `pergunta ${i}` }))
        const prompt = historicoParaPrompt(muitas)
        expect(prompt).toContain(`pergunta ${29}`)
        expect(prompt).not.toContain('pergunta 0')
        expect(prompt.split('\n').filter(l => l.includes('pergunta')).length).toBe(MAX_TURNOS_NO_PROMPT)
    })

    it('thread vazia não produz bloco de histórico', () => {
        expect(historicoParaPrompt([])).toBe('')
    })
})

describe('o arquivo analisado é do próprio usuário', () => {
    const rota = semComentarios(ler(ROTA))

    it('⚠️ caminho fora do prefixo do usuário é recusado ANTES do download', () => {
        expect(
            rota,
            'sem a checagem de prefixo, o caminho vem do cliente e a IA descreveria a mídia de outra pessoa',
        ).toMatch(/media\.path\.startsWith\(`\$\{userId\}\//)
        const iCheck = rota.indexOf('startsWith(`${userId}/')
        const iDownload = rota.search(/\.download\(|createSignedUrl\(|from\('set-media'\)/)
        expect(iCheck, 'a checagem de posse sumiu').toBeGreaterThan(0)
        if (iDownload > 0) {
            expect(iCheck, 'a posse tem de ser conferida ANTES de tocar no storage').toBeLessThan(iDownload)
        }
    })
})

describe('cada turno cobra a cota certa', () => {
    const rota = semComentarios(ler(ROTA))

    it('mídia cobra `media_analysis`; texto cobra `chat_daily`', () => {
        expect(rota).toMatch(/media \? 'media_analysis' : 'chat_daily'/)
    })

    it('⚠️ a cota é consumida ANTES da chamada paga', () => {
        // Cobrar depois abre a janela em que duas abas gastam a mesma unidade —
        // e o gasto já aconteceu no Gemini quando se descobre.
        const iCota = rota.indexOf("{ meter: true")
        const iGemini = rota.search(/safeGemini\(|generateContent/)
        expect(iCota, 'o metering sumiu').toBeGreaterThan(0)
        expect(iGemini, 'a chamada ao modelo sumiu').toBeGreaterThan(0)
        expect(iCota).toBeLessThan(iGemini)
    })

    it('o acesso VIP é conferido antes de qualquer coisa cara', () => {
        // O chat absorveu uma feature que era VIP; o gate de tier precisa
        // continuar existindo, senão o free entra pela cota de conversa.
        expect(rota).toMatch(/limits\.media_analysis/)
        const iGate = rota.indexOf('limits.media_analysis')
        const iGemini = rota.search(/safeGemini\(|generateContent/)
        expect(iGate).toBeLessThan(iGemini)
    })
})

describe('a pergunta aparece ANTES da resposta', () => {
    const rota = semComentarios(ler(ROTA))

    it('⚠️ as duas mensagens do turno são carimbadas com instantes DISTINTOS', () => {
        // Medido na primeira conversa real em produção (13/09/2026): as duas
        // linhas nasceram no mesmo insert e o `default now()` deu o MESMO
        // microssegundo às duas. Com `created_at` empatado, `ORDER BY created_at`
        // não garante ordem — a thread podia abrir com a resposta antes da
        // pergunta, e o usuário leria uma conversa invertida.
        expect(rota).toMatch(/created_at: new Date\(agoraMs\)\.toISOString\(\)/)
        expect(rota).toMatch(/created_at: new Date\(agoraMs \+ 1\)\.toISOString\(\)/)
    })

    it('o relógio é lido UMA vez, fora do array', () => {
        // Dois `Date.now()` separados poderiam cair no mesmo milissegundo e
        // devolver o empate que este caso existe para impedir.
        const i = rota.indexOf('const agoraMs = Date.now()')
        expect(i, 'o relógio do insert sumiu').toBeGreaterThan(0)
        const insert = rota.slice(rota.indexOf('.insert([', i))
        expect(insert.slice(0, 900)).not.toContain('Date.now()')
    })

    it('a leitura mantém o desempate como segunda defesa', () => {
        // Cinto e suspensório: o carimbo resolve na origem, mas as linhas já
        // gravadas em produção antes desta correção continuam empatadas.
        const modulo = semComentarios(ler(MODULO))
        expect(modulo).toMatch(/\.order\('created_at'/)
        expect(modulo).toMatch(/\.order\('role'/)
    })
})
