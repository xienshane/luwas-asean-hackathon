import { describe, it, expect } from 'vitest';
import { evaluatePreflight, type PreflightFacts } from './checks';

const green: PreflightFacts = {
  aiHealth: { status: 'ok', tabpfn_active: true, parse_providers: { sea_lion: true, gemini: true } },
  aiError: null,
  probe: { provider: 'sea-lion', latencyMs: 1800 },
  probeError: null,
  barangayCount: 1203, dbError: null,
  depotCount: 1, teamsWithCapacity: 4,
  smsMockEnabled: true, smsSecretSet: true, demoConsoleEnabled: true,
};

const state = (checks: ReturnType<typeof evaluatePreflight>, id: string) =>
  checks.find((c) => c.id === id)!;

describe('evaluatePreflight', () => {
  it('passes every check on a healthy stack', () => {
    expect(evaluatePreflight(green).every((c) => c.state === 'pass')).toBe(true);
  });

  it('fails TabPFN when the heuristic fallback is running', () => {
    const c = state(evaluatePreflight({ ...green, aiHealth: { ...green.aiHealth!, tabpfn_active: false } }), 'tabpfn');
    expect(c.state).toBe('fail');
    expect(c.detail).toMatch(/DISABLE_TABPFN/);
  });

  it('fails SEA-LION when the probe answered via the fallback', () => {
    const c = state(evaluatePreflight({ ...green, probe: { provider: 'gemini', latencyMs: 2400 } }), 'sea-lion');
    expect(c.state).toBe('fail');
    expect(c.detail).toMatch(/gemini/);
  });

  it('fails Gemini when the AI service has no fallback key', () => {
    const facts = { ...green, aiHealth: { ...green.aiHealth!, parse_providers: { sea_lion: true, gemini: false } } };
    expect(state(evaluatePreflight(facts), 'gemini').state).toBe('fail');
  });

  it('fails the depot check on zero or more than one depot', () => {
    expect(state(evaluatePreflight({ ...green, depotCount: 0 }), 'depot').state).toBe('fail');
    expect(state(evaluatePreflight({ ...green, depotCount: 2 }), 'depot').state).toBe('fail');
  });

  it('names which SMS setting is missing', () => {
    const c = state(evaluatePreflight({ ...green, smsSecretSet: false }), 'sms-mock');
    expect(c.state).toBe('fail');
    expect(c.detail).toMatch(/SMS_WEBHOOK_SECRET/);
  });

  it('reports an unreachable AI service without crashing on a null payload', () => {
    const facts = { ...green, aiHealth: null, aiError: 'fetch failed', probe: null, probeError: 'fetch failed' };
    const checks = evaluatePreflight(facts);
    expect(state(checks, 'ai-health').detail).toContain('fetch failed');
    expect(state(checks, 'tabpfn').state).toBe('fail');
    expect(state(checks, 'sea-lion').state).toBe('fail');
  });
});
