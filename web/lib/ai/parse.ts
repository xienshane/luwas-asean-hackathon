import type {
  ParseRequest,
  ParseResponse,
  TranslateRequest,
  TranslateResponse,
} from '@/lib/types/parse';

// Thin wrapper for ai-services POST /parse (SEA-LION + Gemini fallback live
// server-side there, including the 10-calls/min rate limiter).
// 20s timeout: a warm HF Space answers in ~1–3s; pre-warm before demos —
// a cold start can exceed this, which surfaces as the flagged-fallback path.
export async function parseFieldReportText(text: string, id?: string): Promise<ParseResponse> {
  const base = process.env.AI_SERVICE_URL;
  if (!base) throw new Error('AI_SERVICE_URL is not set');

  const body: ParseRequest = { text, id: id ?? null };
  const res = await fetch(`${base.replace(/\/$/, '')}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`parse service responded ${res.status}`);
  }
  return (await res.json()) as ParseResponse;
}

// Thin wrapper for ai-services POST /translate (English translation of a report;
// returns translated_text=null when the service decides the text is already English).
export async function translateText(text: string, id?: string): Promise<TranslateResponse> {
  const base = process.env.AI_SERVICE_URL;
  if (!base) throw new Error('AI_SERVICE_URL is not set');

  const body: TranslateRequest = { text, id: id ?? null };
  const res = await fetch(`${base.replace(/\/$/, '')}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`translate service responded ${res.status}`);
  }
  return (await res.json()) as TranslateResponse;
}
