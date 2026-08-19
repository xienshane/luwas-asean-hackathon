import { DEMO_PRESETS } from '@/lib/demo/presets';
import { parseFieldReportText } from '@/lib/ai/parse';
import { createAdminClient } from '@/lib/supabase/admin';
import { findBarangayByName, type DirectoryClient } from '@/lib/sms/barangay';
import { handleInboundSms, type SmsReportRow } from '@/lib/sms/handle';
import { normalizeSemaphorePayload, type SemaphoreInboundPayload } from '@/lib/sms/normalize';

// Demo-only: processes a preset SMS directly through the intake pipeline.
// No dependency on the mock endpoint or SMS_WEBHOOK_SECRET.
export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_DEMO_CONSOLE !== 'true') {
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const preset = DEMO_PRESETS.find((p) => p.id === body.preset);
  if (!preset) {
    return Response.json({ error: `unknown preset: ${body.preset}` }, { status: 400 });
  }

  const payload: SemaphoreInboundPayload = {
    message_id: Date.now(),
    number: '+639170000000',
    message: preset.message,
    recipient: 'LUWAS',
    received_at: new Date().toISOString(),
  };

  const inbound = normalizeSemaphorePayload(payload);
  if (!inbound) {
    return Response.json({ error: 'missing message body' }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await handleInboundSms(inbound, {
    parse: (text) => parseFieldReportText(text),
    // Cast: the real client satisfies DirectoryClient structurally, but checking it
    // against the builder chain trips TS2589 (excessively deep instantiation).
    findBarangay: (name) =>
      findBarangayByName(admin as unknown as DirectoryClient, name, preset.region),
    insertReport: async (row: SmsReportRow) => {
      const { data, error } = await admin
        .from('field_reports')
        .insert(row)
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
  });

  return Response.json({ ok: true, report_id: result.reportId, status: result.status });
}
