/**
 * Tests for src/components/workout/helpers/deloadHelpers.ts
 * Covers: analyzeDeloadHistory, estimate1RmFromSets, parseAiRecommendation, getDeloadReason
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeDeloadHistory,
  estimate1RmFromSets,
  parseAiRecommendation,
  getDeloadReason,
} from '../helpers/deloadHelpers';
import type { ReportHistoryItem } from '../types';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeItem = (totalVolume: number, avgWeight: number, ts = Date.now()): ReportHistoryItem => ({
  ts,
  avgWeight,
  avgReps: 10,
  totalVolume,
  topWeight: avgWeight,
  setsCount: 3,
  setWeights: [],
  setReps: [],
  setRpes: [],
});

// ─── analyzeDeloadHistory ─────────────────────────────────────────────────────

describe('analyzeDeloadHistory', () => {
  it('returns stagnation when recent exactly matches older (delta = 0, within ±2% threshold)', () => {
    // delta=0 is within DELOAD_STAGNATION_PCT (±2%), so it flags as stagnation
    const items = [
      makeItem(3000, 100),
      makeItem(3000, 100),
      makeItem(3000, 100),
      makeItem(3000, 100),
    ];
    const result = analyzeDeloadHistory(items);
    expect(result.status).toBe('stagnation');
    expect(result.volumeDelta).toBe(0);
  });

  it('returns stable when recent is meaningfully higher than older', () => {
    const items = [
      makeItem(2000, 80),
      makeItem(2000, 80),
      makeItem(2000, 80),
      makeItem(2500, 100), // recent: +25% volume, +25% weight
      makeItem(2500, 100),
      makeItem(2500, 100),
    ];
    const result = analyzeDeloadHistory(items);
    expect(result.status).toBe('stable');
    expect(result.volumeDelta).toBeGreaterThan(0.02); // above stagnation threshold
  });

  it('detects overtraining on significant volume regression', () => {
    const items = [
      makeItem(3000, 100), // older
      makeItem(3000, 100), // older
      makeItem(3000, 100), // older
      makeItem(1500, 70),  // recent - big drop
      makeItem(1500, 70),  // recent
      makeItem(1500, 70),  // recent
    ];
    const result = analyzeDeloadHistory(items);
    expect(result.status).toBe('overtraining');
    expect(result.volumeDelta).toBeLessThan(-0.03);
  });

  it('detects stagnation when delta is near zero', () => {
    // recent slightly lower than older but within stagnation threshold (±2%)
    const items = [
      makeItem(3000, 100),
      makeItem(3000, 100),
      makeItem(3000, 100),
      makeItem(3010, 100), // near identical
      makeItem(3010, 100),
      makeItem(3010, 100),
    ];
    const result = analyzeDeloadHistory(items);
    // volumeDelta ≈ 0.003 — within stagnation threshold
    expect(result.status).toBe('stagnation');
  });

  it('returns stable with null deltas when only 1 item (no older vs recent comparison)', () => {
    const items = [makeItem(3000, 100)];
    const result = analyzeDeloadHistory(items);
    // only recent items, no older — deltas are null → status falls through to stable
    expect(result.status).toBe('stable');
    expect(result.volumeDelta).toBeNull();
    expect(result.weightDelta).toBeNull();
  });

  it('returns stable for empty array', () => {
    const result = analyzeDeloadHistory([]);
    expect(result.status).toBe('stable');
    expect(result.volumeDelta).toBeNull();
  });

  it('handles non-array gracefully', () => {
    // @ts-expect-error — intentional invalid input
    const result = analyzeDeloadHistory(null);
    expect(result.status).toBe('stable');
  });

  it('ignores items with zero/invalid volume', () => {
    const items = [
      makeItem(0, 0),
      makeItem(0, 0),
      makeItem(0, 0),
      makeItem(3000, 100),
    ];
    const result = analyzeDeloadHistory(items);
    // zeros are filtered — only valid data counted
    expect(result).toBeDefined();
  });

  it('uses only last DELOAD_HISTORY_SIZE=6 items', () => {
    // 10 items — only last 6 should be considered
    const olderItems = Array.from({ length: 7 }, () => makeItem(5000, 200));
    const recentItems = Array.from({ length: 3 }, () => makeItem(1000, 50));
    const result = analyzeDeloadHistory([...olderItems, ...recentItems]);
    // The 6-item window cuts off early large values; result should show regression
    expect(result.status).toBe('overtraining');
  });
});

// ─── estimate1RmFromSets ──────────────────────────────────────────────────────

describe('estimate1RmFromSets', () => {
  it('calculates from current sets', () => {
    const sets = [{ weight: 100, reps: 10 }];
    const result = estimate1RmFromSets(sets, []);
    expect(result).toBeCloseTo(133.33, 1);
  });

  it('takes max of multiple set estimates', () => {
    const sets = [
      { weight: 80, reps: 10 },   // est: ~106.67
      { weight: 100, reps: 5 },   // est: ~116.67
    ];
    const result = estimate1RmFromSets(sets, []);
    expect(result).toBeCloseTo(116.67, 1);
  });

  it('includes historical items in max calculation', () => {
    const sets = [{ weight: 80, reps: 10 }]; // ~106.67
    const historyItems: ReportHistoryItem[] = [makeItem(3000, 120)];
    historyItems[0].avgReps = 1;
    historyItems[0].topWeight = 150; // 150 × (1+1/30) ≈ 155
    const result = estimate1RmFromSets(sets, historyItems);
    expect(result).toBeGreaterThan(106.67);
  });

  it('returns null when no valid sets or history', () => {
    expect(estimate1RmFromSets([], [])).toBeNull();
  });

  it('returns null when sets have null weight/reps', () => {
    const sets = [{ weight: null, reps: null }];
    expect(estimate1RmFromSets(sets, [])).toBeNull();
  });

  it('handles non-array sets gracefully', () => {
    // @ts-expect-error — intentional
    expect(estimate1RmFromSets(null, [])).toBeNull();
  });

  it('ignores sets with zero reps', () => {
    const sets = [{ weight: 100, reps: 0 }];
    expect(estimate1RmFromSets(sets, [])).toBeNull();
  });
});

// ─── parseAiRecommendation ────────────────────────────────────────────────────

describe('parseAiRecommendation', () => {
  it('extracts weight, reps and RPE from text', () => {
    const result = parseAiRecommendation('Use 80kg, 10 reps at RPE 7');
    expect(result.weight).toBe(80);
    expect(result.reps).toBe(10);
    expect(result.rpe).toBe(7);
  });

  it('parses decimal weight with comma', () => {
    const result = parseAiRecommendation('77,5kg por 8 reps');
    expect(result.weight).toBe(77.5);
  });

  it('returns nulls for empty string', () => {
    const result = parseAiRecommendation('');
    expect(result.weight).toBeNull();
    expect(result.reps).toBeNull();
    expect(result.rpe).toBeNull();
  });

  it('returns nulls when no patterns match', () => {
    const result = parseAiRecommendation('Faça agachamentos hoje');
    expect(result.weight).toBeNull();
    expect(result.reps).toBeNull();
    expect(result.rpe).toBeNull();
  });

  it('handles null input gracefully', () => {
    const result = parseAiRecommendation(null);
    expect(result.weight).toBeNull();
  });

  it('extracts partial matches (weight only)', () => {
    const result = parseAiRecommendation('Tente 90kg nessa série');
    expect(result.weight).toBe(90);
    expect(result.reps).toBeNull();
  });

  it('is case-insensitive for kg and reps', () => {
    const result = parseAiRecommendation('100KG, 12 REPS, RPE 8');
    expect(result.weight).toBe(100);
    expect(result.reps).toBe(12);
    expect(result.rpe).toBe(8);
  });
});

// ─── getDeloadReason ─────────────────────────────────────────────────────────

describe('getDeloadReason', () => {
  it('mentions regressão for overtraining', () => {
    const result = getDeloadReason({ status: 'overtraining', volumeDelta: -0.1, weightDelta: null }, 0.22, 6);
    expect(result).toContain('regressão');
    expect(result).toContain('22%');
  });

  it('mentions estagnação for stagnation', () => {
    const result = getDeloadReason({ status: 'stagnation', volumeDelta: 0.01, weightDelta: null }, 0.15, 5);
    expect(result).toContain('estagnação');
  });

  it('mentions progressão estável for stable', () => {
    const result = getDeloadReason({ status: 'stable', volumeDelta: 0.05, weightDelta: null }, 0.12, 6);
    expect(result).toContain('progressão estável');
  });

  it('mentions histórico curto when count < 4', () => {
    const result = getDeloadReason({ status: 'stable', volumeDelta: null, weightDelta: null }, 0.12, 2);
    expect(result).toContain('histórico curto');
  });

  it('shows numeric count when count >= 4', () => {
    const result = getDeloadReason({ status: 'stable', volumeDelta: null, weightDelta: null }, 0.12, 5);
    expect(result).toContain('5 treinos');
  });
});
