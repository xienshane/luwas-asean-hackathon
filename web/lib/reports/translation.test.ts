import { describe, expect, it } from 'vitest';
import { hasTranslation } from './translation';

describe('hasTranslation', () => {
  it('is true when the translation differs from the original', () => {
    expect(
      hasTranslation({
        rawText: 'Grabe ang baha diri sa Catarman.',
        translatedText: 'Severe flooding here in Catarman.',
      }),
    ).toBe(true);
  });

  it('is false when the report has not been translated yet', () => {
    expect(hasTranslation({ rawText: 'Grabe ang baha.', translatedText: null })).toBe(false);
  });

  it('is false when the report was already English', () => {
    // English rows are stored with translated_text = raw_text so the dashboard
    // never spends a SEA-LION call on them. Equality, not null, marks that case.
    const text = 'Flooding receding in Cordova.';
    expect(hasTranslation({ rawText: text, translatedText: text })).toBe(false);
  });

  it('is false for an empty translation', () => {
    expect(hasTranslation({ rawText: 'Grabe ang baha.', translatedText: '' })).toBe(false);
  });
});
