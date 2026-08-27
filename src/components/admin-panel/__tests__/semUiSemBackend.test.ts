import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * A "Danger Zone" do painel admin foi removida em 27/08/2026, e o motivo não é
 * de design: **a funcionalidade nunca existiu.**
 *
 * O que havia era uma UI completa e convincente — três blocos vermelhos, cada
 * um exigindo digitar `APAGAR` num input, com o `disabled` conferindo o texto e
 * um `runDangerAction` no hook trazendo confirmação dupla, loading e tratamento
 * de erro. Tudo pronto, menos o essencial: os três botões não tinham `onClick`,
 * ninguém chamava `runDangerAction`, e **não existe rota que apague em massa**
 * (`wipe`/`deleteAll`/`purge` em `app/api/admin/` não devolve nada).
 *
 * O usuário digitava APAGAR, o botão habilitava — dando o sinal de que ia
 * funcionar — e o clique não fazia nada. Ele não tinha como distinguir "falhou"
 * de "apagou em silêncio". Numa seção sobre exclusão de dados, essa ambiguidade
 * é a pior possível.
 *
 * O guard trava a CLASSE, não a instância: botão destrutivo sem handler é pior
 * que ausência de botão — promete uma capacidade que não existe.
 */
const DIR = join(process.cwd(), 'src/components/admin-panel')

/**
 * `.ts` TAMBÉM — a primeira versão deste guard varria só `.tsx` e passou verde
 * quando a mutação repôs o estado `dangerOpen` no hook, que é `.ts`. O mesmo
 * defeito que este PR existe para consertar, escrito no próprio guard.
 */
const arquivos = readdirSync(DIR, { recursive: true, encoding: 'utf8' })
  .map((f) => String(f).split('\\').join('/'))
  .filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'))

/** Só o que o navegador executa — o comentário acima cita os nomes proibidos. */
const semComentarios = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** Tags `<button …>` inteiras, andando char a char: `[^>]*` para no `>` de `=>`. */
const botoes = (src: string): string[] => {
  const out: string[] = []
  let i = 0
  while ((i = src.indexOf('<button', i)) >= 0) {
    let j = i
    let prof = 0
    while (j < src.length) {
      const c = src[j]
      if (c === '{') prof++
      else if (c === '}') prof--
      else if (c === '>' && prof === 0) break
      j++
    }
    out.push(src.slice(i, j + 1))
    i = j + 1
  }
  return out
}

describe('painel admin: nenhuma UI promete o que o backend não faz', () => {
  it('a Danger Zone não voltou', () => {
    const vestigios = arquivos.filter((rel) => /danger/i.test(semComentarios(readFileSync(join(DIR, rel), 'utf8'))))
    expect(
      vestigios,
      'a UI existia e o backend não — não há rota que apague em massa. ' +
      'Se o backend for escrito um dia, a UI volta COM ele, não antes.',
    ).toEqual([])
  })

  it('botão destrutivo tem handler — senão promete o que não faz', () => {
    const mudos: string[] = []
    for (const rel of arquivos) {
        if (!rel.endsWith('.tsx')) continue
      for (const tag of botoes(semComentarios(readFileSync(join(DIR, rel), 'utf8')))) {
        const destrutivo = /bg-red-[56]00|Apagar|Excluir|Deletar|Remover tudo/i.test(tag)
        if (destrutivo && !/onClick|onPointerDown|type="submit"/.test(tag)) {
          mudos.push(`${rel}: ${tag.replace(/\s+/g, ' ').slice(0, 60)}`)
        }
      }
    }
    expect(
      mudos,
      'botão destrutivo sem handler: o usuário clica, nada acontece, e ele não ' +
      'distingue "falhou" de "apagou em silêncio"',
    ).toEqual([])
  })
})
