import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import ReelVideo from '../ReelVideo'

/**
 * O vídeo só baixa quando chega perto da tela, e pausa ao sair.
 *
 * Com ~20 vídeos na landing, `src` desde a montagem faria o navegador baixar
 * todos na abertura (~15 MB). O teste simula o IntersectionObserver — o jsdom
 * não tem — e confere o EFEITO no elemento: `src` ausente antes, presente
 * depois; play ao entrar, pause ao sair.
 */

type Entrada = { isIntersecting: boolean; intersectionRatio: number }
let disparar: (e: Entrada) => void = () => {}

const reduzirMovimento = vi.hoisted(() => ({ valor: false }))
vi.mock('framer-motion', () => ({ useReducedMotion: () => reduzirMovimento.valor }))

beforeEach(() => {
    reduzirMovimento.valor = false
    class IOFalso {
        constructor(cb: (entradas: Entrada[]) => void) {
            disparar = (e) => cb([e])
        }
        observe() {}
        disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', IOFalso)
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

const montar = (prioritario = false) =>
    render(<ReelVideo src="/v.mp4" poster="/v.jpg" label="Vídeo: teste" prioritario={prioritario} />)

describe('ReelVideo', () => {
    it('longe da tela: sem src (não baixa nada), só a capa', () => {
        const { container } = montar()
        const v = container.querySelector('video')!
        expect(v.getAttribute('src')).toBeNull()
        expect(v.getAttribute('poster')).toBe('/v.jpg')
        expect(v.getAttribute('preload')).toBe('none')
    })

    it('ao chegar perto ganha src e toca quando fica visível', () => {
        const { container } = montar()
        const v = container.querySelector('video')!
        act(() => disparar({ isIntersecting: true, intersectionRatio: 0.8 }))
        expect(v.getAttribute('src')).toBe('/v.mp4')
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
    })

    it('pausa ao sair da tela', () => {
        montar()
        act(() => disparar({ isIntersecting: true, intersectionRatio: 0.8 }))
        act(() => disparar({ isIntersecting: false, intersectionRatio: 0 }))
        expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    })

    it('o destaque do topo nasce com src (toca assim que a página abre)', () => {
        const { container } = montar(true)
        expect(container.querySelector('video')!.getAttribute('src')).toBe('/v.mp4')
    })

    it('quem pede menos movimento não vê o vídeo tocar sozinho', () => {
        reduzirMovimento.valor = true
        montar()
        act(() => disparar({ isIntersecting: true, intersectionRatio: 0.8 }))
        expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
    })

    it('o src não depende da preferência de movimento (SSR e hidratação batem)', () => {
        // A preferência vale `null` no servidor e o valor real no navegador. Se o
        // src dependesse dela, o destaque nasceria com src no HTML e sem src na
        // hidratação — divergência que o React não corrige (visto no navegador,
        // 26/09/2026).
        reduzirMovimento.valor = true
        const { container } = montar(true)
        expect(container.querySelector('video')!.getAttribute('src')).toBe('/v.mp4')
    })
})
