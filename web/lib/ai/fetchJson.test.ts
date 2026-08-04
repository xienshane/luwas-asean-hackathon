import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postAiJson } from './fetchJson';

const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

beforeEach(() => {
  process.env.AI_SERVICE_URL = 'http://ai.test';
  process.env.AI_RETRY_DELAY_MS = '0'; // keep the suite fast; production uses 500ms
});
afterEach(() => { vi.restoreAllMocks(); delete process.env.AI_RETRY_DELAY_MS; });

describe('postAiJson', () => {
  it('retries once after a dropped connection and succeeds', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(ok());
    await expect(postAiJson('/parse', { text: 'x' }, 'parse service')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries once on a 5xx and succeeds', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(ok());
    await expect(postAiJson('/parse', {}, 'parse service')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a timeout — the budget is already spent', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    const fetchMock = vi.spyOn(global, 'fetch').mockRejectedValue(timeout);
    // The name carries the timeout, not the message — assert on the name.
    await expect(postAiJson('/parse', {}, 'parse service')).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 4xx and names the endpoint', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValue(new Response('nope', { status: 422 }));
    await expect(postAiJson('/parse', {}, 'parse service')).rejects.toThrow('parse service responded 422');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after the single retry', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    await expect(postAiJson('/parse', {}, 'parse service')).rejects.toThrow('fetch failed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws when AI_SERVICE_URL is unset', async () => {
    delete process.env.AI_SERVICE_URL;
    await expect(postAiJson('/parse', {}, 'parse service')).rejects.toThrow('AI_SERVICE_URL');
  });
});
