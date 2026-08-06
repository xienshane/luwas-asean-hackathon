import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time comparison of an inbound webhook token against the configured secret.
 *
 * `a !== b` short-circuits on the first differing byte, so response time leaks the
 * length and the matching prefix of the secret. Practically unexploitable across the
 * public internet, but the SMS webhook is the one unauthenticated entry point in the
 * system and `docs/PRIVACY.md` claims security discipline — so it compares in constant
 * time.
 *
 * Fails closed: an unset or empty secret rejects every request, exactly as before.
 * Length is compared first (it is not secret, and `timingSafeEqual` throws on unequal
 * buffer lengths); the digest step keeps the byte comparison itself constant-time.
 */
export function webhookTokenMatches(
  token: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!secret || !token) return false;

  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
