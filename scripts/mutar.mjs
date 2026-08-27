#!/usr/bin/env node
/**
 * Prova por MUTAÇÃO sem depender do git.
 *
 * A regra do repo é "guard só vale se ficar vermelho com o bug reposto", e o
 * jeito manual de fazer isso — editar o arquivo, rodar o teste, `git checkout`
 * para desfazer — tem três armadilhas, todas com histórico aqui:
 *
 * 1. **O `git checkout` apaga trabalho não commitado.** Aconteceu em 15/08 e
 *    25/08/2026, com a regra já escrita no CLAUDE.md, e TRÊS vezes na sessão de
 *    27/08. O sintoma é traiçoeiro: os testes seguintes passam verdes (o import
 *    quebrado derruba outra coisa, ou a mutação nem chega a existir) e você
 *    conclui "provado" sobre um arquivo que voltou no tempo.
 * 2. **A mutação pode não ser aplicada.** Um `sed`/`replace` que não casa
 *    devolve o arquivo intacto, o teste passa, e "provado por mutação" vira
 *    mentira em silêncio. Em 25/08 duas mutações morreram em erro de aspas e o
 *    resultado "14 passed" parecia prova.
 * 3. **Passar nos dois estados não é lido como falha.** Se o teste fica verde
 *    com o bug reposto, o TESTE está errado — e isso precisa gritar, não ser
 *    interpretado.
 *
 * Aqui as três somem por construção: o backup é do CONTEÚDO (não do índice do
 * git), a substituição é verificada antes de rodar, e verde com a mutação é
 * saída 1 com a mensagem explícita.
 *
 * Uso:
 *   node scripts/mutar.mjs <arquivo> <de> <para> -- <comando de teste>
 *
 *   node scripts/mutar.mjs src/lib/x.ts "a >= b" "a > b" -- \
 *     npx vitest run src/lib/__tests__/x.test.ts
 *
 * `de` e `para` são texto LITERAL, não regex — o que se cola do editor funciona.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

/**
 * A mutação vale a pena ser aplicada?
 *
 * PURA para poder ser testada — é ela que separa "provei" de "achei que
 * provei". `ocorrencias === 0` é o caso que mais dói: o arquivo fica intacto,
 * o teste passa, e o resultado verde parece prova.
 */
export function decidirAplicar({ ocorrencias, deIgualPara, conteudoMudou }) {
  if (deIgualPara) return { acao: 'abortar', motivo: '`de` e `para` são iguais — isso não muda nada' }
  if (!ocorrencias) return { acao: 'abortar', motivo: 'o trecho não existe no arquivo — a mutação NÃO seria aplicada' }
  if (!conteudoMudou) return { acao: 'abortar', motivo: 'o conteúdo ficou idêntico após a substituição' }
  return { acao: 'aplicar', motivo: '' }
}

/**
 * O que o resultado do teste significa.
 *
 * Verde COM o bug reposto não é sucesso: é o guard não pegando nada. Deixar
 * isso como interpretação do leitor é como "provado por mutação" vira mentira.
 */
export function interpretarResultado({ saidaDoTeste }) {
  return saidaDoTeste === 0
    ? { veredicto: 'guard-falso', mensagem: 'o teste passou COM a mutação aplicada' }
    : { veredicto: 'guard-pega', mensagem: 'vermelho com a mutação' }
}

/**
 * Só executa quando chamado direto — o teste importa as funções puras.
 * (Mesmo padrão de `pr-merge.mjs`: sem isto, importar o módulo dispara o CLI.)
 */
function main() {
  const argv = process.argv.slice(2)
  const sep = argv.indexOf('--')
  if (sep === -1 || sep < 3) {
    process.stderr.write(
      'uso: node scripts/mutar.mjs <arquivo> <de> <para> -- <comando de teste>\n',
    )
    process.exit(2)
  }

  const [arquivo, de, para] = argv.slice(0, 3)
  const comando = argv.slice(sep + 1)
  if (!comando.length) {
    process.stderr.write('ABORTADO: falta o comando de teste depois do `--`.\n')
    process.exit(2)
  }

  /** O conteúdo original — a única cópia que importa. Nunca sai daqui. */
  let original
  try {
    original = readFileSync(arquivo, 'utf8')
  } catch (e) {
    process.stderr.write(`ABORTADO: não consegui ler ${arquivo}.\n  ${e?.message ?? e}\n`)
    process.exit(2)
  }

  // Armadilha 2: a mutação que não casa devolve o arquivo intacto e o teste passa.
  const ocorrencias = original.split(de).length - 1
  const mutado = original.split(de).join(para)
  const { acao, motivo } = decidirAplicar({
    ocorrencias,
    deIgualPara: de === para,
    conteudoMudou: mutado !== original,
  })
  if (acao === 'abortar') {
    process.stderr.write(`ABORTADO: ${motivo}.\n  Arquivo: ${arquivo}\n  Procurei por:\n    ${de.slice(0, 120)}\n`)
    process.exit(2)
  }

  process.stdout.write(
    `mutando ${arquivo} (${ocorrencias} ocorrência${ocorrencias > 1 ? 's' : ''})\n` +
    `  ${de.slice(0, 80).replace(/\n/g, '⏎')}\n  → ${para.slice(0, 80).replace(/\n/g, '⏎')}\n\n`,
  )

  let saida = 1
  try {
    writeFileSync(arquivo, mutado)
    const r = spawnSync(comando[0], comando.slice(1), { stdio: 'inherit', shell: false })
    saida = typeof r.status === 'number' ? r.status : 1
  } finally {
    // Restaura do CONTEÚDO, não do git: trabalho não commitado sobrevive.
    writeFileSync(arquivo, original)
    const conferido = readFileSync(arquivo, 'utf8')
    if (conferido !== original) {
      process.stderr.write(`\n⚠️  ATENÇÃO: ${arquivo} NÃO voltou ao original. Confira antes de commitar.\n`)
      process.exit(3)
    }
    process.stdout.write(`\n${arquivo} restaurado.\n`)
  }

  // Armadilha 3: verde com o bug reposto significa que o TESTE não pega nada.
  const { veredicto, mensagem } = interpretarResultado({ saidaDoTeste: saida })
  if (veredicto === 'guard-falso') {
    process.stderr.write(
      `\n❌ GUARD FALSO: ${mensagem}.\n` +
      '   Ele não exercita o caminho real — corrija o TESTE, nunca o afrouxe.\n',
    )
    process.exit(1)
  }

  process.stdout.write(`\n✅ ${mensagem}: o guard pega o defeito.\n`)

}

if (process.argv[1] && process.argv[1].endsWith('mutar.mjs')) main()
