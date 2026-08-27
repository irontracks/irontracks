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
const tipos = (): { chave: string; rotulo: string; funcao: string }[] => {
  const bloco = codigo.slice(codigo.indexOf('const TYPE_CONFIG'), codigo.indexOf('\n};', codigo.indexOf('const TYPE_CONFIG')))
  return [...bloco.matchAll(/(\w+):\s*tipo\([^,]+,\s*'([^']*)',\s*'(\w+)'\)/g)]
    .map((m) => ({ chave: m[1], rotulo: m[2], funcao: m[3] }))
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

  /**
   * A lista é NOMEADA, não um teto numérico: cada vermelho precisa de um motivo
   * que caiba numa linha. Cresceu uma vez, em 27/08/2026, quando a varredura do
   * banco mostrou que `billing_issue` — falha de PAGAMENTO — chegava como
   * `social`, a função descrita no componente como "informativo, não
   * acionável". Dinheiro é o caso para o qual o vermelho existe.
   *
   * Continua fora, e de propósito: `streak_at_risk` e `inactivity`. São
   * cutucões do app; se cutucão for vermelho, a fatura perde como gritar.
   */
  it('o vermelho é exclusivo do aviso — é a única cor de alarme', () => {
    const avisos = tipos().filter((t) => t.funcao === 'aviso').map((t) => t.chave).sort()
    expect(avisos, 'só comunicado do sistema e dinheiro justificam vermelho').toEqual([
      'billing_issue', // cobrança falhou — o usuário perde acesso se ignorar
      'broadcast',     // comunicado do sistema
    ])
  })

  it('as cinco funções existem no mapa de estilo, e só elas', () => {
    const mapa = codigo.slice(codigo.indexOf('ESTILO_POR_FUNCAO'), codigo.indexOf('\n}', codigo.indexOf('ESTILO_POR_FUNCAO')))
    for (const f of FUNCOES) expect(mapa).toContain(`${f}:`)
  })

  /**
   * O teto é de RÓTULOS distintos, não de entradas do mapa: `invite` e
   * `team_invite` são dois nomes do mesmo evento (compatibilidade com dados
   * antigos) e chegam ao usuário como um "Convite" só. Contar entradas puniria
   * o alias sem que nada mudasse na tela — e o que o teto protege é a
   * percepção: se tudo vira ação, nada é ação.
   */
  it('pedir resposta é raro — se tudo vira ação, nada é ação', () => {
    const rotulos = new Set(tipos().filter((t) => t.funcao === 'acao').map((t) => t.rotulo))
    expect([...rotulos].sort()).toEqual(['Acesso', 'Cadastro', 'Convite', 'Desafio', 'Mensagem', 'Seguir'])
    expect(rotulos.size).toBeLessThanOrEqual(6)
  })

  /**
   * O teto subiu de 4 para 6 em 27/08/2026, e o critério é o que importa: AÇÃO
   * exige que alguém espere resposta sua E que exista onde responder.
   *
   * `Acesso` e `Cadastro` (`admin_access_request` / `admin_new_signup`) passam
   * nos dois: são pessoas paradas na fila de aprovação, e o painel de admin tem
   * a aba onde se aprova — o push desses tipos já navega para lá há tempos.
   * Chegavam como `social`, com a mesma cara de um story curtido.
   *
   * Eles não inflam a percepção de quem usa o app para treinar: só administrador
   * os recebe. Foram 26 em 180 dias, contra 1.840 de `workout_start`.
   */
  it('ação exige alguém esperando E onde responder', () => {
    const acoes = tipos().filter((t) => t.funcao === 'acao').map((t) => t.chave)
    // Nenhum tipo puramente informativo pode se declarar ação — este é o
    // deslizamento que o teto existe para pegar.
    for (const informativo of ['friend_online', 'story_posted', 'workout_start', 'friends_trained_today']) {
      expect(acoes, `${informativo} não pede resposta de ninguém`).not.toContain(informativo)
    }
  })
})
