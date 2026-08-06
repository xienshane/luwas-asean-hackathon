import { parseFieldReportText } from '@/lib/ai/parse';
import { createAdminClient } from '@/lib/supabase/admin';
import { findBarangayByName } from '@/lib/sms/barangay';
import { webhookTokenMatches } from '@/lib/sms/auth';
import { handleInboundSms, type SmsReportRow } from '@/lib/sms/handle';
import { normalizeSemaphorePayload } from '@/lib/sms/normalize';

// Semaphore inbound-SMS webhook (simulated for the demo — real shortcode
// provisioning is post-hackathon). Semaphore doesn't sign requests, so the
// URL carries a shared secret: POST /api/sms?token=$SMS_WEBHOOK_SECRET
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!webhookTokenMatches(token, process.env.SMS_WEBHOOK_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Semaphore-style callbacks may arrive JSON or form-encoded; accept both.
  const contentType = request.headers.get('content-type') ?? '';
  let raw: unknown;
  try {
    raw = contentType.includes('application/json')
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
  } catch {
    return Response.json({ error: 'unreadable payload' }, { status: 400 });
  }

  const inbound = normalizeSemaphorePayload(raw);
  if (!inbound) {
    return Response.json({ error: 'missing message body' }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await handleInboundSms(inbound, {
    parse: (text) => parseFieldReportText(text),
    findBarangay: (name) => findBarangayByName(admin, name),
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
