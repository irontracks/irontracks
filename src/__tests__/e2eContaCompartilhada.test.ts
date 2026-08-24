/**
 * Guard da CONTA COMPARTILHADA do E2E logado (24/08/2026).
 *
 * O E2E autenticado roda contra `djmkbrasil`, uma conta real — e a sessão de
 * treino em andamento não vive no navegador: vive no SERVIDOR, na tabela
 * `active_workout_sessions`. Consequência que já derrubou o CI duas vezes por
 * motivos DIFERENTES: qualquer coisa que rode "duas vezes ao mesmo tempo"
 * disputa a mesma linha, e o perdedor cai em "a lista de treinos precisa ter
 * ao menos um card" — mensagem que aponta para o app e não tem nada a ver com
 * ele.
 *
 * Duas fontes de simultaneidade, e este guard tranca as duas:
 *
 *  1. **Dois RUNS do CI ao mesmo tempo.** Medido no PR #909 com precisão de
 *     segundos: o E2E do run que passou ocupou 16:37:42→16:38:11 e o do run
 *     que falhou 16:37:54→16:40:13 — 17 s de sobreposição, com a sessão ativa
 *     nascendo às 16:37:58, dentro deles. Eram dois commits da mesma branch
 *     (o segundo mexia SÓ em documentação). Trava: `concurrency` +
 *     `cancel-in-progress` no `ci.yml`.
 *
 *  2. **Dois TESTES do mesmo spec ao mesmo tempo.** `fullyParallel: true` com
 *     `workers: 2` põe dois casos em voo, e um chama `descartarSessao()` na
 *     sessão que o outro acabou de abrir. Trava: `mode: 'default'` no describe.
 *
 * Esta é a segunda vez que a conta compartilhada quebra o CI (a primeira foi
 * em 16/08/2026, com um simulador esquecido aberto reescrevendo a linha). Por
 * isso o caso 3 é de CLASSE: não basta cobrir o spec que existe hoje.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ci = readFileSync('.github/workflows/ci.yml', 'utf8')

describe('CI não pode rodar dois E2E logados ao mesmo tempo', () => {
  it('o workflow declara concurrency cancelando o run obsoleto da mesma ref', () => {
    // Fatia o bloco `concurrency:` do nível de workflow (coluna 0) — pegar o
    // arquivo inteiro deixaria o teste passar com a chave escrita em qualquer
    // lugar, inclusive comentada dentro de um job.
    const i = ci.search(/^concurrency:/m)
    expect(i, 'ci.yml precisa de um bloco `concurrency:` no nível do workflow').toBeGreaterThan(-1)
    const bloco = ci.slice(i, ci.search(/^jobs:/m))
    expect(bloco).toMatch(/group:\s*\S+/)
    expect(bloco).toMatch(/github\.ref/)
    expect(bloco, 'sem cancel-in-progress os dois runs continuam vivos e disputam a conta')
      .toMatch(/cancel-in-progress:\s*true/)
  })

  it('o E2E logado continua rodando só o spec da jornada', () => {
    // Se um dia outro spec autenticado entrar no comando, ele passa a disputar
    // a conta com a jornada dentro do MESMO run — e o `concurrency` acima, que
    // é entre runs, não protege contra isso.
    const step = ci.slice(ci.indexOf('E2E — jornada logada'))
    const cmd = step.split('\n').find((l) => l.includes('npx playwright test')) ?? ''
    expect(cmd).toMatch(/e2e\/authenticated-workout-journey\.spec\.ts/)
    expect(cmd.match(/e2e\/\S+\.spec\.ts/g) ?? []).toHaveLength(1)
  })
})

describe('spec que abre sessão de treino não pode rodar em paralelo consigo mesmo', () => {
  const dir = path.resolve(process.cwd(), 'e2e')

  /**
   * Casa o LOCATOR, não a menção. O comentário do spec cita "INICIAR TREINO"
   * ao explicar por que o `exact: true` é obrigatório (o card inteiro também é
   * um button); mirar na string solta acusaria a própria documentação — o
   * segundo jeito clássico de escrever guard falso neste repo.
   */
  const ABRE_SESSAO = /name:\s*'INICIAR TREINO'/

  const specsQueAbremSessao = readdirSync(dir)
    .filter((f) => f.endsWith('.spec.ts'))
    .map((f) => ({ nome: f, src: readFileSync(path.join(dir, f), 'utf8') }))
    .filter(({ src }) => ABRE_SESSAO.test(src))

  it('existe ao menos um — senão o guard abaixo não mede nada', () => {
    // Sem esta âncora, renomear o spec faz o `for` rodar sobre lista vazia e o
    // guard fica verde sem olhar para nada (o 5º jeito de errar do CLAUDE.md).
    expect(specsQueAbremSessao.map((s) => s.nome)).toContain('authenticated-workout-journey.spec.ts')
  })

  for (const { nome, src } of specsQueAbremSessao) {
    it(`${nome} declara mode não-paralelo`, () => {
      const configure = src.match(/test\.describe\.configure\(\s*\{[^}]*\}/)?.[0] ?? ''
      expect(
        configure,
        `${nome} abre sessão de treino na conta compartilhada; com fullyParallel:true ` +
        `os casos rodam concorrentes e um descarta a sessão do outro. ` +
        `Use test.describe.configure({ mode: 'default' }).`,
      ).toMatch(/mode:\s*'(default|serial)'/)
    })
  }
})
