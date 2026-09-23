import { render, screen } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'

/**
 * Nota longa (perto do limite de 300 caracteres) ficava CORTADA: o
 * `<textarea rows={2} resize-none>` não crescia com o conteúdo e não tinha
 * nenhuma affordance de rolagem visível — a única forma de ver o resto era
 * tocar dentro da caixa e arrastar por dentro dela, o que ninguém descobre
 * sozinho. Achado numa observação real do plano ("Arroz e proteína
 * pesados..."), no card do Jantar.
 *
 * A correção faz o campo CRESCER com o conteúdo até um teto
 * (`ALTURA_MAXIMA_PX`); acima do teto, `overflow-y-auto` assume. jsdom não
 * calcula layout real, então `scrollHeight` é mockado no prototype — é o
 * único jeito de provar a lógica de ajuste sem um navegador de verdade.
 */

import CampoDeNotaDaRefeicao from '../CampoDeNotaDaRefeicao'

function mockarScrollHeight(valor: number) {
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
        configurable: true,
        get() { return valor },
    })
}

afterEach(() => {
    // devolve ao comportamento padrão do jsdom (sempre 0) para não vazar entre testes
    mockarScrollHeight(0)
})

describe('CampoDeNotaDaRefeicao — altura acompanha o conteúdo', () => {
    it('nota curta: a altura do textarea segue o scrollHeight real, sem esticar até o teto', async () => {
        mockarScrollHeight(40)
        render(
            <CampoDeNotaDaRefeicao
                nota="bater no liquidificador"
                nomeDaRefeicao="Café da Manhã"
                rotulo="Observação"
                placeholder="Ex.: bater no liquidificador"
                salvando={false}
                onSalvar={async () => true}
            />,
        )
        const campo = (await screen.findByDisplayValue('bater no liquidificador')) as HTMLTextAreaElement
        expect(campo.style.height).toBe('40px')
    })

    it('nota perto do limite de 300 caracteres: a altura é TRAVADA no teto, não cortada em 2 linhas', async () => {
        mockarScrollHeight(260)
        const notaLonga =
            'Arroz e proteína pesados prontos/cozidos. Pode trocar o peito de frango por Carne ' +
            'moída magra 180g (opção: 239.4kcal / 48.6P / 0.0C / 5.4G — frango: 297.0kcal / 55.8P / 0.0C / 7.3G).'

        render(
            <CampoDeNotaDaRefeicao
                nota={notaLonga}
                nomeDaRefeicao="Jantar"
                rotulo="Observação"
                placeholder="Ex.: bater no liquidificador"
                salvando={false}
                onSalvar={async () => true}
            />,
        )
        const campo = (await screen.findByDisplayValue(notaLonga)) as HTMLTextAreaElement
        expect(campo.style.height, 'não pode crescer além do teto').toBe('120px')
    })

    it('o campo tem overflow-y-auto — sem isso, passar do teto corta o texto de novo', async () => {
        mockarScrollHeight(40)
        render(
            <CampoDeNotaDaRefeicao
                nota="nota qualquer"
                nomeDaRefeicao="Jantar"
                rotulo="Observação"
                placeholder="Ex.: bater no liquidificador"
                salvando={false}
                onSalvar={async () => true}
            />,
        )
        const campo = await screen.findByDisplayValue('nota qualquer')
        expect(campo.className).toContain('overflow-y-auto')
    })
})
