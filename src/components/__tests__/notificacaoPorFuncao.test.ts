/**
 * Na central de notificações, a cor responde "isto exige algo de mim?".
 *
 * Eram 23 tipos em 7 famílias de cor sem critério: `emerald` cobria
 * Meta/Online/Marco/Refeição e `green` cobria Treino/Aceito/Aceito, sem regra
 * que explicasse a diferença. As cores até eram distinguíveis (Δ=69) — o
 * problema é que a distinção não codificava nada. Isso é pior que cores iguais:
 * promete um sistema e não entrega. E ninguém memoriza 7 códigos numa lista
 * aberta uma vez por dia.
 *
 * O TIPO do evento já está no rótulo do card (PR, Streak, Meta, Treino).
 * Repeti-lo em matiz é redundância que gasta os pigmentos de alarme e de ação.
 * A cor passa a carregar a FUNÇÃO — ação, conquista, aviso, lembrete, social.
 *
 * O ganho estrutural não é a cor: é a PERGUNTA que o desenvolvedor passa a
 * responder ao adicionar um tipo. Antes era "que cor combina?"; agora é "o que
 * isto exige do usuário?".
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join('src', 'components', 'NotificationCenter.tsx'), 'utf8')
const codigo = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

const FUNCOES = ['acao', 'conquista', 'aviso', 'lembrete', 'social']

/** Cada entrada do TYPE_CONFIG, com a função declarada. */
const tipos = (): { chave: string; funcao: string }[] => {
  const bloco = codigo.slice(codigo.indexOf('const TYPE_CONFIG'), codigo.indexOf('\n};', codigo.indexOf('const TYPE_CONFIG')))
  return [...bloco.matchAll(/(\w+):\s*tipo\([^,]+,\s*'[^']*',\s*'(\w+)'\)/g)]
    .map((m) => ({ chave: m[1], funcao: m[2] }))
}

describe('notificações — cor por função, não por evento', () => {
  it('todo tipo declara uma das cinco funções', () => {
    const lista = tipos()
    expect(lista.length).toBeGreaterThanOrEqual(20)
    const invalidos = lista.filter((t) => !FUNCOES.includes(t.funcao))
    expect(invalidos, 'função inválida — use acao/conquista/aviso/lembrete/social').toEqual([])
  })

  it('nenhum tipo escolhe cor à mão', () => {
    const bloco = codigo.slice(codigo.indexOf('const TYPE_CONFIG'), codigo.indexOf('\n};', codigo.indexOf('const TYPE_CONFIG')))
    expect(
      bloco,
      'a cor vem de ESTILO_POR_FUNCAO. Escolher matiz por tipo foi o que produziu ' +
        '7 famílias sem critério.',
    ).not.toMatch(/border-\w+-\d+|bg-\w+-\d+\/|from-\w+-\d+/)
  })

  it('o vermelho é exclusivo do aviso — é a única cor de alarme', () => {
    const avisos = tipos().filter((t) => t.funcao === 'aviso').map((t) => t.chave)
    expect(avisos, 'só comunicado do sistema justifica vermelho').toEqual(['broadcast'])
  })

  it('as cinco funções existem no mapa de estilo, e só elas', () => {
    const mapa = codigo.slice(codigo.indexOf('ESTILO_POR_FUNCAO'), codigo.indexOf('\n}', codigo.indexOf('ESTILO_POR_FUNCAO')))
    for (const f of FUNCOES) expect(mapa).toContain(`${f}:`)
  })

  it('pedir resposta é raro — se tudo vira ação, nada é ação', () => {
    const acoes = tipos().filter((t) => t.funcao === 'acao')
    expect(acoes.length).toBeLessThanOrEqual(4)
  })
})
