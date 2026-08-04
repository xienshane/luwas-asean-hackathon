import type { ParseRequest, ParseResponse, TranslateRequest, TranslateResponse } from '@/lib/types/parse';
import { postAiJson } from './fetchJson';

// SEA-LION primary, Gemini fallback — both live server-side in ai-services, including the
// 10-calls/min free-tier limiter.
export function parseFieldReportText(text: string, id?: string): Promise<ParseResponse> {
  const body: ParseRequest = { text, id: id ?? null };
  return postAiJson<ParseResponse>('/parse', body, 'parse service');
}

// English translation of a report; translated_text is null when the text is already English.
export function translateText(text: string, id?: string): Promise<TranslateResponse> {
  const body: TranslateRequest = { text, id: id ?? null };
  return postAiJson<TranslateResponse>('/translate', body, 'translate service');
}
