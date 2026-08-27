import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const rota = ler('src/app/api/vip/periodization/create/route.ts')
const modal = ler('src/components/vip/PeriodizationCreateModal.tsx')
const client = ler('src/lib/api/vip.ts')

/**
 * Criar periodização devolvia **400 sempre** — e é feature paga.
 *
 * O modal montava um `payload` correto, com os 9 campos, e então enviava OUTRO
 * objeto com 4: `{goal, weeks, daysPerWeek, focusAreas}`. O `BodySchema` da
 * rota é `.strict()`, exige `model` (enum SEM default) e não conhece
 * `focusAreas`. Reprovava pelos DOIS motivos.
 *
 * O que deixou isso compilar por tanto tempo foi o TIPO frouxo do client:
 * `CreatePeriodizationPayload` tinha 4 campos, um deles inexistente na rota. É
 * por isso que o guard mira no tipo, e não só na chamada — o tipo é o que
 * impede o descompasso de voltar.
 */
describe('contrato do modal de periodização × a rota', () => {
  /** Campos que o schema exige sem default: ausentes = 400. */
  const obrigatorios = ['model', 'weeks']

  it('o tipo do client conhece os campos obrigatórios da rota', () => {
    const bloco = client.slice(
      client.indexOf('interface CreatePeriodizationPayload'),
      client.indexOf('}', client.indexOf('interface CreatePeriodizationPayload')),
    )
    for (const campo of obrigatorios) {
      expect(bloco, `\`${campo}\` é obrigatório no BodySchema e falta no tipo do client`).toMatch(
        new RegExp(`\\b${campo}\\??\\s*:`),
      )
    }
  })

  it('nenhuma chave do tipo é desconhecida pela rota — o schema é .strict()', () => {
    expect(rota, 'o schema deixou de ser strict; este guard perde o sentido').toMatch(/\.strict\(\)/)
    const doSchema = new Set(
      [...rota.slice(rota.indexOf('const BodySchema'), rota.indexOf('.strict()')).matchAll(/^\s{4}(\w+):/gm)]
        .map((m) => m[1]),
    )
    const bloco = client.slice(
      client.indexOf('interface CreatePeriodizationPayload'),
      client.indexOf('}', client.indexOf('interface CreatePeriodizationPayload')),
    )
    const doTipo = [...bloco.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1])
    const intrusas = doTipo.filter((c) => !doSchema.has(c))
    expect(
      intrusas,
      'chave que a rota não conhece: com `.strict()`, ela sozinha devolve 400 ' +
      '(foi o caso de `focusAreas`)',
    ).toEqual([])
  })

  it('o modal envia o payload inteiro, não um subconjunto montado na hora', () => {
    const chamada = modal.slice(modal.indexOf('apiVip.createPeriodization'), modal.indexOf('apiVip.createPeriodization') + 200)
    expect(
      chamada,
      'montar um objeto literal na chamada foi o que produziu o descompasso — ' +
      'envie o `payload` que já foi montado e tipado',
    ).toMatch(/createPeriodization\(payload\)/)
  })
})
