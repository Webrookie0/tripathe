import { ApplicationFailure, TimeoutFailure } from '@temporalio/common';
import { HttpError } from './errors';

export function mapFailure(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  let current: unknown = error;
  // Temporal wraps application errors in workflow/activity failures.
  for (let depth = 0; current instanceof Error && depth < 15; depth++) {
    if (current instanceof ApplicationFailure && current.type === 'SUPPLIER_FAILURE') {
      return new HttpError(502, 'SUPPLIER_UNAVAILABLE', 'A supplier is unavailable or returned an invalid response');
    }
    if (current instanceof ApplicationFailure && current.type === 'REDIS_FAILURE') {
      return new HttpError(503, 'STORAGE_UNAVAILABLE', 'Hotel result storage is unavailable');
    }
    if (current instanceof TimeoutFailure) {
      return new HttpError(504, 'WORKFLOW_TIMEOUT', 'Hotel comparison exceeded its time limit');
    }
    if (('code' in current && typeof current.code === 'number') || current.name === 'ServiceError' || current.name === 'TransportError') {
      return new HttpError(503, 'ORCHESTRATOR_UNAVAILABLE', 'Hotel orchestration is unavailable');
    }
    if ('cause' in current) current = current.cause;
    else break;
  }
  return new HttpError(500, 'INTERNAL_ERROR', 'Unable to retrieve hotel offers');
}
