import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'

import { ConteudoDoCard, destinoDa, temDestino } from '@/components/NotificationCenter'

/**
 * A Central de Notificações era um beco sem saída.
 *
 * 24 tipos de notificação, e o card não tinha `onClick` nenhum — os únicos
 * handlers da tela eram aceitar, recusar e apagar. Tocar em "Fulano bateu PR"
 * ou "Nova mensagem" não levava a lugar nenhum.
 *
 * O agravante é que ele PROMETIA: `hover:scale-[1.01]` e `hover:shadow-lg` são
 * o vocabulário de card interativo. Promessa quebrada é pior que ausência de
 * affordance — o usuário toca, nada muda, e conclui que o app travou.
 *
 * E o app já sabia navegar: o roteador `irontracks:push:navigate` (no shell)
 * trata o toque no PUSH da mesma notificação há tempos. Ou seja, o mesmo evento
 * tinha dois caminhos e só um funcionava. Por isso a correção EMITE esse evento
 * em vez de escrever "tipo → tela" num segundo lugar.
 */

const DIR = join(__dirname, '..')
const central = readFileSync(join(DIR, 'NotificationCenter.tsx'), 'utf8')
const shell = readFileSync(
    join(DIR, '..', 'app', '(app)', 'dashboard', 'IronTracksAppClientImpl.tsx'),
    'utf8',
)
const modais = readFileSync(
    join(DIR, '..', 'app', '(app)', 'dashboard', 'DashboardModals.tsx'),
    'utf8',
)

const executavel = (src: string) =>
    src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*\*[\s\S]*?\*\//g, ' ')

describe('o card leva a algum lugar', () => {
    it('tocar emite o MESMO evento que o push emite', () => {
        const codigo = executavel(central)
        expect(codigo).toMatch(/dispatchEvent\(/)
        expect(codigo).toContain("'irontracks:push:navigate'")
    })

    it('o destino não é decidido em dois lugares', () => {
        // A Central manda `type` e `link`; quem sabe abrir conversa, painel de
        // admin ou rota interna continua sendo o roteador do shell.
        expect(executavel(shell)).toContain("'irontracks:push:navigate'")
        expect(executavel(central)).not.toMatch(/setView\(|router\.push\(/)
    })

    it('o modal fecha ANTES de navegar', () => {
        const bloco = central.slice(central.indexOf('const abrirDestino'))
        const fecha = bloco.indexOf('onNavigate?.()')
        const emite = bloco.indexOf('dispatchEvent')
        expect(fecha).toBeGreaterThan(-1)
        // Navegar com o modal aberto entrega o destino coberto pelo próprio
        // modal: o usuário chega onde pediu e não vê.
        expect(fecha).toBeLessThan(emite)
    })

    it('o pai passa o fechamento — sem isso a prop é decorativa', () => {
        expect(executavel(modais)).toMatch(/onNavigate=\{\(\) => setShowNotifCenter\(false\)\}/)
    })
})

afterEach(cleanup)

describe('o que não leva a lugar nenhum não promete', () => {
    it('o hover de card interativo é condicionado ao destino', () => {
        const codigo = executavel(central)
        expect(codigo).toMatch(/clicavel \? ' hover:scale-\[1\.01\] hover:shadow-lg' : ''/)
        // Incondicional é o bug: promete a todos e cumpre a alguns.
        expect(codigo).not.toMatch(/duration-200 hover:scale-\[1\.01\]/)
    })

    it('nutrição, cobrança e comunicado ficam fora — sem tela própria ou sem rota', () => {
        const bloco = central.slice(central.indexOf('const DESTINO_POR_TIPO'), central.indexOf('\n}', central.indexOf('const DESTINO_POR_TIPO')))
        for (const fora of ['meal_reminder', 'water_reminder', 'billing_issue', 'broadcast', 'muscle_weekly_insights', 'invite']) {
            expect(bloco, `${fora} não tem destino inequívoco`).not.toMatch(new RegExp(`^\\s{4}${fora}:`, 'm'))
        }
    })

    /**
     * COMPORTAMENTO, não forma. A primeira versão deste bloco procurava
     * `<button` dentro da função e passou VERDE com o corpo trocado por uma
     * `<div>` fixa — o botão seguia escrito, em código morto. Medido por
     * mutação; é o erro "cobrindo as pontas e não a fiação".
     */
    it('com destino, o corpo é um button que chama o handler ao ser tocado', () => {
        const onOpen = vi.fn()
        render(<ConteudoDoCard clicavel onOpen={onOpen} titulo="Fulano bateu PR"><span>x</span></ConteudoDoCard>)
        const botao = screen.getByRole('button', { name: 'Abrir: Fulano bateu PR' })
        fireEvent.click(botao)
        expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it('sem destino, não existe controle nenhum para tocar', () => {
        render(<ConteudoDoCard clicavel={false} onOpen={() => {}} titulo="Beba água"><span>x</span></ConteudoDoCard>)
        expect(screen.queryByRole('button')).toBeNull()
    })

    it('o card usa o componente, não desenha a própria linha', () => {
        expect(executavel(central)).toMatch(/<ConteudoDoCard clicavel=\{clicavel\}/)
    })

    it('o corpo clicável não engole o botão de remover', () => {
        // Fatiar do início até o FIM da função, não até o fim do arquivo: o
        // botão de remover mora mais abaixo e entraria no bloco, fazendo a
        // asserção de baixo reprovar por motivo errado.
        const inicio = central.indexOf('export function ConteudoDoCard')
        const bloco = central.slice(inicio, central.indexOf('\nfunction ', inicio + 1))
        expect(bloco).toMatch(/<button/)
        // Ícone e texto sozinhos fazem o leitor de tela anunciar "botão" e mais
        // nada — a lista inteira soaria igual.
        expect(bloco).toMatch(/aria-label=\{titulo/)
        // O remover mora dentro do card; botão dentro de botão é HTML inválido.
        expect(bloco).not.toMatch(/Trash2|Remover notificação/)
    })
})

describe('mensagem sem remetente ainda chega em algum lugar', () => {
    it('o roteador não descarta o link quando falta o senderId', () => {
        const bloco = shell.slice(shell.indexOf("if (detail?.type === 'message')"))
        const ateOFim = bloco.slice(0, bloco.indexOf('setView(\'directChat\')'))
        // Era `if (!senderId) return;` — o return seco jogava fora o link junto,
        // e as notificações de mensagem gravadas no banco têm sender_id nulo
        // (medido: 11 de 11), que é justamente o caso da Central.
        expect(ateOFim).toMatch(/if \(!senderId\) \{/)
        expect(ateOFim).toMatch(/router\.push\(destino\)/)
        // O caminho interno continua obrigatório: o payload vem de fora.
        expect(ateOFim).toMatch(/startsWith\('\/'\)/)
        expect(ateOFim).toMatch(/!destino\.startsWith\('\/\/'\)/)
    })
})

/**
 * O card ficou inerte para `weekly_recap` mesmo com tudo verde — e só a
 * conferência na tela pegou.
 *
 * O `.map()` que monta a lista reconstrói cada notificação campo a campo e não
 * copiava `metadata` nem `sender_id`: eles ficavam só dentro de `data`. Aí
 * `destinoDa` não achava o `week_start`, devolvia vazio, e `temDestino` dizia
 * que não havia para onde ir. A lista continua IDÊNTICA na tela — some só o
 * clique —, então nada acusa.
 *
 * Os guards anteriores não pegaram porque mediam o `ConteudoDoCard` isolado e a
 * forma do código. Este bloco mede a FIAÇÃO: o objeto que a lista monta precisa
 * carregar o que o destino lê.
 */
describe('o item da lista carrega o que o destino precisa ler', () => {
    it('o map dos itens do banco repassa metadata e sender_id', () => {
        const bloco = central.slice(central.indexOf('...safeSystem.map('), central.indexOf('].sort('))
        expect(bloco).toMatch(/metadata: n\.metadata/)
        expect(bloco).toMatch(/sender_id: n\.sender_id/)
    })

    it('weekly_recap só tem destino quando sabe QUAL semana', () => {
        expect(temDestino({ type: 'weekly_recap', metadata: { week_start: '2026-08-17' } })).toBe(true)
        expect(destinoDa({ type: 'weekly_recap', metadata: { week_start: '2026-08-17' } }))
            .toBe('/dashboard/report/weekly?week=2026-08-17')
        // Sem a semana, abrir a tela mostraria o período errado — pior que não
        // abrir. É exatamente o caso que o `.map()` incompleto produzia para
        // TODA notificação.
        expect(temDestino({ type: 'weekly_recap', metadata: {} })).toBe(false)
        expect(temDestino({ type: 'weekly_recap' })).toBe(false)
    })

    it('tipo com destino fixo não depende de metadata', () => {
        expect(temDestino({ type: 'streak_at_risk' })).toBe(true)
        expect(destinoDa({ type: 'friend_pr' })).toBe('/dashboard/community')
    })

    it('tipo sem destino continua sem destino', () => {
        for (const t of ['water_reminder', 'billing_issue', 'broadcast', 'invite']) {
            expect(temDestino({ type: t }), t).toBe(false)
        }
    })
})
