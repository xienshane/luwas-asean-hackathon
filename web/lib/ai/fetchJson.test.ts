import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postAiJson } from './fetchJson';

const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

beforeEach(() => {
  process.env.AI_SERVICE_URL = 'http://ai.test';
  process.env.AI_RETRY_DELAY_MS = '0'; // keep the suite fast; production uses 500ms
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_RETRY_DELAY_MS;
  delete process.env.AI_TIMEOUT_MS;
});

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

  // The 20s budget covers the whole call. Scaled down 100x here so the suite does not
  // wait out a real one; the arithmetic is identical.
  it('does not retry a late 5xx that would spend more than the total budget', async () => {
    process.env.AI_TIMEOUT_MS = '400';
    process.env.AI_RETRY_DELAY_MS = '5';
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(new Response('boom', { status: 500 })), 380)),
    );
    const startedAt = Date.now();
    await expect(postAiJson('/parse', {}, 'parse service')).rejects.toThrow('parse service responded 500');
    expect(fetchMock).toHaveBeenCalledTimes(1); // 20ms left — nowhere near enough to retry
    expect(Date.now() - startedAt).toBeLessThan(600); // not 380 + 5 + 380
  });

  it('still retries a 5xx that arrives with budget to spare', async () => {
    process.env.AI_TIMEOUT_MS = '4000';
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(ok());
    await expect(postAiJson('/parse', {}, 'parse service')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws when AI_SERVICE_URL is unset', async () => {
    delete process.env.AI_SERVICE_URL;
    await expect(postAiJson('/parse', {}, 'parse service')).rejects.toThrow('AI_SERVICE_URL');
  });
});
