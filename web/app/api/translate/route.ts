import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { translateText } from '@/lib/ai/parse';
import { isLikelyEnglish } from '@/lib/i18n/detect';

// Lazily fills field_reports.translated_text for a report (used on coordinator
// confirm — app reports never hit /parse, so this is where their English
// translation is produced). Coordinator-gated; the persist uses the service-role
// client. Idempotent: returns the existing translation if present, and skips the
// (rate-limited) SEA-LION call when the text is already English.
export async function POST(request: Request) {
  const ssr = await createClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: isCoord } = await ssr.rpc('is_coordinator');
  if (!isCoord) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const reportId: unknown = body?.reportId;
  if (typeof reportId !== 'string' || !reportId) {
    return Response.json({ error: 'reportId required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: report } = await admin
    .from('field_reports')
    .select('raw_text, translated_text')
    .eq('id', reportId)
    .maybeSingle();
  if (!report) return Response.json({ error: 'not found' }, { status: 404 });

  // Already translated, empty, or already English -> nothing to do.
  if (report.translated_text) {
    return Response.json({ translated_text: report.translated_text });
  }
  if (!report.raw_text || isLikelyEnglish(report.raw_text)) {
    return Response.json({ translated_text: null });
  }

  let translated: string | null = null;
  try {
    translated = (await translateText(report.raw_text, reportId)).translated_text;
  } catch {
    // Service down — leave the original; the coordinator still sees raw_text.
    return Response.json({ translated_text: null, error: 'translate_unavailable' });
  }

  if (translated) {
    await admin.from('field_reports').update({ translated_text: translated }).eq('id', reportId);
  }
  return Response.json({ translated_text: translated });
}
