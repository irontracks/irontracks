import { describe, it, expect } from 'vitest'
import { showPrMetric } from '@/utils/report/prMetricVisibility'

describe('showPrMetric', () => {
  it('exibe quando o valor é real (>0)', () => {
    expect(showPrMetric(84, false)).toBe(true)
    expect(showPrMetric(20, undefined)).toBe(true)
  })

  it('exibe quando foi recorde batido, mesmo com valor 0', () => {
    expect(showPrMetric(0, true)).toBe(true)
  })

  it('oculta cardio/peso-corporal: valor 0 e não melhorou (fim do "0kg")', () => {
    expect(showPrMetric(0, false)).toBe(false)
    expect(showPrMetric(0, undefined)).toBe(false)
    expect(showPrMetric(null, false)).toBe(false)
    expect(showPrMetric(NaN, false)).toBe(false)
  })
})
