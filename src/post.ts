import { PostError } from './errors';

function throwIfNot200(res: Response, text: string): void {
  if (res.status !== 200) {
    if (res.status === 500) {
      throw new PostError('internal');
    }

    const contentType = res.headers.get('Content-Type') ?? '';
    if (contentType.toLowerCase().includes('application/json')) {
      try {
        const json = JSON.parse(text);
        throw new PostError(json.reason);
      } catch (e) {
        if (e instanceof PostError) throw e;
      }
    }

    if (res.headers.has('ngrok-error-code')) {
      throw new PostError('network-failure');
    }

    throw new PostError(text);
  }
}

export async function post(
  url: string,
  data: unknown,
  headers: Record<string, string> = {},
  timeout: number | null = null,
): Promise<unknown> {
  let text: string;
  let res: Response;

  try {
    const controller = new AbortController();
    const timeoutId = timeout
      ? setTimeout(() => controller.abort(), timeout)
      : null;
    res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(data),
      signal: timeout ? controller.signal : undefined,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
    if (timeoutId != null) clearTimeout(timeoutId);
    text = await res.text();
  } catch {
    throw new PostError('network-failure');
  }

  throwIfNot200(res, text);

  let responseData: { status: string; data?: unknown; description?: string; reason?: string };
  try {
    responseData = JSON.parse(text);
  } catch {
    throw new PostError('parse-json', { meta: text });
  }

  if (responseData.status !== 'ok') {
    console.warn('API call failed: ' + url + '\nResponse: ' + JSON.stringify(responseData));
    throw new PostError(responseData.description ?? responseData.reason ?? 'unknown');
  }

  return responseData.data;
}

export async function postBinary(
  url: string,
  data: Uint8Array,
  headers: Record<string, string> = {},
): Promise<Uint8Array> {
  let res: Response;

  try {
    res = await fetch(url, {
      method: 'POST',
      body: data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength,
      ) as ArrayBuffer,
      headers: {
        'Content-Length': String(data.byteLength),
        'Content-Type': 'application/actual-sync',
        ...headers,
      },
    });
  } catch {
    throw new PostError('network-failure');
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);
  const text = new TextDecoder().decode(buffer);
  throwIfNot200(res, text);

  return buffer;
}

export function get(url: string, opts?: RequestInit): Promise<string> {
  return fetch(url, opts).then(res => res.text());
}
