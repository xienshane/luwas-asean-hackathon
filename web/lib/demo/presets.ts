// Canonical demo SMS bodies, fired through the real /api/sms/mock endpoint by the
// demo console. Nothing on stage is typed.
//
// BYTE-LOCKED: ai-services/tests/test_parse_presets.py asserts the parser against these
// exact strings. Different language, different deploy target, no shareable file — so the
// two copies must change together, byte for byte.

import type { RegionId } from '@/lib/regions';

export interface DemoPreset {
  id: string;
  /** Language shown on the console rail. */
  language: string;
  /** What the beat is meant to demonstrate — narration cue, not UI copy. */
  intent: string;
  /** Country pack this report is geocoded against. */
  region: RegionId;
  message: string;
}

export const DEMO_PRESETS: readonly DemoPreset[] = [
  {
    id: 'bisaya-guadalupe',
    language: 'Bisaya',
    intent: 'Local-language intake: parses, geocodes to Cebu, lands as a pin.',
    region: 'cebu',
    message: 'LUWAS: grabe ang baha sa Guadalupe, mga 80 ka pamilya ang apektado',
  },
  {
    id: 'vietnamese-an-hai',
    language: 'Vietnamese',
    intent:
      'S10 scalability: the same build, one region over. SEA-LION extracts '
      + 'type/severity/count, the ward geocodes against the Da Nang pack, the area '
      + 'scores, and a dispatch routes to it across the Hàn River. Nothing retrained.',
    region: 'danang',
    message:
      'LUWAS: Ngập lụt nặng ở phường An Hải, Đà Nẵng. Khoảng 80 hộ dân bị cô lập, cần nước sạch.',
  },
] as const;
