import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { MACHINE_ACCENT } from '@/lib/design/machineAccent'

/**
 * Valor digitado × sugestão — auditoria de design, ago/2026.
 *
 * Nos campos da série, o placeholder era `neutral-400` e o valor real
 * `text-white`, ambos sem peso. Em tela escura, os dois tons ficam próximos
 * demais: batendo o olho não dava para saber o que era SEU e o que era
 * sugestão do plano ou do motor de carga — no dado mais importante do app, o
 * peso que a pessoa vai levantar.
 *
 * No RPE era pior: o input inteiro é amarelo e o placeholder vinha a 60% da
 * mesma cor, então a sugestão parecia um valor já preenchido.
 */

const SRC = join(__dirname, '..', '..', '..')
const normalSet = readFileSync(join(SRC, 'components', 'workout', 'set-renderers', 'normalSet.tsx'), 'utf8')

const estilos = normalSet.slice(normalSet.indexOf('const inputBase ='), normalSet.indexOf('const collapseAndScroll'))

describe('peso visual', () => {
    it('o valor digitado é font-black', () => {
        expect(estilos.match(/text-white font-black/g) || []).toHaveLength(2) // base + compact
    })

    it('o placeholder não herda o peso do valor', () => {
        // Sem `placeholder:font-normal`, o font-black do input vaza para o
        // placeholder e o disfarce volta.
        expect(estilos.match(/placeholder:font-normal/g) || []).toHaveLength(2)
    })
})

describe('tom do placeholder', () => {
    it('está em neutral-600, não em neutral-400', () => {
        expect(estilos).toContain('placeholder:text-neutral-600')
        expect(estilos, 'neutral-400 é claro demais — passa por valor preenchido')
            .not.toContain('placeholder:text-neutral-400')
    })

    it('no RPE, a sugestão amarela fica bem apagada', () => {
        expect(normalSet).toContain('placeholder:text-yellow-700/45')
        expect(normalSet, 'a 60% a sugestão de RPE parecia valor já preenchido')
            .not.toContain('placeholder:text-yellow-600/60')
    })

    it('a sugestão do motor continua com a moldura violeta própria', () => {
        // O autoload identifica-se por borda/fundo, não por cor de texto —
        // isso não pode se perder junto.
        //
        // A moldura saiu da mão e virou `MACHINE_ACCENT.field` (12/08/2026),
        // então o guard aponta para a FONTE em vez da classe: procurar só a
        // literal o deixaria cego no dia da migração, e o valor real aqui é
        // "o campo sugerido tem moldura própria", não "a string é esta".
        expect(normalSet).toMatch(/MACHINE_ACCENT\.field|border-violet-500\/60/)
        expect(MACHINE_ACCENT.field, 'a moldura deixou de ser violeta').toContain('border-violet-500/60')
    })
})
