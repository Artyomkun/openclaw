export function normalizeOracleNumber(
  value: number | bigint | string
): number | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return isNaN(parsed) ? undefined : parsed;
  }
  if (typeof value === 'number') {
    return isNaN(value) ? undefined : value;
  }

  return undefined;
}

export function normalizeOracleNumberSafe(
  value: number | bigint | string,
  fallback: number = 0
): number {
  const normalized = normalizeOracleNumber(value);
  return normalized !== undefined ? normalized : fallback;
}

export function isOracleNumber(
  value: unknown
): value is number | bigint {
  return typeof value === 'number' || typeof value === 'bigint';
}

export function oracleNumberToNumber(
  value: unknown
): number | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value === 'number') {
    return isNaN(value) ? undefined : value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return isNaN(parsed) ? undefined : parsed;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  return undefined;
}

export function oracleDateToNumber(
  value: Date | string | number
): number | undefined {
  if (value == null) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  return undefined;
}

export function getOracleRowCount(
  result: { rowsAffected?: number; rows?: any[] }
): number {
  return result.rowsAffected ?? result.rows?.length ?? 0;
}