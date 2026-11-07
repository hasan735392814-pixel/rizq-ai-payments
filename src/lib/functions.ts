import { SUPABASE_ANON_KEY, SUPABASE_FUNCTIONS_URL, supabase } from '@/lib/supabase';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface CallOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  query?: Record<string, string>;
}

export async function callFunction<T>(path: string, options: CallOptions = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const bearer = data.session?.access_token ?? SUPABASE_ANON_KEY;
  const url = new URL(`${SUPABASE_FUNCTIONS_URL}${path}`);
  Object.entries(options.query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('Network error. Check your connection and try again.', 0);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `The request failed (${response.status}). Please try again.`;
    throw new ApiError(message, response.status);
  }
  if (!payload || typeof payload !== 'object') {
    throw new ApiError('The server returned an unexpected response.', response.status);
  }
  return payload as T;
}
