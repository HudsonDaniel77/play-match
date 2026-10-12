import { ApiError } from '../../client/types.js';

export class FeatureNotAvailableError extends ApiError {
  constructor(featureName: string) {
    super(
      `The feature "${featureName}" is not yet available on the backend.`,
      'FEATURE_NOT_AVAILABLE',
      501,
    );
    this.name = 'FeatureNotAvailableError';
    Object.setPrototypeOf(this, FeatureNotAvailableError.prototype);
  }
}

export interface MockAdapterOptions {
  simulatedLatencyMs?: number;
}
