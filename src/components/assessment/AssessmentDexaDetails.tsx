'use client'

import React from 'react'
import { toPositiveNumberOrNull, type AssessmentRow } from './assessmentUtils'

/**
 * Detalhe de uma avaliação do tipo DEXA (laudo de exame de imagem).
 *
 * Os números são os do LAUDO, na unidade do laudo. Dois cuidados:
 *  - a relação andróide/ginóide é derivada na leitura (20,6 ÷ 18,2 = 1,13, que
 *    bate com o laudo), então não é coluna;
 *  - a massa magra do DEXA EXCLUI o osso — por isso peso, magra, gorda e osso não
 *    precisam somar o peso informado (o aparelho soma a massa total dele).
 */

const fmt = (n: number | null, casas: number, unidade = ''): string =>
    n == null ? '—' : `${n.toFixed(casas).replace('.', ',')}${unidade}`

type Item = { rotulo: string; valor: string }

export function dexaDetailItems(assessment: AssessmentRow): { composicao: Item[]; regioes: Item[] } {
    const n = (k: string) => toPositiveNumberOrNull(assessment?.[k])
    const andro = n('dexa_android_fat_pct')
    const gino = n('dexa_gynoid_fat_pct')
    const relacao = andro != null && gino != null && gino > 0 ? andro / gino : null
    return {
        composicao: [
            { rotulo: 'Massa magra apendicular', valor: fmt(n('dexa_appendicular_lean_kg'), 1, ' kg') },
            { rotulo: 'ASMI', valor: fmt(n('dexa_asmi'), 1, ' kg/m²') },
            { rotulo: 'FMI', valor: fmt(n('dexa_fmi'), 1, ' kg/m²') },
            { rotulo: 'Osso (BMC)', valor: fmt(n('dexa_bone_mass_kg'), 2, ' kg') },
            { rotulo: 'Densidade óssea', valor: fmt(n('dexa_bone_density'), 3, ' g/cm²') },
            { rotulo: 'Andróide / ginóide', valor: fmt(relacao, 2) },
        ],
        regioes: [
            { rotulo: 'Braços', valor: fmt(n('dexa_arms_fat_pct'), 1, '%') },
            { rotulo: 'Pernas', valor: fmt(n('dexa_legs_fat_pct'), 1, '%') },
            { rotulo: 'Tronco', valor: fmt(n('dexa_trunk_fat_pct'), 1, '%') },
            { rotulo: 'Andróide', valor: fmt(andro, 1, '%') },
            { rotulo: 'Ginóide', valor: fmt(gino, 1, '%') },
        ],
    }
}

function Grade({ titulo, itens }: { titulo: string; itens: Item[] }) {
    return (
        <div>
            <h4 className="font-bold text-white mb-2 text-sm">{titulo}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                {itens.map((i) => (
                    <div key={i.rotulo} className="flex justify-between gap-3">
                        <span className="text-neutral-400">{i.rotulo}</span>
                        <span className="font-medium text-white tabular-nums">{i.valor}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

export function AssessmentDexaDetails({ assessment }: { assessment: AssessmentRow }) {
    const { composicao, regioes } = dexaDetailItems(assessment)
    const aparelho = typeof assessment?.dexa_device === 'string' ? assessment.dexa_device.trim() : ''
    return (
        <div className="space-y-4" data-testid="dexa-details">
            <p className="text-xs text-neutral-400">
                Laudo de DEXA{aparelho ? ` · ${aparelho}` : ''}. Método próprio: não se compara com dobras nem
                bioimpedância. A massa magra do DEXA não inclui o osso.
            </p>
            <Grade titulo="Composição" itens={composicao} />
            <Grade titulo="Gordura por região" itens={regioes} />
        </div>
    )
}
