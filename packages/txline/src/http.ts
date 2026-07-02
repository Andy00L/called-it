import type { TxlineNetworkConfig } from './config.js';
import { err, httpErr, ok, type Result } from './result.js';

export interface AuthHeaders {
  jwt: string;
  apiToken?: string;
}

function buildHeaders(auth: AuthHeaders, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.jwt}`,
    ...extra,
  };
  if (auth.apiToken !== undefined) {
    headers['X-Api-Token'] = auth.apiToken;
  }
  return headers;
}

export async function apiGetJson<T>(
  cfg: TxlineNetworkConfig,
  path: string,
  auth: AuthHeaders,
): Promise<Result<T>> {
  const url = `${cfg.apiBaseUrl}${path}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: buildHeaders(auth) });
  } catch (cause) {
    return err({ code: 'network_error', message: `GET ${url} failed`, cause });
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return httpErr(response.status, `GET ${path} -> ${response.status}: ${body.slice(0, 300)}`);
  }
  try {
    return ok((await response.json()) as T);
  } catch (cause) {
    return err({ code: 'parse_error', message: `GET ${path}: invalid JSON`, cause });
  }
}

export async function apiPost(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<Result<string>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    return err({ code: 'network_error', message: `POST ${url} failed`, cause });
  }
  const text = await response.text().catch(() => '');
  if (!response.ok) {
    return httpErr(response.status, `POST ${url} -> ${response.status}: ${text.slice(0, 300)}`);
  }
  return ok(text);
}
