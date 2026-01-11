export function parseTrainingNumber(value) {
  try {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (value === null || value === undefined) {
      return null;
    }

    const str = String(value).trim();
    if (!str) {
      return null;
    }

    const normalized = str.replace(',', '.');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

export function parseTrainingNumberOrZero(value) {
  const n = parseTrainingNumber(value);
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

