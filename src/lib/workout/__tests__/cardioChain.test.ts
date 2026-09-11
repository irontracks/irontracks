/**
 * A aritmética do encadeamento de blocos de cardio.
 *
 * O que estes casos travam não é "a conta fecha" — é a fronteira entre DEDUZIR e
 * INVENTAR. Concluir um bloco cujo fim já passou é afirmar que a pessoa
 * continuou na esteira enquanto o app dormia; isso vale por alguns minutos e
 * deixa de valer. O caso do limite é o que impede a feature de gravar meia hora
 * de treino que ninguém fez.
 */
import { describe, it, expect } from 'vitest'
import {
  decidirBlocoAutomatico,
  proximoBlocoComecaEmMs,
  LIMITE_DE_RECONSTRUCAO_MS,
  TOLERANCIA_AO_VIVO_MS,
} from '../cardioChain'

const AGORA = 1_760_000_000_000

describe('decidirBlocoAutomatico', () => {
  it('sem carimbo não faz nada — o bloco espera o toque do usuário', () => {
    expect(decidirBlocoAutomatico({ autoStartAtMs: 0, targetSeconds: 600, agoraMs: AGORA }))
      .toEqual({ acao: 'nada' })
  })

  it('sem duração planejada não faz nada (não dá para saber quando termina)', () => {
    expect(decidirBlocoAutomatico({ autoStartAtMs: AGORA, targetSeconds: 0, agoraMs: AGORA }))
      .toEqual({ acao: 'nada' })
  })

  it('a vez ainda não chegou: aguarda exatamente o que falta', () => {
    const d = decidirBlocoAutomatico({
      autoStartAtMs: AGORA + 90_000,
      targetSeconds: 600,
      agoraMs: AGORA,
    })
    expect(d).toEqual({ acao: 'aguardar', emMs: 90_000 })
  })

  it('chegou a hora: inicia contando desde o CARIMBO, não desde agora', () => {
    // 30 s se passaram entre o fim do bloco anterior e este render. Começar do
    // zero aqui alongaria o cardio em 30 s a cada bloco.
    const d = decidirBlocoAutomatico({
      autoStartAtMs: AGORA - 30_000,
      targetSeconds: 600,
      agoraMs: AGORA,
    })
    expect(d).toEqual({ acao: 'iniciar', startedAtMs: AGORA - 30_000 })
  })

  it('o cronômetro zerou com o app na frente: conclui, e NÃO marca reconstrução', () => {
    const inicio = AGORA - 600_000 - 1_000 // terminou 1 s atrás
    const d = decidirBlocoAutomatico({ autoStartAtMs: inicio, targetSeconds: 600, agoraMs: AGORA })
    expect(d).toEqual({
      acao: 'concluir',
      duracaoSegundos: 600,
      terminouEmMs: inicio + 600_000,
      reconstruido: false,
    })
  })

  it('o app estava congelado: conclui pelo planejado e MARCA que foi deduzido', () => {
    const inicio = AGORA - 600_000 - 60_000 // terminou 1 min atrás
    const d = decidirBlocoAutomatico({ autoStartAtMs: inicio, targetSeconds: 600, agoraMs: AGORA })
    expect(d).toMatchObject({ acao: 'concluir', duracaoSegundos: 600, reconstruido: true })
  })

  it('a fronteira do "ao vivo" é a tolerância, não um palpite', () => {
    const alvo = 600
    const fimHa = (ms: number) => AGORA - alvo * 1000 - ms
    const dentro = decidirBlocoAutomatico({
      autoStartAtMs: fimHa(TOLERANCIA_AO_VIVO_MS),
      targetSeconds: alvo,
      agoraMs: AGORA,
    })
    const fora = decidirBlocoAutomatico({
      autoStartAtMs: fimHa(TOLERANCIA_AO_VIVO_MS + 1),
      targetSeconds: alvo,
      agoraMs: AGORA,
    })
    expect(dentro).toMatchObject({ reconstruido: false })
    expect(fora).toMatchObject({ reconstruido: true })
  })

  it('parado tempo demais: EXPIRA em vez de gravar treino que ninguém fez', () => {
    const alvo = 600
    const inicio = AGORA - alvo * 1000 - LIMITE_DE_RECONSTRUCAO_MS - 1
    expect(decidirBlocoAutomatico({ autoStartAtMs: inicio, targetSeconds: alvo, agoraMs: AGORA }))
      .toEqual({ acao: 'expirado' })
  })

  it('bem no limite ainda reconstrói — a régua é inclusiva de um lado só', () => {
    const alvo = 600
    const inicio = AGORA - alvo * 1000 - LIMITE_DE_RECONSTRUCAO_MS
    expect(decidirBlocoAutomatico({ autoStartAtMs: inicio, targetSeconds: alvo, agoraMs: AGORA }))
      .toMatchObject({ acao: 'concluir' })
  })

  it('lixo em qualquer entrada não vira decisão', () => {
    expect(decidirBlocoAutomatico({ autoStartAtMs: NaN, targetSeconds: 600, agoraMs: AGORA }))
      .toEqual({ acao: 'nada' })
    expect(decidirBlocoAutomatico({ autoStartAtMs: AGORA, targetSeconds: 600, agoraMs: NaN }))
      .toEqual({ acao: 'nada' })
  })
})

describe('proximoBlocoComecaEmMs', () => {
  it('sem descanso, o próximo começa no instante em que este terminou', () => {
    expect(proximoBlocoComecaEmMs(AGORA, 0)).toBe(AGORA)
  })

  it('com descanso, o carimbo é FUTURO — é ele que segura o próximo bloco', () => {
    expect(proximoBlocoComecaEmMs(AGORA, 60)).toBe(AGORA + 60_000)
  })

  it('descanso negativo não anda para trás', () => {
    expect(proximoBlocoComecaEmMs(AGORA, -30)).toBe(AGORA)
  })

  it('sem fim conhecido não carimba nada', () => {
    expect(proximoBlocoComecaEmMs(0, 60)).toBe(0)
  })
})
