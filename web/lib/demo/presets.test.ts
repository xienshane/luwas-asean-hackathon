import { describe, expect, it } from 'vitest';
import { DEMO_PRESETS } from './presets';

// These strings are duplicated byte-for-byte in ai-services/tests/test_parse_presets.py.
// Pinning them here means an accidental edit on the web side fails a test rather than
// silently drifting from the parser acceptance suite.
describe('DEMO_PRESETS', () => {
  it('carries the Bisaya and Vietnamese intake presets', () => {
    expect(DEMO_PRESETS.map((p) => p.id)).toEqual([
      'bisaya-guadalupe',
      'vietnamese-hoa-thuan-dong',
    ]);
  });

  it('pins the Bisaya message verbatim', () => {
    expect(DEMO_PRESETS[0].message).toBe(
      'LUWAS: grabe ang baha sa Guadalupe, mga 80 ka pamilya ang apektado',
    );
  });

  it('pins the Vietnamese message verbatim', () => {
    expect(DEMO_PRESETS[1].message).toBe(
      'LUWAS: Ngập lụt nặng ở phường Hòa Thuận Đông, Đà Nẵng. Khoảng 80 hộ dân bị cô lập, cần nước sạch.',
    );
  });

  it('keeps every message inside a single SMS-shaped body', () => {
    for (const preset of DEMO_PRESETS) {
      expect(preset.message.startsWith('LUWAS')).toBe(true);
      expect(preset.message.length).toBeLessThanOrEqual(160);
    }
  });
});
