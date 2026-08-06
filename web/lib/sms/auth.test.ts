import { describe, expect, it } from 'vitest';
import { webhookTokenMatches } from './auth';

describe('webhookTokenMatches', () => {
  it('accepts the exact secret', () => {
    expect(webhookTokenMatches('s3cret', 's3cret')).toBe(true);
  });

  it('rejects a wrong token of the same length', () => {
    expect(webhookTokenMatches('s3crXt', 's3cret')).toBe(false);
  });

  it('rejects a token that only shares a prefix', () => {
    // The case a short-circuiting !== leaks through timing.
    expect(webhookTokenMatches('s3cre', 's3cret')).toBe(false);
    expect(webhookTokenMatches('s3cretand-more', 's3cret')).toBe(false);
  });

  it('rejects when the secret is unset — never fails open', () => {
    expect(webhookTokenMatches('anything', undefined)).toBe(false);
    expect(webhookTokenMatches('anything', '')).toBe(false);
    expect(webhookTokenMatches('', '')).toBe(false);
  });

  it('rejects a missing token', () => {
    expect(webhookTokenMatches(null, 's3cret')).toBe(false);
    expect(webhookTokenMatches(undefined, 's3cret')).toBe(false);
  });

  it('handles multi-byte characters without throwing', () => {
    expect(webhookTokenMatches('ñ-secret', 'ñ-secret')).toBe(true);
    expect(webhookTokenMatches('ñ-secret', 'n-secret')).toBe(false);
  });
});
