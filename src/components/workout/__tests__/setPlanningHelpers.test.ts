/**
 * Tests for src/components/workout/helpers/setPlanningHelpers.ts
 * Covers: normalizeNaturalNote, inferDropSetStagesFromNote,
 *         shouldInjectDropSetForSet, getPlanConfig, getPlannedSet,
 *         collectExerciseSetInputs, collectExercisePlannedInputs
 */

import { describe, it, expect, vi } from 'vitest';
import {
  normalizeNaturalNote,
  inferDropSetStagesFromNote,
  shouldInjectDropSetForSet,
  getPlanConfig,
  getPlannedSet,
  collectExerciseSetInputs,
  collectExercisePlannedInputs,
} from '../helpers/setPlanningHelpers';
import type { WorkoutExercise } from '../types';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeEx = (overrides: Partial<WorkoutExercise> = {}): WorkoutExercise => ({
  name: 'Agachamento',
  sets: '4',
  reps: '10',
  ...overrides,
} as WorkoutExercise);

const makeExWithDetails = (details: unknown[]): WorkoutExercise =>
  makeEx({ sets: String(details.length), setDetails: details as WorkoutExercise['setDetails'] });

// ─── normalizeNaturalNote ─────────────────────────────────────────────────────

describe('normalizeNaturalNote', () => {
  it('lowercases and trims', () => {
    expect(normalizeNaturalNote('  BENCH PRESS  ')).toBe('bench press');
  });

  it('removes accents', () => {
    expect(normalizeNaturalNote('Última série com drop')).toBe('ultima serie com drop');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeNaturalNote('a   b   c')).toBe('a b c');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeNaturalNote(null)).toBe('');
    expect(normalizeNaturalNote(undefined)).toBe('');
  });
});

// ─── inferDropSetStagesFromNote ───────────────────────────────────────────────

describe('inferDropSetStagesFromNote', () => {
  it('returns 0 when no drop mention', () => {
    expect(inferDropSetStagesFromNote('série normal')).toBe(0);
  });

  it('returns 2 for basic drop mention', () => {
    expect(inferDropSetStagesFromNote('com drop')).toBe(2);
  });

  it('returns 3 for drop duplo', () => {
    expect(inferDropSetStagesFromNote('drop duplo')).toBe(3);
  });

  it('returns 3 for dupla', () => {
    expect(inferDropSetStagesFromNote('drop dupla')).toBe(3);
  });

  it('returns 3 for 2 drops', () => {
    expect(inferDropSetStagesFromNote('2 drops')).toBe(3);
  });

  it('returns 4 for drop triplo', () => {
    expect(inferDropSetStagesFromNote('drop triplo')).toBe(4);
  });

  it('returns 4 for 3 drops', () => {
    expect(inferDropSetStagesFromNote('3 drops')).toBe(4);
  });

  it('handles accented input correctly (última série drop duplo)', () => {
    expect(inferDropSetStagesFromNote('Última série drop duplo')).toBe(3);
  });

  it('returns 0 for empty string', () => {
    expect(inferDropSetStagesFromNote('')).toBe(0);
  });
});

// ─── shouldInjectDropSetForSet ────────────────────────────────────────────────

describe('shouldInjectDropSetForSet', () => {
  it('returns 0 when notes have no drop mention', () => {
    const ex = makeEx({ notes: 'Foco na descida controlada' });
    expect(shouldInjectDropSetForSet(ex, 0, 4)).toBe(0);
  });

  it('returns stages for "em todas" pattern on any set', () => {
    const ex = makeEx({ notes: 'drop em todas as series' });
    expect(shouldInjectDropSetForSet(ex, 0, 4)).toBe(2);
    expect(shouldInjectDropSetForSet(ex, 2, 4)).toBe(2);
  });

  it('returns stages only for last set on "ultima" pattern', () => {
    const ex = makeEx({ notes: 'drop na ultima' });
    expect(shouldInjectDropSetForSet(ex, 0, 4)).toBe(0);
    expect(shouldInjectDropSetForSet(ex, 3, 4)).toBe(2); // last set (idx 3 of 4)
  });

  it('returns 0 for drop mention without ultima/em todas', () => {
    const ex = makeEx({ notes: 'com drop' });
    expect(shouldInjectDropSetForSet(ex, 0, 4)).toBe(0);
  });

  it('returns 0 when notes is empty', () => {
    const ex = makeEx({ notes: '' });
    expect(shouldInjectDropSetForSet(ex, 3, 4)).toBe(0);
  });

  it('uses triple drop stages when specified with "ultima"', () => {
    const ex = makeEx({ notes: 'drop triplo na ultima' });
    expect(shouldInjectDropSetForSet(ex, 3, 4)).toBe(4);
  });
});

// ─── getPlanConfig ────────────────────────────────────────────────────────────

describe('getPlanConfig', () => {
  it('returns null when no setDetails', () => {
    const ex = makeEx();
    expect(getPlanConfig(ex, 0)).toBeNull();
  });

  it('returns null when setDetail has no advanced_config', () => {
    const ex = makeExWithDetails([{ reps: 10 }]);
    expect(getPlanConfig(ex, 0)).toBeNull();
  });

  it('returns advanced_config object when present', () => {
    const cfg = { cluster_size: 3 };
    const ex = makeExWithDetails([{ advanced_config: cfg }]);
    expect(getPlanConfig(ex, 0)).toEqual(cfg);
  });

  it('falls back to advancedConfig (camelCase)', () => {
    const cfg = { cluster_size: 3 };
    const ex = makeExWithDetails([{ advancedConfig: cfg }]);
    expect(getPlanConfig(ex, 0)).toEqual(cfg);
  });

  it('returns null when setIdx is out of bounds', () => {
    const ex = makeExWithDetails([{ advanced_config: { x: 1 } }]);
    expect(getPlanConfig(ex, 5)).toBeNull();
  });
});

// ─── getPlannedSet ────────────────────────────────────────────────────────────

describe('getPlannedSet', () => {
  it('returns null when no setDetails and no drop note', () => {
    const ex = makeEx();
    expect(getPlannedSet(ex, 0)).toBeNull();
  });

  it('returns setDetail when present', () => {
    const sd = { reps: 10, weight: 80 };
    const ex = makeExWithDetails([sd]);
    expect(getPlannedSet(ex, 0)).toMatchObject(sd);
  });

  it('injects synthetic drop config when note says "drop na ultima" and setIdx is last', () => {
    const ex = makeEx({ notes: 'drop na ultima', sets: '3' });
    const planned = getPlannedSet(ex, 2); // last set of 3
    expect(planned).not.toBeNull();
    expect(Array.isArray(planned?.advanced_config)).toBe(true);
    expect((planned?.advanced_config as unknown[]).length).toBe(2); // 2 stages for basic drop
  });

  it('does NOT inject drop for non-last set with "ultima" note', () => {
    const ex = makeEx({ notes: 'drop na ultima', sets: '3' });
    expect(getPlannedSet(ex, 0)).toBeNull();
    expect(getPlannedSet(ex, 1)).toBeNull();
  });
});

// ─── collectExerciseSetInputs ─────────────────────────────────────────────────

describe('collectExerciseSetInputs', () => {
  it('collects logged weight and reps', () => {
    const ex = makeEx({ sets: '2' });
    const getLog = vi.fn((key: string) => {
      if (key === '0-0') return { weight: '80', reps: '10' };
      if (key === '0-1') return { weight: '75', reps: '8' };
      return {};
    });
    const { setsCount, sets } = collectExerciseSetInputs(ex, 0, getLog);
    expect(setsCount).toBe(2);
    expect(sets).toHaveLength(2);
    expect(sets[0]).toEqual({ weight: 80, reps: 10 });
    expect(sets[1]).toEqual({ weight: 75, reps: 8 });
  });

  it('falls back to planned reps when log has none', () => {
    const ex = makeEx({ sets: '1', reps: '12' });
    const getLog = vi.fn(() => ({ weight: '80' }));
    const { sets } = collectExerciseSetInputs(ex, 0, getLog);
    expect(sets[0].reps).toBe(12);
  });

  it('falls back to exercise reps when log and planned are empty', () => {
    // makeEx sets reps: '10' by default — so sets always get reps from ex.reps fallback
    const ex = makeEx({ sets: '2' });
    const getLog = vi.fn(() => ({}));
    const { setsCount, sets } = collectExerciseSetInputs(ex, 0, getLog);
    expect(setsCount).toBe(2);
    // reps fallback to ex.reps=10, weight=null → toNumber returns 0 from '0'? Actually null
    // The exercise has no weight and log has nothing, but reps=10 from ex.reps
    expect(sets).toHaveLength(2);
    sets.forEach(s => expect(s.reps).toBe(10));
  });

  it('includes sets as weight=0/reps=0 when exercise and log have no values (toNumber(null)=0)', () => {
    // Note: toNumber(null) returns 0 (not null), so sets are included with 0 values
    const ex = { name: 'Test', sets: '2' } as unknown as WorkoutExercise;
    const getLog = vi.fn(() => ({}));
    const { sets } = collectExerciseSetInputs(ex, 0, getLog);
    // 0 is still a valid number — sets are included with weight=0, reps=0
    expect(sets).toHaveLength(2);
    sets.forEach(s => {
      expect(s.weight).toBe(0);
      expect(s.reps).toBe(0);
    });
  });

  it('uses setDetails count over sets header', () => {
    const ex = makeExWithDetails([
      { reps: 10 },
      { reps: 10 },
      { reps: 10 },
    ]);
    const getLog = vi.fn((key: string) => ({ weight: '80', reps: key === '0-2' ? '6' : '10' }));
    const { setsCount } = collectExerciseSetInputs(ex, 0, getLog);
    expect(setsCount).toBe(3);
  });
});

// ─── collectExercisePlannedInputs ─────────────────────────────────────────────

describe('collectExercisePlannedInputs', () => {
  it('collects planned weight and reps from exercise defaults', () => {
    const ex = makeEx({ sets: '3', weight: '100', reps: '8' } as unknown as WorkoutExercise);
    const { setsCount, sets } = collectExercisePlannedInputs(ex, 0);
    expect(setsCount).toBe(3);
    expect(sets).toHaveLength(3);
    expect(sets[0]).toEqual({ weight: 100, reps: 8 });
  });

  it('includes sets with only reps (no weight) from exercise default', () => {
    // makeEx has reps='10' by default — reps alone is enough to include the set
    const ex = makeEx({ sets: '2' });
    const { sets } = collectExercisePlannedInputs(ex, 0);
    expect(sets).toHaveLength(2);
    sets.forEach(s => expect(s.reps).toBe(10));
  });

  it('includes sets with weight=0/reps=0 when nothing is planned (toNumber(null)=0)', () => {
    // toNumber(null) returns 0 — so even empty exercises generate sets with 0 values
    const ex = { name: 'Test', sets: '2' } as unknown as WorkoutExercise;
    const { sets } = collectExercisePlannedInputs(ex, 0);
    expect(sets).toHaveLength(2);
    sets.forEach(s => expect(s.weight).toBe(0));
  });

  it('reads per-set planned data from setDetails', () => {
    const ex = makeExWithDetails([
      { weight: 80, reps: 10 },
      { weight: 85, reps: 8 },
    ]);
    const { sets } = collectExercisePlannedInputs(ex, 0);
    expect(sets[0]).toMatchObject({ weight: 80, reps: 10 });
    expect(sets[1]).toMatchObject({ weight: 85, reps: 8 });
  });
});
