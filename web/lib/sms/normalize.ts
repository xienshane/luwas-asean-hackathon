// Inbound payload shape modeled on Semaphore's message object (semaphore.co/docs).
// Semaphore only documents the OUTBOUND API publicly; inbound webhook delivery is
// provisioned per shortcode (post-hackathon, per the DevPlan). Everything downstream
// consumes NormalizedInboundSms, so if the real payload differs only this file changes.
export interface SemaphoreInboundPayload {
  message_id?: number | string;
  /** Sender's mobile number (PII — not persisted; see handle.ts). */
  number?: string;
  /** SMS body. */
  message?: string;
  /** Our shortcode / keyword. */
  recipient?: string;
  sender_name?: string;
  received_at?: string;
}

export interface NormalizedInboundSms {
  message: string;
  sender: string | null;
  receivedAt: string | null;
}

export function normalizeSemaphorePayload(input: unknown): NormalizedInboundSms | null {
  if (typeof input !== 'object' || input === null) return null;
  const p = input as Record<string, unknown>;
  const message = typeof p.message === 'string' ? p.message.trim() : '';
  if (!message) return null;
  return {
    message,
    sender: typeof p.number === 'string' && p.number.trim() ? p.number.trim() : null,
    receivedAt:
      typeof p.received_at === 'string' && !Number.isNaN(Date.parse(p.received_at))
        ? p.received_at
        : null,
  };
}
