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
});
