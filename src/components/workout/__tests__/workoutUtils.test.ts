/**
 * Tests for src/components/workout/utils.ts
 * Covers: normalizeExerciseKey, extractLogWeight, estimate1Rm
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeExerciseKey,
  extractLogWeight,
  estimate1Rm,
} from '../utils';

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

  it('returns weight itself for 1 rep', () => {
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
