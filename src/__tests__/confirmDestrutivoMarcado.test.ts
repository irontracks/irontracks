import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { describe, it, expect } from 'vitest'

/**
 * Diálogo que APAGA não pode se apresentar como pergunta neutra.
 *
 * O `confirm` do app aceita `destructive: true`, que pinta o botão de ação de
 * vermelho e troca o "?" dourado por um ícone de alerta. Sem a marca, um
 * `DELETE` irreversível sai com o MESMO visual de "Retomar treino?": título
 * genérico "Confirmação" e botão DOURADO — a cor que o app usa para a ação
 * primária, ou seja, para o que a pessoa quer fazer.
 *
 * Não é hipótese. Em 27/08/2026, conferindo a Central de Notificações no
 * simulador, eu apaguei todas as notificações da conta de teste tocando em
 * "Limpar tudo" e confirmando sem perceber o que confirmava — o diálogo não
 * dava nenhum sinal de que aquilo não tinha volta. Cinco chamadas estavam
 * assim; o mesmo app já fazia certo em "Descartar treino" ("Você perde as
 * séries registradas nesta sessão. Isso não pode ser desfeito.", em vermelho).
 *
 * O guard varre o CÓDIGO EXECUTÁVEL — comentário que explica a regra não pode
 * acusar a si mesmo (erro nº 2 da lista de guards falsos do repo).
 */

const VERBOS_DESTRUTIVOS = /\b(apagar|apagad|excluir|exclu[íi]d|deletar|deletad|remover|removid|limpar|descartar|descartad)/i

/** Fonte dos arquivos, sem comentários e sem os próprios testes. */
/** Todo .ts/.tsx do projeto, fora dos testes. */
const arquivosDoProjeto = () =>
    execSync("grep -rl 'window\\.\\(confirm\\|alert\\)' src --include=*.ts --include=*.tsx | grep -v __tests__ || true", { encoding: 'utf8' })
        .trim().split('\n').filter(Boolean)

const arquivos = execSync(
    "grep -rl 'await confirm(' src --include=*.ts --include=*.tsx | grep -v __tests__ || true",
    { encoding: 'utf8' },
).trim().split('\n').filter(Boolean)

const semComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

/**
 * Cada chamada `confirm(...)`, com os parênteses BALANCEADOS.
 *
 * Um regex `confirm\([^)]*\)` para no primeiro `)`, e as chamadas reais têm
 * `{ confirmText: ... }` e template strings dentro — mediria meia chamada.
 */
function chamadasDeConfirm(src: string): { arquivo: string; texto: string }[] {
    const out: { arquivo: string; texto: string }[] = []
    let i = 0
    while ((i = src.indexOf('confirm(', i)) !== -1) {
        const abre = i + 'confirm('.length
        let nivel = 1
        let j = abre
        while (j < src.length && nivel > 0) {
            const c = src[j]
            if (c === '(') nivel++
            else if (c === ')') nivel--
            j++
        }
        out.push({ arquivo: '', texto: src.slice(i, j) })
        i = j
    }
    return out
}

/**
 * Chamadas que falam de apagar e NÃO declaram `destructive`.
 *
 * A lista deve ficar vazia. Se um caso novo for legítimo — o verbo aparece mas
 * nada é destruído —, ele entra aqui com o motivo, e a entrada some quando o
 * caso sair do código.
 */
const NAO_DESTRUI: { arquivo: string; trecho: string; porque: string }[] = [
    {
        arquivo: 'src/components/HistoryList.tsx',
        trecho: 'Retomar este treino',
        porque: 'diz que as séries são MANTIDAS — o verbo aparece na negativa',
    },
    {
        arquivo: 'src/components/workout/hooks/useWorkoutExerciseCrud.ts',
        trecho: 'Remover esta série só neste treino',
        porque:
            'não é confirmar-ou-cancelar: é ESCOLHA binária entre dois caminhos ' +
            '("Só neste treino" / "Salvar no plano"), e a remoção já aconteceu. ' +
            'Vermelho num dos lados sugeriria que o outro é a saída segura.',
    },
    {
        arquivo: 'src/components/VipHub.tsx',
        trecho: 'O histórico salvo não é apagado',
        porque: 'limpa só a TELA — a própria mensagem diz que nada é apagado',
    },
]

describe('confirm que apaga se declara destrutivo', () => {
    it('o guard encontrou chamadas para medir', () => {
        expect(arquivos.length).toBeGreaterThan(5)
    })

    it('nenhuma ação destrutiva sai com o visual de pergunta neutra', () => {
        const faltando: string[] = []
        for (const arquivo of arquivos) {
            const codigo = semComentarios(readFileSync(arquivo, 'utf8'))
            for (const { texto } of chamadasDeConfirm(codigo)) {
                if (!VERBOS_DESTRUTIVOS.test(texto)) continue
                if (/destructive:\s*true/.test(texto)) continue
                const isento = NAO_DESTRUI.some(
                    (e) => e.arquivo === arquivo && texto.includes(e.trecho),
                )
                if (isento) continue
                faltando.push(`${arquivo}: ${texto.slice(0, 90).replace(/\s+/g, ' ')}`)
            }
        }
        expect(
            faltando,
            'sem `destructive: true` o botão sai DOURADO — a cor da ação primária — ' +
                'num diálogo que apaga sem volta:\n' + faltando.join('\n'),
        ).toEqual([])
    })

    /**
     * A allowlist só encolhe. Entrada que já não casa com nada é entrada
     * esquecida — e allowlist que vira papel de parede congela o débito com
     * cara de resolvido.
     */
    it('a allowlist não guarda entrada morta', () => {
        for (const e of NAO_DESTRUI) {
            const codigo = semComentarios(readFileSync(e.arquivo, 'utf8'))
            expect(codigo, `${e.arquivo} não contém mais "${e.trecho}"`).toContain(e.trecho)
        }
    })
})

/**
 * `window.confirm` escapava do guard acima — ele varre `await confirm(`, e o do
 * navegador é SÍNCRONO. Sobraram três depois da primeira varredura: revogar VIP
 * (acesso pago), apagar exame laboratorial e fechar o upload no meio do
 * processamento.
 *
 * Além de não ter como marcar destrutivo, o diálogo do sistema aparece com a
 * cara do navegador por cima de um app que tem o próprio — e no WKWebView ele
 * BLOQUEIA a thread. "Onde o guard NÃO olha?" é a pergunta que faltou.
 */
describe('o diálogo é o do app, nunca o do sistema', () => {
    it('nenhum window.confirm sobrou no código executável', () => {
        const infratores: string[] = []
        for (const arquivo of arquivosDoProjeto()) {
            const codigo = semComentarios(readFileSync(arquivo, 'utf8'))
            if (/\bwindow\.confirm\s*\(/.test(codigo)) infratores.push(arquivo)
        }
        expect(
            infratores,
            'use o `confirm` do DialogContext: o do sistema não aceita `destructive`, ' +
                'ignora o visual do app e bloqueia a thread no WKWebView:\n' + infratores.join('\n'),
        ).toEqual([])
    })

    /**
     * `window.alert` é RATCHET, não zero: são telas de pagamento e de
     * comunidade, e trocá-las exige garantir `DialogProvider` em cada árvore —
     * escopo próprio, não um efeito colateral desta varredura.
     *
     * A lista só ENCOLHE. Arquivo novo reprova, e arquivo que já saiu da lista
     * também reprova até ser removido daqui — sem isso a allowlist vira papel
     * de parede e o débito fica congelado com cara de resolvido.
     */
    const ALERT_PENDENTE = [
        'src/app/(app)/community/CommunityClient.tsx',            // fallback quando o toast falha
        'src/app/marketplace/MarketplaceClient.tsx',              // confirmações de compra/restauro
        'src/components/assessment/AssessmentButton.tsx',         // 6 erros de import de JSON
        'src/components/workout/PartnerExerciseOverlay.tsx',      // adapta `alert` para o hook de CRUD
    ]

    it('window.alert só encolhe', () => {
        const comAlert = arquivosDoProjeto().filter((arquivo) =>
            /\bwindow\.alert\s*\(/.test(semComentarios(readFileSync(arquivo, 'utf8'))),
        )
        const novos = comAlert.filter((f) => !ALERT_PENDENTE.includes(f))
        expect(novos, 'arquivo NOVO com window.alert — use o diálogo do app').toEqual([])

        const jaResolvidos = ALERT_PENDENTE.filter((f) => !comAlert.includes(f))
        expect(jaResolvidos, 'já não usa window.alert — tire da lista').toEqual([])
    })
})

describe('o parser mede a chamada inteira', () => {
    it('parênteses balanceados — opções não ficam de fora', () => {
        const [c] = chamadasDeConfirm("await confirm('x', 'y', { confirmText: 'z(1)' })")
        expect(c.texto).toContain('confirmText')
        expect(c.texto.endsWith(')')).toBe(true)
    })
})
