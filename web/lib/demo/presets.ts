// Canonical demo SMS bodies, fired through the real /api/sms/mock endpoint by the
// demo console. Nothing on stage is typed.
//
// BYTE-LOCKED: ai-services/tests/test_parse_presets.py asserts the parser against these
// exact strings. Different language, different deploy target, no shareable file — so the
// two copies must change together, byte for byte.

export interface DemoPreset {
  id: string;
  /** Language shown on the console rail. */
  language: string;
  /** What the beat is meant to demonstrate — narration cue, not UI copy. */
  intent: string;
  message: string;
}

export const DEMO_PRESETS: readonly DemoPreset[] = [
  {
    id: 'bisaya-guadalupe',
    language: 'Bisaya',
    intent: 'Local-language intake: parses, geocodes to Cebu, lands as a pin.',
    message: 'LUWAS: grabe ang baha sa Guadalupe, mga 80 ka pamilya ang apektado',
  },
  {
    id: 'vietnamese-hoa-thuan-dong',
    language: 'Vietnamese',
    intent:
      'Cross-language intake: SEA-LION extracts type/severity/count, but a real Da Nang '
      + 'ward will not geocode against the Cebu gazetteer — flagged for review is the '
      + 'correct outcome, and it is narrated as such.',
    message:
      'LUWAS: Ngập lụt nặng ở phường Hòa Thuận Đông, Đà Nẵng. Khoảng 80 hộ dân bị cô lập, cần nước sạch.',
  },
] as const;
