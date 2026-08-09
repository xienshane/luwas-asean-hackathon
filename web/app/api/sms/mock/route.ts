import { parseFieldReportText } from '@/lib/ai/parse';
import { createAdminClient } from '@/lib/supabase/admin';
import { findBarangayByName, type DirectoryClient } from '@/lib/sms/barangay';
import { webhookTokenMatches } from '@/lib/sms/auth';
import { handleInboundSms, type SmsReportRow } from '@/lib/sms/handle';
import { normalizeSemaphorePayload, type SemaphoreInboundPayload } from '@/lib/sms/normalize';
import { DEFAULT_REGION, isRegionId, type RegionId } from '@/lib/regions';

// Demo helper: wraps raw text in a Semaphore-shaped payload and runs the SAME
// pipeline as the real webhook. Simulates an inbound SMS without a shortcode:
//   curl -X POST "http://localhost:3000/api/sms/mock?token=$SMS_WEBHOOK_SECRET" \
//        -H 'Content-Type: application/json' \
//        -d '{"message":"LUWAS baha sa Guadalupe, mga 80 ka pamilya"}'
export async function POST(request: Request) {
  // Demo-only endpoint: 404 in production unless explicitly enabled. The real
  // inbound webhook is app/api/sms; this simulator must never run live.
  if (process.env.ENABLE_SMS_MOCK !== 'true') {
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  const token = new URL(request.url).searchParams.get('token');
  if (!webhookTokenMatches(token, process.env.SMS_WEBHOOK_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const payload: SemaphoreInboundPayload = {
    message_id: Date.now(),
    number: typeof body.number === 'string' ? body.number : '+639170000000',
    message: typeof body.message === 'string' ? body.message : '',
    recipient: 'LUWAS',
    received_at: new Date().toISOString(),
  };

  const inbound = normalizeSemaphorePayload(payload);
  if (!inbound) {
    return Response.json({ error: 'missing message body' }, { status: 400 });
  }

  // Which country pack to geocode against. A real shortcode implies its own region;
  // this simulator has to be told.
  const region: RegionId =
    typeof body.region === 'string' && isRegionId(body.region) ? body.region : DEFAULT_REGION;

  const admin = createAdminClient();
  const result = await handleInboundSms(inbound, {
    parse: (text) => parseFieldReportText(text),
    // Cast: the real client satisfies DirectoryClient structurally, but checking it
    // against the builder chain trips TS2589 (excessively deep instantiation).
    findBarangay: (name) =>
      findBarangayByName(admin as unknown as DirectoryClient, name, region),
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
