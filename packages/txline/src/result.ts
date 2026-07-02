export interface TxlineError {
  code:
    | 'http_error'
    | 'network_error'
    | 'parse_error'
    | 'auth_expired'
    | 'stream_ended'
    | 'bad_input';
  message: string;
  status?: number;
  cause?: unknown;
}

export type Result<T, E = TxlineError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function httpErr(status: number, message: string): Result<never, TxlineError> {
  const code = status === 401 ? 'auth_expired' : 'http_error';
  return err({ code, message, status });
}
