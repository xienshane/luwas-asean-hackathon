// One caller for every ai-services endpoint. Each wrapper used to own its own fetch, so a
// single dropped socket failed the beat and the same ten lines existed four times.
//
// A TimeoutError is NOT retried: the 20s budget is already gone and a second 20s wait would
// blow the beat this retry exists to save. Retry covers the fast failures — a dropped
// connection, a 5xx from a Space still waking up.

const TIMEOUT_MS = 20_000; // a warm Space answers in ~1-3s; pre-warm before a demo.

// Env-tunable only so the test suite does not sleep a full second per retry case.
const retryDelayMs = () => Number(process.env.AI_RETRY_DELAY_MS ?? 500);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function aiServiceBase(): string {
  const base = process.env.AI_SERVICE_URL;
  if (!base) throw new Error('AI_SERVICE_URL is not set');
  return base.replace(/\/$/, '');
}

export async function postAiJson<T>(path: string, body: unknown, label: string): Promise<T> {
  const url = `${aiServiceBase()}${path}`;
  const send = () => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // Exactly one retry across both failure shapes — a throw followed by a 5xx must not
  // become a third call.
  let res: Response;
  try {
    res = await send();
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') throw err;
    await sleep(retryDelayMs());
    return finish<T>(await send(), label);
  }

  if (res.status >= 500) {
    await sleep(retryDelayMs());
    res = await send();
  }
  return finish<T>(res, label);
}

async function finish<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) throw new Error(`${label} responded ${res.status}`);
  return (await res.json()) as T;
}
