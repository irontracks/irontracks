import { describe, it, expect } from 'vitest'
import { escolherRegistro, montarDossier, periodoDoDossier, avisoForaDoPeriodo, SEM_REGISTRO } from '@/lib/dossier/buildDossier'
import { buildDossierHtml } from '@/utils/report/buildDossierHtml'

/**
 * Regra do dono (02/09/2026): sem registro NO período, o dossiê pega o
 * ÚLTIMO de qualquer data e AVISA; sem nenhum, a seção diz isso.
 */
const periodo = { inicio: '2026-08-27', fim: '2026-09-02' }

describe('escolherRegistro — no período, ou o último com aviso', () => {
  it('prefere o mais recente DENTRO do período, mesmo havendo um mais novo fora dele (data futura não conta)', () => {
    const r = escolherRegistro([
      { d: '2026-08-10' }, { d: '2026-08-30' }, { d: '2026-08-28' },
    ], (x) => x.d, periodo)
    expect(r).toEqual({ registro: { d: '2026-08-30' }, data: '2026-08-30', foraDoPeriodo: false })
  })
  it('sem registro no período, devolve o mais recente de qualquer data marcado como fora', () => {
    const r = escolherRegistro([{ d: '2026-05-01' }, { d: '2026-07-15' }], (x) => x.d, periodo)
    expect(r).toEqual({ registro: { d: '2026-07-15' }, data: '2026-07-15', foraDoPeriodo: true })
  })
  it('sem nenhum registro, null', () => {
    expect(escolherRegistro([], (x: { d: string }) => x.d, periodo)).toBeNull()
    expect(escolherRegistro([{ d: null }], (x) => x.d, periodo)).toBeNull()
  })
  it('aceita timestamp e compara pelo dia', () => {
    const r = escolherRegistro([{ d: '2026-08-29T23:10:00+00:00' }], (x) => x.d, periodo)
    expect(r?.foraDoPeriodo).toBe(false)
    expect(r?.data).toBe('2026-08-29')
  })
})

describe('periodoDoDossier', () => {
  it('7 dias terminando hoje, hoje incluso', () => {
    expect(periodoDoDossier('week', '2026-09-02')).toEqual({ tipo: 'week', dias: 7, inicio: '2026-08-27', fim: '2026-09-02' })
    expect(periodoDoDossier('month', '2026-09-02').inicio).toBe('2026-08-04')
  })
})

const base = () => ({
  periodo: periodoDoDossier('week', '2026-09-02'),
  aluno: 'Teste',
  geradoEm: '2026-09-02T12:00:00.000Z',
  treino: null,
  nutricao: null,
  nutricaoDias: [],
  metaKcal: null,
})

describe('buildDossierHtml — cada seção diz quando não tem dado', () => {
  it('sem nada registrado: as três seções de registro dizem SEM_REGISTRO e treino/dieta dizem que não houve', () => {
    const html = buildDossierHtml(montarDossier(base(), { exames: [], avaliacoes: [], fotos: [] }))
    expect(html.split(SEM_REGISTRO).length - 1).toBe(3)
    expect(html).toContain('Nenhum treino concluído no período.')
    expect(html).toContain('Nenhuma refeição lançada no período.')
  })
  it('registro fora do período aparece COM a data e o aviso', () => {
    const html = buildDossierHtml(montarDossier(base(), {
      exames: [{ exam_date: '2026-06-10', lab_name: 'Lab X', protocol: { headline: 'Tudo em ordem' }, extracted_markers: { markers: [] } }],
      avaliacoes: [],
      fotos: [],
    }))
    expect(html).toContain(avisoForaDoPeriodo('2026-06-10'))
    expect(html).toContain('10/06/2026')
    expect(html).toContain('Tudo em ordem')
  })
  it('registro dentro do período NÃO leva aviso', () => {
    const html = buildDossierHtml(montarDossier(base(), {
      exames: [],
      avaliacoes: [{ assessment_date: '2026-08-30', weight: 80.4, body_fat_percentage: 14.2 }],
      fotos: [],
    }))
    expect(html).not.toContain('fora do período')
    expect(html).toContain('Registro de 30/08/2026')
    expect(html).toContain('80,4 kg')
  })
  it('escapa HTML vindo do banco', () => {
    const html = buildDossierHtml(montarDossier(base(), {
      exames: [{ exam_date: '2026-08-30', lab_name: '<script>x</script>', protocol: {}, extracted_markers: {} }],
      avaliacoes: [], fotos: [],
    }))
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })
  it('não chama IA: nada de /api/ai no fluxo do dossiê (decisão do dono)', async () => {
    const fs = await import('node:fs')
    for (const f of ['src/hooks/useDossier.ts', 'src/utils/report/buildDossierHtml.ts', 'src/lib/dossier/buildDossier.ts']) {
      expect(fs.readFileSync(f, 'utf8')).not.toMatch(/\/api\/ai\//)
    }
  })
})
