import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Nenhuma query filtra por dia mandando data SEM fuso.
 *
 * `completed_at`, `created_at` e afins são `timestamptz`, e o Postgrest resolve
 * string sem offset no fuso da SESSÃO — que é **UTC**. Uma janela montada como
 * `` `${dia}T00:00:00` `` vai das **21:00 do dia anterior** às **20:59** em São
 * Paulo. Medido quando isto era bug vivo na nutrição: **37 de 658 sessões
 * (5,6%), em 29 dias distintos**, caíam no dia seguinte — e o overlay decidia
 * `trainedToday` por essa janela, então a META do dia era rebaixada para quem
 * treinava às 21h30.
 *
 * A saída é `brtDayStartUtc` (`utils/cron/weekRangeBrt.ts`), que devolve o
 * instante UTC da meia-noite de Brasília.
 *
 * ⚠️ Este guard mira SÓ no argumento de uma comparação do Postgrest
 * (`.gte`/`.lte`/`.lt`/`.gt`). `new Date('2026-08-31T00:00:00')` no CLIENTE é
 * outro caso e está CERTO — ali a string é lida no fuso do aparelho, que é o do
 * usuário. Acusá-lo seria o jeito nº 8 de guard falso (largo demais), e há 6
 * usos legítimos assim no app hoje.
 */

const semComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

/**
 * Comparação temporal cujo argumento é uma data literal SEM fuso.
 *
 * Aceita o que termina em `Z` (instante UTC explícito) e o que traz offset
 * (`-03:00`). Reprova o resto.
 */
const SEM_FUSO = /\.(?:gte|lte|lt|gt)\(\s*['"][^'"]*['"]\s*,\s*[`'"][^`'"]*T\d{2}:\d{2}:\d{2}(?:\.\d+)?[`'"]/g

const varrer = (dir: string, achados: string[] = []): string[] => {
    for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome)
        if (statSync(caminho).isDirectory()) {
            if (nome === '__tests__' || nome === 'node_modules') continue
            varrer(caminho, achados)
        } else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
            achados.push(caminho)
        }
    }
    return achados
}

describe('janela de dia em consulta', () => {
    it('ninguém compara timestamp com data sem fuso', () => {
        const culpados: string[] = []
        for (const arquivo of varrer('src')) {
            const achados = semComentarios(readFileSync(arquivo, 'utf8')).match(SEM_FUSO)
            if (achados) culpados.push(`${arquivo}: ${achados[0].trim()}`)
        }

        expect(
            culpados,
            'a coluna é timestamptz e o Postgrest resolve em UTC — use `brtDayStartUtc`',
        ).toEqual([])
    })

    it('o guard reconhece a forma defeituosa (senão ele não protege nada)', () => {
        // Sem este caso, um regex que não casa com NADA passaria verde para
        // sempre — o jeito nº 6 de guard falso, ancorado no que desapareceu.
        const ruim = "supabase.from('workouts').gte('completed_at', `${dia}T00:00:00`)"
        expect(ruim.match(SEM_FUSO)).not.toBeNull()
    })

    it('e NÃO acusa as formas corretas', () => {
        for (const bom of [
            "q.gte('completed_at', inicio.toISOString())",
            "q.gte('completed_at', `${dia}T00:00:00Z`)",
            "q.lt('completed_at', `${dia}T00:00:00-03:00`)",
            "const d = new Date(`${dia}T00:00:00`)", // cliente: fuso do aparelho
        ]) {
            expect(bom.match(SEM_FUSO), `acusou uso legítimo: ${bom}`).toBeNull()
        }
    })
})
