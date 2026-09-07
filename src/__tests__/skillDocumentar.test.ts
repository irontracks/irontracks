/**
 * O protocolo do `/documentar` — o que impede o `CLAUDE.md` de virar imposto.
 *
 * O comando em si vive em `.claude/commands/`, que está no `.gitignore`: **este
 * guard não pode olhar para lá**, porque no CI aquele diretório não existe. O
 * que se trava aqui é o conteúdo versionado em `docs/`.
 *
 * As duas fases travadas abaixo nasceram de furos reais da primeira versão:
 *  - 3½ — a skill me deixou DOCUMENTAR uma armadilha que dava para ELIMINAR;
 *  - 5½ — a skill só sabia acrescentar, num arquivo que já tinha 2.505 linhas
 *    (184 KB) lidas em toda sessão.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const CAMINHO = join(process.cwd(), 'docs/skill-documentar.md')

describe('protocolo do /documentar', () => {
  it('está versionado em docs/ — em `.claude/` ele some no clone e não passa por PR', () => {
    expect(existsSync(CAMINHO)).toBe(true)
  })

  const doc = existsSync(CAMINHO) ? readFileSync(CAMINHO, 'utf8') : ''

  /**
   * ⚠️ Pelo TÍTULO, não pela menção. A primeira versão usava `toContain('Fase
   * 3½')` e passou verde com a fase inteira renomeada — porque outro parágrafo
   * cita "a Fase 3½ decidiu". Guard que casa com a referência não protege a
   * seção referida.
   */
  it('tem as sete fases, incluindo as duas que nasceram de furo', () => {
    for (const fase of ['Fase 1', 'Fase 2', 'Fase 3', 'Fase 3½', 'Fase 4', 'Fase 5', 'Fase 5½', 'Fase 6', 'Fase 7']) {
      expect(doc, `${fase} sumiu do protocolo`).toMatch(new RegExp(`^### ${fase}`, 'm'))
    }
  })

  /** Sem isto, a skill vira "documente a armadilha" — e a armadilha continua lá. */
  it('manda ELIMINAR a armadilha antes de escrevê-la', () => {
    expect(doc).toMatch(/Dá para fazer X deixar de acontecer/)
    expect(doc).toMatch(/vira folclore/)
  })

  /**
   * Sem isto, toda execução engorda o arquivo que é lido em toda sessão.
   *
   * ⚠️ Asserção DENTRO do bloco da fase: `docs/<assunto>.md` aparece duas vezes
   * no documento, e checar o arquivo inteiro passava verde com a regra apagada
   * da Fase 5½ (medido por mutação).
   */
  it('tem orçamento: nota longa vai para docs/, e toda execução tenta podar', () => {
    const i = doc.indexOf('### Fase 5½')
    expect(i, 'a fase do orçamento sumiu').toBeGreaterThan(-1)
    const bloco = doc.slice(i, doc.indexOf('### Fase 6', i))
    expect(bloco).toMatch(/lido INTEIRO em toda sessão/)
    expect(bloco, 'sem destino, "nota longa" não sai do CLAUDE.md').toMatch(/docs\/<assunto>\.md/)
    expect(bloco).toMatch(/tornou redundante e apague/)
  })

  /**
   * A Fase 5 é ONDE se decide o destino da nota — e ela não estava protegida.
   * Descoberto por mutação: apagar `docs/<assunto>.md` de lá passava verde,
   * porque o guard do orçamento só olhava a Fase 5½. "Onde o guard NÃO olha?"
   * é a pergunta certa ao escrever guard.
   */
  it('a Fase 5 lista os quatro destinos possíveis', () => {
    const i = doc.indexOf('### Fase 5 —')
    expect(i, 'a fase que escolhe o destino sumiu').toBeGreaterThan(-1)
    const bloco = doc.slice(i, doc.indexOf('### Fase 5½', i))
    expect(bloco, 'seção existente').toMatch(/funda ali/)
    expect(bloco, 'comentário no código').toMatch(/comentário no arquivo/)
    expect(bloco, 'conteúdo extenso').toMatch(/docs\/<assunto>\.md/)
    expect(bloco, 'regra de comportamento vai para o global').toMatch(/~\/\.claude\/CLAUDE\.md/)
  })

  it('separa regra de comportamento (global) de conhecimento do repo (projeto)', () => {
    expect(doc).toMatch(/~\/\.claude\/CLAUDE\.md/)
  })

  /**
   * Pedido do dono em 07/09/2026: o comando existe para permitir o `/clear`, e
   * ele não deve ter que deduzir se já pode.
   *
   * ⚠️ Asserção DENTRO do bloco da Fase 7, não no arquivo inteiro: a mesma
   * frase aparece no checklist final, e olhar o documento todo passaria verde
   * com a regra apagada de onde ela é executada (é o 7º jeito de errar da lista
   * de guards falsos do CLAUDE.md — casar com a referência, não com a seção).
   */
  it('manda encerrar com "(pode rodar o /clear)", e só depois de publicado', () => {
    const i = doc.indexOf('### Fase 7')
    expect(i, 'a fase de subir sumiu').toBeGreaterThan(-1)
    const bloco = doc.slice(i, doc.indexOf('## Checklist final', i))
    expect(bloco, 'sem a linha literal, o dono fica adivinhando se já pode limpar').toContain('(pode rodar o /clear)')
    // A ORDEM é o que protege o achado: dita antes do verde, a frase manda
    // apagar a conversa com a nota ainda não publicada.
    expect(bloco, 'a frase não pode vir antes do CI verde').toMatch(/depois do CI verde/)
  })

  it('exige fonte para cada afirmação e rótulo para suspeita', () => {
    expect(doc).toMatch(/Número medido, nunca impressão/)
    expect(doc).toMatch(/Rotule o que não foi confirmado/)
  })
})
