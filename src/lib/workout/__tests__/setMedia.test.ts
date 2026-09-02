import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { readSetMedia, collectSetMediaFromLogs, mediaKindFromMime } from '@/lib/workout/setMedia'
import { groupSetMediaByKey, setMediaStatusText } from '@/lib/workout/setMediaView'
import { buildSetMediaPrompt } from '@/lib/workout/setMediaAnalysis'
import { buildSetMediaRowsHtml } from '@/utils/report/buildSetMediaHtml'

describe('mídia da série — referência no log', () => {
  it('readSetMedia ignora lixo e mantém só refs válidas', () => {
    expect(readSetMedia(null)).toEqual([])
    expect(readSetMedia({ media: 'x' })).toEqual([])
    expect(readSetMedia({ media: [{ id: 'a', kind: 'photo', mime: 'image/jpeg' }, { kind: 'video' }, 7] })).toEqual([{ id: 'a', kind: 'photo', mime: 'image/jpeg' }])
  })
  it('collectSetMediaFromLogs leva a chave, os índices e a observação (que vira a pergunta)', () => {
    const out = collectSetMediaFromLogs({
      '0-0': { media: [{ id: 'a', kind: 'video', mime: 'video/mp4' }], notes: 'está correta?' },
      '2-1': { media: [{ id: 'b', kind: 'photo', mime: 'image/jpeg' }] },
      '3-0': { notes: 'sem mídia' },
    })
    expect(out.map((m) => [m.id, m.exerciseIndex, m.setIndex, m.question])).toEqual([
      ['a', 0, 0, 'está correta?'],
      ['b', 2, 1, ''],
    ])
  })
  it('mediaKindFromMime', () => {
    expect(mediaKindFromMime('image/heic')).toBe('photo')
    expect(mediaKindFromMime('video/quicktime')).toBe('video')
    expect(mediaKindFromMime('application/pdf')).toBeNull()
  })
})

describe('prompt da análise', () => {
  it('foto pergunta pela máquina; vídeo pela técnica; a observação do aluno vem primeiro', () => {
    const foto = buildSetMediaPrompt({ kind: 'photo', exercise_name: 'Supino reto', set_index: 0, question: null })
    expect(foto).toMatch(/equipamento certo/i)
    expect(foto).toContain('Supino reto')
    const video = buildSetMediaPrompt({ kind: 'video', exercise_name: 'Agachamento', set_index: 2, question: 'joelho ok?' })
    expect(video).toMatch(/técnica/i)
    expect(video).toContain('Série 3')
    expect(video).toContain('"joelho ok?"')
  })
})

describe('relatório — status e HTML', () => {
  it('skipped diz o MOTIVO (VIP/cota), não parece falha', () => {
    expect(setMediaStatusText({ aiStatus: 'skipped', aiError: 'vip_required' })).toMatch(/VIP/)
    expect(setMediaStatusText({ aiStatus: 'skipped', aiError: 'daily_quota_exceeded' })).toMatch(/cota/i)
    expect(setMediaStatusText({ aiStatus: 'analyzed', aiError: null })).toBeNull()
  })
  it('groupSetMediaByKey agrupa por "ex-set"', () => {
    const g = groupSetMediaByKey([{ id: '1', exerciseIndex: 1, setIndex: 2, kind: 'photo', aiStatus: 'analyzed' }, { id: '2', exerciseIndex: 1, setIndex: 2, kind: 'video', aiStatus: 'pending' }])
    expect(Object.keys(g)).toEqual(['1-2'])
    expect(g['1-2']).toHaveLength(2)
  })
  it('PDF escapa a resposta da IA e não embute URL', () => {
    const html = buildSetMediaRowsHtml([{ id: '1', exerciseIndex: 0, setIndex: 0, kind: 'video', aiStatus: 'analyzed', aiAnswer: '<b>ok</b> & bom', url: 'https://x/signed' }], 3)
    expect(html).toContain('&lt;b&gt;ok&lt;/b&gt; &amp; bom')
    expect(html).not.toContain('https://x/signed')
  })
})

describe('fiação — a finalização liga a mídia ao treino e dispara a IA', () => {
  const finish = readFileSync('src/app/api/workouts/finish/route.ts', 'utf8')
  it('lê a mídia dos logs, grava o workout_id e chama a análise em waitUntil', () => {
    expect(finish).toMatch(/collectSetMediaFromLogs\(sessionObj\?\.logs\)/)
    expect(finish).toMatch(/from\('workout_set_media'\)[\s\S]{0,400}workout_id: String\(saved\.id\)/)
    expect(finish).toMatch(/waitUntil\(analyzeSetMediaForWorkout\(/)
    expect(finish).toMatch(/export const maxDuration = \d+/)
  })
  it('os dois renderers com observações oferecem o anexo — e a fonte é UM componente', () => {
    for (const f of ['src/components/workout/set-renderers/normalSet.tsx', 'src/components/workout/set-renderers/AdvancedSetRow.tsx']) {
      expect(readFileSync(f, 'utf8')).toMatch(/<SetMediaAttach[\s\S]{0,300}updateLog=\{updateLog\}/)
    }
  })
  it('a tela do relatório e o PDF recebem a MESMA lista', () => {
    const report = readFileSync('src/components/WorkoutReport.tsx', 'utf8')
    expect(report).toMatch(/setMedia: setMedia\.items/)
    expect(report).toMatch(/setMediaByKey=\{setMedia\.byKey\}/)
  })
  it('a notificação tem destino e rótulo na central', () => {
    const nc = readFileSync('src/components/NotificationCenter.tsx', 'utf8')
    expect(nc.match(/set_media_analyzed/g)?.length).toBe(2)
  })
})
