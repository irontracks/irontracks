/**
 * Guard de CLASSE: a marca dos relatórios exportados vai em **base64**.
 *
 * O sintoma, visto no aparelho em 23/08/2026 ao conferir o PDF do resumo
 * semanal: no lugar do logo, um retângulo vazio. O gerador de PDF do iOS
 * (`sharePdfFromHtml`) renderiza o HTML **sem esperar a rede**, então um `src`
 * remoto não chega a carregar — e o mesmo vale para o arquivo aberto em
 * `blob:`/`file://`, que nem origem tem. O relatório de SESSÃO já resolvia isso
 * com `fetchLogoDataUrl`; os de PERÍODO e SEMANAL nasceram depois e ficaram de
 * fora — a mesma família do "guard listou os chamadores daquele dia".
 *
 * A verificação é da FIAÇÃO: o builder aceitar `logoDataUrl` não adianta nada
 * se quem exporta não buscar (os dois passariam verdes isolados).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildWeeklyMuscleReportHtml } from '../buildWeeklyMuscleReportHtml'
import { buildPeriodReportHtml } from '../buildPeriodReportHtml'

const SRC = join(process.cwd(), 'src')
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANS'

describe('marca do relatório embutida em base64', () => {
  it('resumo semanal usa o data URL quando ele vem', () => {
    const html = buildWeeklyMuscleReportHtml({
      weekStartDate: '2026-08-17',
      muscles: [{ id: 'chest', label: 'Peitoral', sets: 12, meta: 8, metaMax: 16 }],
      logoDataUrl: LOGO,
      baseUrl: 'https://irontracks.com.br',
    })
    expect(html).toContain(`src="${LOGO}"`)
    expect(html).not.toContain('irontracks.com.br/icone.png')
  })

  it('relatório de período usa o data URL quando ele vem', () => {
    const html = buildPeriodReportHtml({ type: 'week', stats: {}, logoDataUrl: LOGO, baseUrl: 'https://irontracks.com.br' })
    expect(html).toContain(`src="${LOGO}"`)
    expect(html).not.toContain('irontracks.com.br/icone.png')
  })

  it('sem data URL cai na URL remota — melhor que nada no desktop', () => {
    const html = buildPeriodReportHtml({ type: 'week', stats: {}, baseUrl: 'https://irontracks.com.br' })
    expect(html).toContain('https://irontracks.com.br/icone.png')
  })

  it('valor que não é data URL não é aceito como imagem embutida', () => {
    const html = buildWeeklyMuscleReportHtml({ logoDataUrl: 'javascript:alert(1)', baseUrl: 'https://irontracks.com.br' })
    expect(html).not.toContain('javascript:alert(1)')
    expect(html).toContain('https://irontracks.com.br/icone.png')
  })

  it('FIAÇÃO: quem exporta busca o base64 antes de montar o HTML', () => {
    // Sem isto o builder aceita o campo e ninguém preenche — verde com o logo
    // em branco no arquivo, que foi exatamente o estado até aqui.
    for (const rel of [
      'components/dashboard/WeeklyMuscleSummary.tsx',
      'components/history/hooks/useHistoryPeriodReport.ts',
      'components/WorkoutReport.tsx',
    ]) {
      const code = read(rel)
      expect(code, `${rel} deve buscar o logo em base64`).toMatch(/fetchLogoDataUrl\s*\(/)
    }
  })
})
