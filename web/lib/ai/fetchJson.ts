// One caller for every ai-services endpoint. Each wrapper used to own its own fetch, so a
// single dropped socket failed the beat and the same ten lines existed four times.
//
// The 20s budget is for the CALL, not per attempt. A deadline is taken at entry and each
// attempt gets only what is left of it, so no failure shape can multiply the wait: a 5xx
// arriving at 19s used to cost 20 + 0.5 + 20 ≈ 40s on a beat budgeted at ≤8s.
//
// A TimeoutError is NOT retried: the budget is already gone and a second wait would blow
// the beat this retry exists to save. Retry covers the fast failures — a dropped
// connection, a 5xx from a Space still waking up.

// Env-tunable only so the test suite can exercise the budget without sleeping 20s.
const timeoutMs = () => Number(process.env.AI_TIMEOUT_MS ?? 20_000); // a warm Space answers in ~1-3s; pre-warm before a demo.
const retryDelayMs = () => Number(process.env.AI_RETRY_DELAY_MS ?? 500);

// A retry that cannot plausibly finish is strictly worse than failing fast into the log.
const MIN_RETRY_BUDGET_MS = 2_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function aiServiceBase(): string {
  const base = process.env.AI_SERVICE_URL;
  if (!base) throw new Error('AI_SERVICE_URL is not set');
  return base.replace(/\/$/, '');
}

export async function postAiJson<T>(path: string, body: unknown, label: string): Promise<T> {
  const url = `${aiServiceBase()}${path}`;
  const deadline = Date.now() + timeoutMs();
  const remaining = () => Math.max(0, deadline - Date.now());

  const send = () => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(remaining()),
  });

  // Room for the backoff plus an attempt with a usable window behind it.
  const canRetry = () => remaining() >= retryDelayMs() + MIN_RETRY_BUDGET_MS;

  // Exactly one retry across both failure shapes — a throw followed by a 5xx must not
  // become a third call.
  let res: Response;
  try {
    res = await send();
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') throw err;
    if (!canRetry()) throw err;
    await sleep(retryDelayMs());
    return finish<T>(await send(), label);
  }

  if (res.status >= 500 && canRetry()) {
    await sleep(retryDelayMs());
    res = await send();
  }
  return finish<T>(res, label);
}

async function finish<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) throw new Error(`${label} responded ${res.status}`);
  return (await res.json()) as T;
}
