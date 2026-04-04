/**
 * Tests for src/components/workout/utils.ts
 * Covers: toNumber, averageNumbers, clampNumber, roundToStep, toDateMs,
 *         buildPlannedBlocks, buildBlocksByCount, isClusterConfig, isRestPauseConfig,
 *         normalizeExerciseKey, extractLogWeight, estimate1Rm, formatElapsed
 */

import { describe, it, expect } from 'vitest';
import {
  toNumber,
  averageNumbers,
  clampNumber,
  roundToStep,
  toDateMs,
  buildPlannedBlocks,
  buildBlocksByCount,
  isClusterConfig,
  isRestPauseConfig,
  formatElapsed,
  normalizeExerciseKey,
  extractLogWeight,
  estimate1Rm,
} from '../utils';

// ─── toNumber ────────────────────────────────────────────────────────────────

describe('toNumber', () => {
  it('parses integer', () => {
    expect(toNumber(42)).toBe(42);
  });
  it('parses float string', () => {
    expect(toNumber('77.5')).toBe(77.5);
  });
  it('parses comma decimal', () => {
    expect(toNumber('77,5')).toBe(77.5);
  });
  it('extracts number from mixed string', () => {
    expect(toNumber('80kg')).toBe(80);
  });
  it('returns 0 for null (regex finds no digits, Number("") = 0)', () => {
    expect(toNumber(null)).toBe(0);
  });
  it('returns 0 for undefined', () => {
    expect(toNumber(undefined)).toBe(0);
  });
  it('returns 0 for empty string', () => {
    expect(toNumber('')).toBe(0);
  });
  it('returns 0 for non-numeric string (no digits)', () => {
    expect(toNumber('abc')).toBe(0);
  });
  it('parses negative number', () => {
    expect(toNumber('-5')).toBe(-5);
  });
  it('returns 0 for "0"', () => {
    expect(toNumber('0')).toBe(0);
  });
});

// ─── averageNumbers ──────────────────────────────────────────────────────────

describe('averageNumbers', () => {
  it('averages a list of numbers', () => {
    expect(averageNumbers([10, 20, 30])).toBe(20);
  });
  it('returns null for empty array', () => {
    expect(averageNumbers([])).toBeNull();
  });
  it('returns null for non-array', () => {
    expect(averageNumbers(null)).toBeNull();
  });
  it('filters non-finite values', () => {
    expect(averageNumbers([10, 'abc', 20])).toBe(15);
  });
  it('handles single value', () => {
    expect(averageNumbers([42])).toBe(42);
  });
});

// ─── clampNumber ─────────────────────────────────────────────────────────────

describe('clampNumber', () => {
  it('clamps value below min', () => {
    expect(clampNumber(-5, 0, 100)).toBe(0);
  });
  it('clamps value above max', () => {
    expect(clampNumber(200, 0, 100)).toBe(100);
  });
  it('returns value within range', () => {
    expect(clampNumber(50, 0, 100)).toBe(50);
  });
  it('returns min for non-finite', () => {
    expect(clampNumber('abc', 0, 100)).toBe(0);
  });
  it('returns min for NaN', () => {
    expect(clampNumber(NaN, 5, 10)).toBe(5);
  });
});

// ─── roundToStep ─────────────────────────────────────────────────────────────

describe('roundToStep', () => {
  it('rounds to step of 2.5', () => {
    expect(roundToStep(81, 2.5)).toBe(80);
  });
  it('rounds up correctly', () => {
    expect(roundToStep(82, 2.5)).toBe(82.5);
  });
  it('returns value for step <= 0', () => {
    expect(roundToStep(42, 0)).toBe(42);
  });
  it('returns value for non-finite step', () => {
    expect(roundToStep(42, 'abc')).toBe(42);
  });
});

// ─── toDateMs ────────────────────────────────────────────────────────────────

describe('toDateMs', () => {
  it('parses ISO string', () => {
    expect(toDateMs('2025-01-15T12:00:00Z')).toBe(new Date('2025-01-15T12:00:00Z').getTime());
  });
  it('parses timestamp number', () => {
    expect(toDateMs(1705312800000)).toBe(1705312800000);
  });
  it('returns 0 for null (falls to new Date(0) → epoch)', () => {
    expect(toDateMs(null)).toBe(0);
  });
  it('returns null for invalid date string', () => {
    expect(toDateMs('not-a-date')).toBeNull();
  });
});

// ─── buildPlannedBlocks ──────────────────────────────────────────────────────

describe('buildPlannedBlocks', () => {
  it('splits 12 reps into blocks of 4', () => {
    expect(buildPlannedBlocks(12, 4)).toEqual([4, 4, 4]);
  });
  it('handles remainder', () => {
    expect(buildPlannedBlocks(10, 3)).toEqual([3, 3, 3, 1]);
  });
  it('returns empty for zero total', () => {
    expect(buildPlannedBlocks(0, 4)).toEqual([]);
  });
  it('returns empty for zero cluster size', () => {
    expect(buildPlannedBlocks(10, 0)).toEqual([]);
  });
  it('returns empty for non-finite inputs', () => {
    expect(buildPlannedBlocks('abc', 4)).toEqual([]);
  });
});

// ─── buildBlocksByCount ──────────────────────────────────────────────────────

describe('buildBlocksByCount', () => {
  it('splits 10 reps into 3 blocks', () => {
    // 10/3 = 3 base, 1 remainder → [4, 3, 3]
    expect(buildBlocksByCount(10, 3)).toEqual([4, 3, 3]);
  });
  it('splits evenly', () => {
    expect(buildBlocksByCount(12, 4)).toEqual([3, 3, 3, 3]);
  });
  it('returns empty for zero total', () => {
    expect(buildBlocksByCount(0, 3)).toEqual([]);
  });
  it('returns empty for zero blocks', () => {
    expect(buildBlocksByCount(10, 0)).toEqual([]);
  });
});

// ─── isClusterConfig ─────────────────────────────────────────────────────────

describe('isClusterConfig', () => {
  it('returns true with cluster_size + intra_rest_sec', () => {
    expect(isClusterConfig({ cluster_size: 3, intra_rest_sec: 15 })).toBe(true);
  });
  it('returns true with cluster_size + total_reps', () => {
    expect(isClusterConfig({ cluster_size: 3, total_reps: 12 })).toBe(true);
  });
  it('returns false for empty object', () => {
    expect(isClusterConfig({})).toBe(false);
  });
  it('returns false for non-object', () => {
    expect(isClusterConfig(null)).toBe(false);
  });
});

// ─── isRestPauseConfig ───────────────────────────────────────────────────────

describe('isRestPauseConfig', () => {
  it('returns true with mini_sets + rest_time_sec', () => {
    expect(isRestPauseConfig({ mini_sets: 3, rest_time_sec: 15 })).toBe(true);
  });
  it('returns true with mini_sets + initial_reps', () => {
    expect(isRestPauseConfig({ mini_sets: 3, initial_reps: 8 })).toBe(true);
  });
  it('returns false for empty object', () => {
    expect(isRestPauseConfig({})).toBe(false);
  });
  it('returns false for non-object', () => {
    expect(isRestPauseConfig(null)).toBe(false);
  });
});

// ─── formatElapsed ───────────────────────────────────────────────────────────

describe('formatElapsed', () => {
  it('formats 0 seconds', () => {
    expect(formatElapsed(0)).toBe('0:00');
  });
  it('formats 65 seconds as 1:05', () => {
    expect(formatElapsed(65)).toBe('1:05');
  });
  it('formats 3600 seconds as 60:00', () => {
    expect(formatElapsed(3600)).toBe('60:00');
  });
  it('handles string input', () => {
    expect(formatElapsed('125')).toBe('2:05');
  });
  it('handles null as 0:00', () => {
    expect(formatElapsed(null)).toBe('0:00');
  });
});

// ─── normalizeExerciseKey ─────────────────────────────────────────────────────

describe('normalizeExerciseKey', () => {
  it('lowercases and trims', () => {
    expect(normalizeExerciseKey('  Bench Press  ')).toBe('bench press');
  });

  it('handles accented characters as-is (trim+lower only)', () => {
    expect(normalizeExerciseKey('Agachamento Livre')).toBe('agachamento livre');
  });

  it('returns empty string for null', () => {
    expect(normalizeExerciseKey(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(normalizeExerciseKey(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(normalizeExerciseKey('')).toBe('');
  });

  it('handles number input', () => {
    expect(normalizeExerciseKey(42)).toBe('42');
  });

  it('preserves internal spaces', () => {
    expect(normalizeExerciseKey('Leg Press 45°')).toBe('leg press 45°');
  });
});

// ─── extractLogWeight ─────────────────────────────────────────────────────────

describe('extractLogWeight', () => {
  it('returns direct weight when present', () => {
    expect(extractLogWeight({ weight: 80 })).toBe(80);
  });

  it('returns direct weight from string', () => {
    expect(extractLogWeight({ weight: '75.5' })).toBe(75.5);
  });

  it('falls through to drop_set average when no direct weight', () => {
    const log = {
      drop_set: {
        stages: [
          { weight: 80 },
          { weight: 60 },
          { weight: 40 },
        ],
      },
    };
    expect(extractLogWeight(log)).toBe(60); // average of 80+60+40
  });

  it('falls through to cluster blocksDetailed when no direct weight or drop_set', () => {
    const log = {
      cluster: {
        blocksDetailed: [
          { weight: 100 },
          { weight: 100 },
        ],
      },
    };
    expect(extractLogWeight(log)).toBe(100);
  });

  it('falls through to rest_pause weight', () => {
    const log = {
      rest_pause: { weight: 90 },
    };
    expect(extractLogWeight(log)).toBe(90);
  });

  it('returns null when no weight anywhere', () => {
    expect(extractLogWeight({})).toBeNull();
  });

  it('returns null for null log', () => {
    expect(extractLogWeight(null)).toBeNull();
  });

  it('returns null for non-object', () => {
    expect(extractLogWeight('invalid')).toBeNull();
  });

  it('ignores zero/negative direct weight and falls through', () => {
    const log = {
      weight: 0,
      rest_pause: { weight: 50 },
    };
    expect(extractLogWeight(log)).toBe(50);
  });

  it('ignores empty drop_set stages array and falls through', () => {
    const log = {
      drop_set: { stages: [] },
      rest_pause: { weight: 55 },
    };
    expect(extractLogWeight(log)).toBe(55);
  });
});

// ─── estimate1Rm ──────────────────────────────────────────────────────────────

describe('estimate1Rm', () => {
  it('calculates Brzycki 1RM correctly', () => {
    // 100kg × (1 + 10/30) = 100 × 1.333... = 133.33...
    expect(estimate1Rm(100, 10)).toBeCloseTo(133.33, 1);
  });

  it('returns near-weight for 1 rep (formula still adds 1/30)', () => {
    // 80 × (1 + 1/30) = 80 × 1.0333 = 82.66...
    expect(estimate1Rm(80, 1)).toBeCloseTo(82.67, 1);
  });

  it('returns null for zero weight', () => {
    expect(estimate1Rm(0, 10)).toBeNull();
  });

  it('returns null for zero reps', () => {
    expect(estimate1Rm(100, 0)).toBeNull();
  });

  it('returns null for negative weight', () => {
    expect(estimate1Rm(-10, 5)).toBeNull();
  });

  it('returns null for negative reps', () => {
    expect(estimate1Rm(100, -1)).toBeNull();
  });

  it('returns null for null inputs', () => {
    expect(estimate1Rm(null, null)).toBeNull();
  });

  it('returns null for string non-numeric inputs', () => {
    expect(estimate1Rm('abc', 'xyz')).toBeNull();
  });

  it('parses numeric strings', () => {
    expect(estimate1Rm('100', '10')).toBeCloseTo(133.33, 1);
  });
});
