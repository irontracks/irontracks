import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Mídia e GIF do chat não podem sumir em silêncio — e o push não sai antes.
 *
 * O envio de imagem, vídeo e GIF fazia `await supabase...insert({...})` e já
 * chamava `notifyRecipientPush(...)`. Como **o supabase-js não lança em erro de
 * escrita** (devolve `{ error }` — a causa-raiz de metade da auditoria de
 * cobranças, ver CLAUDE.md), a mensagem não gravava, ninguém via erro, e o
 * destinatário recebia o push de uma mensagem que não existe: abria o chat e
 * não havia nada.
 *
 * O envio de TEXTO, no mesmo arquivo, sempre esteve certo — checa `insertError`,
 * mantém bolha temporária e oferece "Reenviar". Era lapso, não desenho.
 *
 * ⚠️ Guard de FORMA, e é assumido: montar o `ChatDirectScreen` exigiria Supabase,
 * realtime, storage e upload — o teste mediria o harness. O comportamento se
 * prova no aparelho; o que este arquivo trava é o padrão voltar.
 */

const SRC = readFileSync(join(process.cwd(), 'src/components/ChatDirectScreen.tsx'), 'utf8')
const semComentarios = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

/**
 * Cada `insert` em `direct_messages` como EXPRESSÃO: da atribuição (ou do
 * `await` solto) até o fim da chamada.
 *
 * Fatiar por janela de caracteres não serve — a primeira versão deste helper
 * aceitava qualquer "error" por perto (inclusive o `logError` do bloco vizinho)
 * e passou verde com a mutação que removia a checagem. O que prova a checagem é
 * a FORMA da atribuição daquela chamada.
 */
const expressoesDeInsert = (): string[] => {
    const out: string[] = []
    const linhas = semComentarios.split('\n')
    linhas.forEach((linha, i) => {
        if (!/await supabase[\s\S]*$|await supabase$/.test(linha)) return
        const janela = linhas.slice(i, i + 8).join('\n')
        if (!/from\('direct_messages'\)[\s\S]*\.insert\(/.test(janela)) return
        out.push(linha.trim())
    })
    return out
}

describe('envio no chat', () => {
    it('há inserções para medir — se sumirem, o guard perdeu o alvo', () => {
        expect(expressoesDeInsert().length).toBeGreaterThanOrEqual(3)
    })

    it('toda inserção DESTRUTURA o retorno — o supabase-js não lança, devolve `{ error }`', () => {
        for (const expr of expressoesDeInsert()) {
            expect(
                expr,
                `\`${expr}\` — insert com retorno ignorado: a mensagem some e ninguém fica sabendo`,
            ).toMatch(/const\s*\{[^}]*(error|data)[^}]*\}\s*=\s*await/)
        }
    })

    it('o push só sai DEPOIS de a mensagem existir', () => {
        // Entre cada `notifyRecipientPush` e o insert que o precede tem que
        // haver um `throw` do erro — senão o destinatário é avisado de uma
        // mensagem que não foi gravada.
        const pedacos = semComentarios.split('notifyRecipientPush')
        pedacos.slice(0, -1).forEach((antes) => {
            if (!/\.insert\(/.test(antes.slice(-900))) return
            expect(
                antes.slice(-900),
                'push disparado sem o erro do insert ter sido checado',
            ).toMatch(/if\s*\(\s*\w*[eE]rro\w*\s*\)\s*throw/)
        })
    })
})
