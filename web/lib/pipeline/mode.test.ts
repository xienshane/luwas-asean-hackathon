import { describe, expect, it } from 'vitest';
import { parsePipelineMode } from './mode';

describe('parsePipelineMode', () => {
  it('reads the reroute mode off the request body', () => {
    expect(parsePipelineMode({ mode: 'reroute' })).toBe('reroute');
  });
  it('defaults to full when no mode is sent', () => {
    expect(parsePipelineMode({ barangayId: 'b1' })).toBe('full');
  });
  it('defaults to full for an unrecognised mode', () => {
    expect(parsePipelineMode({ mode: 'teleport' })).toBe('full');
  });
  it('survives a missing or malformed body', () => {
    expect(parsePipelineMode(undefined)).toBe('full');
    expect(parsePipelineMode(null)).toBe('full');
    expect(parsePipelineMode('reroute')).toBe('full');
  });
});
