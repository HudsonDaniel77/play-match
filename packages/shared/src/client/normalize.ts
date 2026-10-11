/**
 * Recursively normalizes `_id` to `id` across objects and arrays.
 * If both exist, `id` is preferred.
 */
export type NormalizeIds<T> = T extends Array<infer U>
  ? Array<NormalizeIds<U>>
  : T extends (...args: any[]) => any
    ? T
    : T extends object
      ? {
          [K in keyof T as K extends '_id' ? never : K]: NormalizeIds<T[K]>;
        } & (T extends { _id: any; id?: never }
          ? { id: T['_id'] }
          : T extends { id: any }
            ? { id: T['id'] }
            : object)
      : T;

/**
 * Strips exact distance and internal auth/lockout fields from payloads at runtime.
 */
const FORBIDDEN_FIELDS = new Set([
  'exactDistanceMeters',
  'failedLoginAttempts',
  'lockUntil',
  'passwordHash',
]);

/**
 * Normalizes _id to id in one documented location and strips forbidden fields.
 */
export function normalizePayload<T>(payload: T): NormalizeIds<T> {
  if (payload === null || payload === undefined) {
    return payload as unknown as NormalizeIds<T>;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => normalizePayload(item)) as unknown as NormalizeIds<T>;
  }

  if (typeof payload === 'object') {
    const result: Record<string, any> = {};
    const obj = payload as Record<string, any>;

    // Handle ID normalization:
    // If id exists, keep id. If only _id exists, assign to id.
    const hasId = Object.prototype.hasOwnProperty.call(obj, 'id') && obj.id !== undefined;
    const hasUnderId = Object.prototype.hasOwnProperty.call(obj, '_id') && obj._id !== undefined;

    for (const [key, value] of Object.entries(obj)) {
      if (FORBIDDEN_FIELDS.has(key)) {
        continue; // Runtime stripping of forbidden/leaked fields
      }
      if (key === '_id') {
        continue; // Handled below
      }
      result[key] = normalizePayload(value);
    }

    if (hasId) {
      result.id = normalizePayload(obj.id);
    } else if (hasUnderId) {
      result.id = normalizePayload(obj._id);
    }

    return result as unknown as NormalizeIds<T>;
  }

  return payload as unknown as NormalizeIds<T>;
}
