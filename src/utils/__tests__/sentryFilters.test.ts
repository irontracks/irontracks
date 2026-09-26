/**
 * Tests for src/utils/sentryFilters.ts
 * Covers: isNoiseByName, isNoiseException
 */
import { describe, it, expect } from 'vitest';
import { isNoiseByName, isNoiseException } from '../sentryFilters';

describe('isNoiseByName', () => {
  it('filters AbortError', () => {
    expect(isNoiseByName('AbortError')).toBe(true);
  });
  it('does not filter generic Error', () => {
    expect(isNoiseByName('Error')).toBe(false);
  });
  it('does not filter TypeError', () => {
    expect(isNoiseByName('TypeError')).toBe(false);
  });
  it('handles null', () => {
    expect(isNoiseByName(null)).toBe(false);
  });
  it('handles undefined', () => {
    expect(isNoiseByName(undefined)).toBe(false);
  });
});

describe('isNoiseException', () => {
  it('filters AbortError by type', () => {
    expect(isNoiseException('AbortError', 'some message')).toBe(true);
  });
  it('filters ResizeObserver loop by value', () => {
    expect(isNoiseException('Error', 'ResizeObserver loop completed with undelivered notifications.')).toBe(true);
  });
  it('filters ResizeObserver loop limit exceeded', () => {
    expect(isNoiseException(undefined, 'ResizeObserver loop limit exceeded')).toBe(true);
  });
  it('does not filter normal errors', () => {
    expect(isNoiseException('TypeError', 'Cannot read property of undefined')).toBe(false);
  });
  it('does not filter undefined type and value', () => {
    expect(isNoiseException(undefined, undefined)).toBe(false);
  });
  it('does not filter empty strings', () => {
    expect(isNoiseException('', '')).toBe(false);
  });
  // "Connection closed." — o RSC client do Next.js aborta assim quando um
  // stream é interrompido no meio (navegação, app perdendo foco). Visto no
  // Sentry em 26/09/2026, confirmado como ruído do framework (não bug do
  // app): os dois eventos eram bot de teste em preview e alguém saindo da
  // página em produção — decisão do dono de tratar como ruído.
  it('filters "Connection closed." (RSC stream interrompido)', () => {
    expect(isNoiseException('Error', 'Connection closed.')).toBe(true);
  });
  it('does not filter a message that merely mentions "connection" loosely', () => {
    expect(isNoiseException('Error', 'Connection refused by server')).toBe(false);
  });
});
