import { describe, expect, it } from 'vitest';
import { isLikelyEnglish } from './detect';

describe('isLikelyEnglish', () => {
  it('treats Cebuano/Tagalog reports as non-English', () => {
    expect(isLikelyEnglish('Grabe ang baha sa Apas, mga 500 katawo')).toBe(false);
    expect(isLikelyEnglish('Kailangan namin ng tulong, maraming bahá dito')).toBe(false);
    expect(isLikelyEnglish('dili maagian ang dalan')).toBe(false);
  });

  it('treats plain English reports as English', () => {
    expect(isLikelyEnglish('Severe flooding in Apas, about 500 people affected')).toBe(true);
    expect(isLikelyEnglish('Road is blocked, families need water')).toBe(true);
  });

  it('treats empty / non-word input as English (nothing to translate)', () => {
    expect(isLikelyEnglish('')).toBe(true);
    expect(isLikelyEnglish('123 !!!')).toBe(true);
  });
});
