import { describe, expect, it } from 'vitest';
import { homePathForRole, resolveDestination } from './roles';

describe('homePathForRole', () => {
  it('sends coordinators to the coordinator area', () => {
    expect(homePathForRole('coordinator')).toBe('/coordinator');
  });
  it('sends volunteers to the volunteer area', () => {
    expect(homePathForRole('volunteer')).toBe('/volunteer');
  });
  it('defaults a missing role to the least-privileged area', () => {
    expect(homePathForRole(null)).toBe('/volunteer');
  });
});

describe('resolveDestination', () => {
  it('routes a volunteer to /volunteer with no redirectedFrom', () => {
    expect(resolveDestination('volunteer', '')).toBe('/volunteer');
  });

  // The reported bug: a volunteer must never be routed into the coordinator area,
  // even if redirectedFrom asks for it (e.g. the proxy bounced them off /coordinator).
  it('never sends a volunteer to /coordinator via redirectedFrom', () => {
    expect(resolveDestination('volunteer', '/coordinator')).toBe('/volunteer');
  });

  it('honors a volunteer redirectedFrom inside the volunteer area', () => {
    expect(resolveDestination('volunteer', '/volunteer/health')).toBe('/volunteer/health');
  });

  it('routes a coordinator to /coordinator with no redirectedFrom', () => {
    expect(resolveDestination('coordinator', null)).toBe('/coordinator');
  });

  it('lets a coordinator follow redirectedFrom into either area', () => {
    expect(resolveDestination('coordinator', '/volunteer')).toBe('/volunteer');
    expect(resolveDestination('coordinator', '/coordinator')).toBe('/coordinator');
  });

  it('ignores open-redirect attempts and falls back to the role home', () => {
    expect(resolveDestination('volunteer', '//evil.com')).toBe('/volunteer');
    expect(resolveDestination('coordinator', 'https://evil.com')).toBe('/coordinator');
    expect(resolveDestination('volunteer', 'not-a-path')).toBe('/volunteer');
  });
});
