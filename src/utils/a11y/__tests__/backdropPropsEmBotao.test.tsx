/**
 * `backdropProps` num <button> — o helper certo no elemento errado (12/08/2026).
 *
 * Achado ao adicionar `role="dialog"` aos modais do treino ativo: os botões X de
 * Rest-Pause, Drop-Set e Cluster (`ModalsComplexMethods.tsx`, 4 ocorrências)
 * espalhavam `{...backdropProps(fechar)}` em vez de um `onClick` simples.
 *
 * Duas consequências, e a primeira é FUNCIONAL — não é só acessibilidade:
 *
 * 1. O `onClick` do helper só age quando `e.target === e.currentTarget`. Esse
 *    guard existe para o backdrop (clique DENTRO do modal borbulha até ele e
 *    fecharia a janela no meio da interação). Num botão com um ícone dentro, o
 *    alvo do toque é o <svg> — nunca o <button>. Então tocar no ícone, que é o
 *    centro do alvo, NÃO FECHA.
 *
 * 2. `role="presentation"` + `tabIndex={-1}` tiram o botão da ordem de Tab e o
 *    escondem do leitor de tela. O X vira decoração: some para quem navega por
 *    teclado, some para quem usa leitor de tela.
 *
 * Guard sobre o comportamento, e um source-guard para a classe não voltar.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { backdropProps } from '../backdrop'

describe('o guard de alvo do backdrop não serve para botão', () => {
  it('clicar no ícone dentro do botão não dispara o onClose', () => {
    // Reprodução literal do que estava no código: helper de backdrop num botão
    // que contém um ícone. Este teste PROVA por que o padrão é errado.
    const onClose = vi.fn()
    render(
      <button type="button" {...backdropProps(onClose)} aria-label="Fechar">
        <svg data-testid="icone" width="18" height="18" />
      </button>,
    )
    fireEvent.click(screen.getByTestId('icone'))
    expect(onClose, 'o alvo é o <svg>, então o guard e.target===e.currentTarget barra').not.toHaveBeenCalled()
  })

  it('um onClick comum fecha ao clicar no ícone', () => {
    const onClose = vi.fn()
    render(
      <button type="button" onClick={onClose} aria-label="Fechar">
        <svg data-testid="icone2" width="18" height="18" />
      </button>,
    )
    fireEvent.click(screen.getByTestId('icone2'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('backdropProps esconde o elemento do leitor de tela e do Tab', () => {
    // Correto no backdrop, destrutivo num controle real.
    const p = backdropProps(() => { })
    expect(p.role).toBe('presentation')
    expect(p.tabIndex).toBe(-1)
  })
})

describe('source-guard: nenhum botão espalha backdropProps', () => {
  const ARQUIVOS = ['components/workout/ModalsComplexMethods.tsx', 'components/workout/Modals.tsx']

  it.each(ARQUIVOS)('%s', (rel) => {
    const src = readFileSync(join(__dirname, '..', '..', '..', rel), 'utf8')
    // Para cada uso do helper, olha qual tag abriu antes dele.
    const emBotao: number[] = []
    for (const m of src.matchAll(/backdropProps\(/g)) {
      const ini = src.lastIndexOf('<', m.index)
      if (src.slice(ini, ini + 8).startsWith('<button')) {
        emBotao.push(src.slice(0, m.index).split('\n').length)
      }
    }
    expect(
      emBotao,
      'backdropProps pertence ao fundo do modal. Num botão, o guard de alvo ' +
      'impede o clique no ícone de fechar, e role="presentation" apaga o ' +
      'controle para teclado e leitor de tela. Use onClick.',
    ).toEqual([])
  })
})
