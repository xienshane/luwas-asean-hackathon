import { describe, expect, it } from 'vitest';
import { classifyConnectivity } from './connectivity';

describe('classifyConnectivity', () => {
  it('is offline when the OS reports no network (probe/realtime ignored)', () => {
    expect(classifyConnectivity({ navigatorOnline: false, probeOk: true, realtimeHealthy: true })).toBe('offline');
  });

  it('is online when nominally online and the probe succeeds', () => {
    expect(classifyConnectivity({ navigatorOnline: true, probeOk: true, realtimeHealthy: null })).toBe('online');
  });

  it('is online before the first probe resolves (probeOk null) with no realtime signal', () => {
    expect(classifyConnectivity({ navigatorOnline: true, probeOk: null, realtimeHealthy: null })).toBe('online');
  });

  it('is intermittent when nominally online but the probe is failing', () => {
    expect(classifyConnectivity({ navigatorOnline: true, probeOk: false, realtimeHealthy: null })).toBe('intermittent');
  });

  it('is intermittent when the Realtime channel has dropped', () => {
    expect(classifyConnectivity({ navigatorOnline: true, probeOk: true, realtimeHealthy: false })).toBe('intermittent');
  });
});
