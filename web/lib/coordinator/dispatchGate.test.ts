import { describe, it, expect } from 'vitest';
import { canDispatch, dispatchBlockedReason } from './dispatchGate';

describe('canDispatch', () => {
  it('allows dispatch when no manifest exists yet', () => {
    expect(canDispatch(undefined)).toBe(true);
    expect(dispatchBlockedReason(undefined)).toBeNull();
  });

  it('allows dispatch once the manifest is approved or coordinator-modified', () => {
    expect(canDispatch({ status: 'approved' })).toBe(true);
    expect(canDispatch({ status: 'modified' })).toBe(true);
  });

  it('blocks dispatch while the manifest is pending or rejected', () => {
    expect(canDispatch({ status: 'pending' })).toBe(false);
    expect(canDispatch({ status: 'rejected' })).toBe(false);
  });

  it('names the blocking state and the recovery action', () => {
    expect(dispatchBlockedReason({ status: 'pending' })).toMatch(/approve/i);
    expect(dispatchBlockedReason({ status: 'rejected' })).toMatch(/rejected/i);
  });
});
