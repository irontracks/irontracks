import { describe, it, expect, vi } from 'vitest'
import { backdropProps } from '@/utils/a11y/backdrop'

/**
 * Guard do backdrop de modal (ago/2026).
 *
 * Antes, o fundo escurecido era `<div onClick={fechar}>` com um
 * `eslint-disable` de jsx-a11y logo acima — 16 vezes. Clicar fora fechava; quem
 * usa teclado ficava sem saída equivalente, e o Escape não fazia nada.
 *
 * Os dois comportamentos que não podem regredir estão aqui: fechar SÓ quando o
 * clique é no próprio backdrop (senão um clique dentro do modal fecha a janela
 * no meio da interação), e Escape que não vaza para o modal de baixo.
 */

const evtClique = (target: unknown, currentTarget: unknown) =>
    ({ target, currentTarget }) as unknown as Parameters<ReturnType<typeof backdropProps>['onClick']>[0]

const evtTecla = (key: string, stopPropagation = vi.fn()) =>
    ({ key, stopPropagation }) as unknown as Parameters<ReturnType<typeof backdropProps>['onKeyDown']>[0]

describe('backdropProps — clique', () => {
    it('fecha quando o clique é no próprio backdrop', () => {
        const fechar = vi.fn()
        const el = { id: 'backdrop' }
        backdropProps(fechar).onClick(evtClique(el, el))
        expect(fechar).toHaveBeenCalledTimes(1)
    })

    it('NÃO fecha quando o clique veio de dentro do modal', () => {
        const fechar = vi.fn()
        backdropProps(fechar).onClick(evtClique({ id: 'botao-interno' }, { id: 'backdrop' }))
        expect(fechar, 'clique dentro do modal não pode fechar a janela').not.toHaveBeenCalled()
    })
})

describe('backdropProps — teclado', () => {
    it('Escape fecha', () => {
        const fechar = vi.fn()
        backdropProps(fechar).onKeyDown(evtTecla('Escape'))
        expect(fechar).toHaveBeenCalledTimes(1)
    })

    it('Escape não vaza para o modal de baixo', () => {
        const stop = vi.fn()
        backdropProps(vi.fn()).onKeyDown(evtTecla('Escape', stop))
        expect(stop, 'sem stopPropagation, um Escape fecharia os dois modais').toHaveBeenCalled()
    })

    it('outras teclas não fecham', () => {
        const fechar = vi.fn()
        const props = backdropProps(fechar)
        for (const k of ['Enter', ' ', 'Tab', 'a', 'ArrowDown']) props.onKeyDown(evtTecla(k))
        expect(fechar).not.toHaveBeenCalled()
    })
})

describe('backdropProps — semântica', () => {
    it('é presentation e fica fora da ordem de Tab', () => {
        const p = backdropProps(vi.fn())
        expect(p.role).toBe('presentation')
        expect(p.tabIndex).toBe(-1)
    })

    it('aceita rótulo próprio, com default utilizável', () => {
        expect(backdropProps(vi.fn())['aria-label']).toBe('Fechar')
        expect(backdropProps(vi.fn(), 'Fechar deload')['aria-label']).toBe('Fechar deload')
    })
})
