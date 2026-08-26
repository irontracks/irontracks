import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { BACK_OVERLAYS, FRONT_OVERLAYS } from '@/lib/muscleMap/overlays'

/**
 * O mapa muscular pinta o músculo sobrepondo um PNG à foto do manequim, e o
 * recorte de QUAL músculo acende vem do canal ALFA do próprio PNG (a máscara
 * do corpo só impede vazamento para fora da silhueta — ela não distingue peito
 * de coxa). PNG opaco de ponta a ponta nessa pasta acende o corpo inteiro.
 *
 * Foi assim que `public/muscle-overlays-female/` nasceu inútil em 13/03/2026:
 * arte de estoque exportada para composição por blend, 100% opaca, cada arquivo
 * num enquadramento diferente. O commit eb55b1b03 tirou a pasta do render no
 * mesmo dia e as bases femininas foram trocadas por versões alinhadas ao
 * manequim masculino — os overlays de `/muscle-overlays/` já desenham anatomia
 * feminina (o `front-chest.png` é um torso com seios) e servem os dois gêneros.
 * A pasta ficou órfã e enganou quem passou depois. Ver CLAUDE.md.
 *
 * As três superfícies que desenham o corpo (tela, PDF e manequim do Story) leem
 * a tabela única `lib/muscleMap/overlays.ts`, e é dela que este guard tira a
 * lista de nomes — mirar no arquivo que CONSOME deixaria um consumidor novo
 * fora da varredura sem ninguém perceber.
 */

const OVERLAY_DIR = join(process.cwd(), 'public/muscle-overlays')
const PUBLIC_DIR = join(process.cwd(), 'public')

/** Nomes de PNG que a tabela única manda desenhar. */
const arquivosReferenciados = (): Set<string> =>
    new Set([...FRONT_OVERLAYS, ...BACK_OVERLAYS].map((o) => o.file))

/**
 * Lê o IHDR do PNG e responde se ele carrega transparência: color type 4/6
 * têm canal alfa; type 3 (paleta) só transparece com um chunk `tRNS`.
 */
const temCanalAlfa = (caminho: string): boolean => {
    const buf = readFileSync(caminho)
    const colorType = buf[25]
    if (colorType === 4 || colorType === 6) return true
    if (colorType !== 3) return false
    return buf.includes(Buffer.from('tRNS', 'ascii'))
}

describe('overlays do mapa muscular', () => {
    it('todo PNG citado nas tabelas existe na pasta', () => {
        const faltando = [...arquivosReferenciados()].filter((n) => !existsSync(join(OVERLAY_DIR, n)))
        expect(faltando, `overlay citado no código sem PNG em public/muscle-overlays/: ${faltando.join(', ')}`).toEqual([])
    })

    it('todo PNG da pasta tem alfa — opaco acende o corpo inteiro', () => {
        const opacos = readdirSync(OVERLAY_DIR)
            .filter((n) => n.endsWith('.png'))
            .filter((n) => !temCanalAlfa(join(OVERLAY_DIR, n)))
        expect(
            opacos,
            `PNG sem canal alfa em public/muscle-overlays/: ${opacos.join(', ')}. ` +
            'O recorte do músculo é o alfa; sem ele o overlay pinta a silhueta inteira.',
        ).toEqual([])
    })

    it('existe UMA pasta de overlays — variante por gênero é overlay órfão', () => {
        const pastas = readdirSync(PUBLIC_DIR, { withFileTypes: true })
            .filter((d) => d.isDirectory() && d.name.startsWith('muscle-overlays'))
            .map((d) => d.name)
        expect(
            pastas,
            'O gênero troca a BASE e a MÁSCARA do corpo, nunca os overlays. ' +
            'Pasta paralela vira 1 MB de asset que nenhum código lê (ver CLAUDE.md).',
        ).toEqual(['muscle-overlays'])
    })
})
