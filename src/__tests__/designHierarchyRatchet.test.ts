import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { describe, it, expect } from 'vitest'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REGRA DA HIERARQUIA — o guard que a faz valer.
 *   Texto da regra: docs/DESIGN_HIERARCHY.md
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * POR QUE ELE EXISTE. Na auditoria de design de ago/2026 o MESMO defeito
 * apareceu quatro vezes, em quatro cards escritos por gente diferente:
 *
 *   · barras de macro     — razão + barra + percentual + restante, quatro
 *                           codificações do mesmo fato por linha;
 *   · heatmap             — legenda repetindo o que a grade desenha;
 *   · card de lançamento  — "655 kcal" no cabeçalho E no rodapé da mesma caixa;
 *   · hero de calorias    — selo "85%" ao lado do anel que já desenha 85%.
 *
 * Nos quatro, o duplicado tinha MAIS peso visual que o original. Ninguém foi
 * descuidado: a regra simplesmente não estava escrita.
 *
 * O QUE ESTE GUARD PEGA — e só isso, de propósito:
 * imprimir como TEXTO o mesmo percentual que o componente já desenha como
 * gráfico. É o único caso da família que dá para provar mecanicamente sem
 * inventar falso positivo.
 *
 * O QUE ELE NÃO PEGA, e por quê (medido, não suposto):
 * "o mesmo valor renderizado duas vezes" parece o guard óbvio e é inútil —
 * dentro de um `.map()` a mesma expressão aparece legitimamente em itens
 * diferentes, e um `Math.round(x)` no texto + outro no `aria-valuetext` é o
 * comportamento CORRETO. As duas primeiras versões deste arquivo acusavam
 * `MacroBar` e `NutritionEntryCard`, que estão certos. Guard que grita no lugar
 * errado é afrouxado na primeira semana — e aí não guarda mais nada.
 *
 * Para o resto da regra, o revisor é humano: docs/DESIGN_HIERARCHY.md tem a
 * pergunta de três linhas que se faz em code review.
 */

/**
 * Componentes que PODEM imprimir o percentual ao lado do próprio gráfico.
 * A lista só encolhe. Entrada nova exige motivo escrito — e a pergunta a
 * responder é: "o número diz algo que o desenho não diz?".
 */
const EXCECOES: { arquivo: string; componente: string; motivo: string }[] = []

const semComentarios = (s: string): string =>
  s
    .replace(/\/\*[^]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')

/**
 * Apaga o VALOR dos atributos JSX, com chaves balanceadas. Sobra o que o olho
 * lê. Sem isso, `aria-valuetext={`… ${pct}%`}` e `style={{ width: `${pct}%` }}`
 * são acusados — e os dois são exatamente o uso correto.
 */
const semAtributos = (src: string): string => {
  const attr = /\b(?:aria-[\w-]+|title|alt|label|placeholder|style|className|value|content|d)\s*=\s*/g
  let out = ''
  let i = 0
  let m: RegExpExecArray | null
  while ((m = attr.exec(src)) !== null) {
    if (m.index < i) continue
    out += src.slice(i, m.index)
    let j = attr.lastIndex
    const c = src[j]
    if (c === '"' || c === "'") {
      j = src.indexOf(c, j + 1) + 1
    } else if (c === '{') {
      let d = 0
      while (j < src.length) {
        if (src[j] === '{') d++
        else if (src[j] === '}') { d--; if (!d) { j++; break } }
        j++
      }
    }
    i = j
    attr.lastIndex = j
  }
  return out + src.slice(i)
}

/** Fatia o arquivo por componente: a relação gráfico↔texto só vale no mesmo escopo. */
const componentes = (src: string): { nome: string; corpo: string }[] => {
  const marcas = [...src.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)|(?:^|\n)\s*const\s+([A-Z]\w*)\s*[:=][^=]*=>/g)]
  if (!marcas.length) return [{ nome: '(módulo)', corpo: src }]
  return marcas.map((m, i) => ({
    nome: m[1] || m[2] || '(anônimo)',
    corpo: src.slice(m.index ?? 0, marcas[i + 1]?.index ?? src.length),
  }))
}

/** Sinais de que o componente DESENHA proporção. */
const DESENHA = /role="progressbar"|<CalorieRing|strokeDasharray|<MacroBar|pct=\{|percent=\{/

/**
 * O prefixo do identificador é OPCIONAL: sem isso, `{pct}%` puro nunca casa
 * (o `[A-Za-z_$]` inicial come o "p" e o sufixo "pct" fica sem sobra) e o guard
 * passa verde justamente no caso mais óbvio. Foi o que o teste de autoprova
 * pegou na primeira versão deste arquivo.
 */
const IMPRIME_PCT = /\{[^{}]*?\b((?:[A-Za-z_$][\w$.]*)?(?:pct|Pct|percent|Percent))\b[^{}]*?\}\s*%/g

/**
 * O detector, num lugar só — o caso de autoprova exercita ESTA função, não uma
 * cópia dela. Provar uma cópia é provar nada.
 */
const repeticoesEm = (corpo: string): string[] => {
  if (!DESENHA.test(corpo)) return []
  const doGrafico = new Set(
    [...corpo.matchAll(/(?:pct|percent)=\{([A-Za-z_$][\w$.]*)\}/g)].map((m) => m[1]),
  )
  const impressos = [...semAtributos(corpo).matchAll(IMPRIME_PCT)].map((m) => m[1])
  return impressos.filter((v) => doGrafico.has(v) || /^(pct|percent)$/i.test(v))
}

describe('regra da hierarquia — o número não repete o desenho', () => {
  it('nenhum componente imprime como texto o percentual que ele já desenha', () => {
    const arquivos = execSync("find src -name '*.tsx' -not -path '*__tests__*'")
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean)

    const violacoes: string[] = []

    for (const arquivo of arquivos) {
      const bruto = semComentarios(readFileSync(arquivo, 'utf8'))
      for (const { nome, corpo } of componentes(bruto)) {
        const repetidos = repeticoesEm(corpo)
        if (!repetidos.length) continue
        if (EXCECOES.some((e) => arquivo.endsWith(e.arquivo) && e.componente === nome)) continue
        violacoes.push(`${arquivo} › ${nome}: imprime ${[...new Set(repetidos)].join(', ')} que ele mesmo desenha`)
      }
    }

    expect(
      violacoes,
      [
        'REGRA DA HIERARQUIA (docs/DESIGN_HIERARCHY.md):',
        'o gráfico já mostra a proporção — o texto ao lado tem que dizer OUTRA coisa,',
        'de preferência o que falta para a meta, que é o número acionável.',
        'Se houver motivo real, some uma entrada em EXCECOES com o porquê.',
        '',
        ...violacoes,
      ].join('\n'),
    ).toEqual([])
  })

  it('a lista de exceções só encolhe — entrada morta reprova', () => {
    for (const e of EXCECOES) {
      const bruto = semComentarios(readFileSync(`src/${e.arquivo.replace(/^src\//, '')}`, 'utf8'))
      const alvo = componentes(bruto).find((c) => c.nome === e.componente)
      expect(alvo, `exceção aponta para um componente que não existe mais: ${e.arquivo} › ${e.componente}`).toBeDefined()
      expect(e.motivo.length, `exceção sem motivo escrito: ${e.arquivo}`).toBeGreaterThan(20)
    }
  })

  it('o guard sabe reprovar — prova por construção', () => {
    // Um componente sintético que comete a violação exata. Sem este caso, um
    // detector quebrado (regex que nunca casa) passaria verde para sempre e a
    // regra viraria papel de parede.
    const fonte = `
      function CardFalso({ pct }: { pct: number }) {
        return (
          <div>
            <div role="progressbar" aria-valuenow={pct} style={{ width: \`\${pct}%\` }} />
            <span>{pct}%</span>
          </div>
        )
      }
    `
    const { nome, corpo } = componentes(semComentarios(fonte))[0]
    expect(nome).toBe('CardFalso')
    expect(repeticoesEm(corpo), 'o detector precisa enxergar o texto e ignorar aria/style').toContain('pct')
  })

  it('e sabe APROVAR o uso correto — percentual em aria e style não é repetição', () => {
    // O contrário do caso acima: o percentual só existe para o leitor de tela e
    // para a largura da barra. Acusar isto seria proibir o consumo correto — o
    // jeito nº 4 de escrever guard falso, já cometido neste repo.
    const fonte = `
      function CardCerto({ pct, falta }: { pct: number; falta: number }) {
        return (
          <div>
            <div role="progressbar" aria-valuetext={\`\${pct}%\`} style={{ width: \`\${pct}%\` }} />
            <span>faltam {falta} g</span>
          </div>
        )
      }
    `
    const { corpo } = componentes(semComentarios(fonte))[0]
    expect(repeticoesEm(corpo)).toEqual([])
  })
})
