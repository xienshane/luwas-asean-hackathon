import { describe, it, expect } from 'vitest';
import {
  windToCategoryOrdinal,
  categoryLabel,
  parseOpenMeteo,
  openMeteoUrl,
  toLiveConditions,
  PAGASA_CATEGORY_LABELS,
} from './conditions';

describe('windToCategoryOrdinal (matches training CATEGORY_ORDER 0..5)', () => {
  it.each([
    [30, 0],  [61, 0],   // tropical depression
    [62, 1],  [88, 1],   // tropical storm
    [89, 2],  [117, 2],  // severe tropical storm
    [118, 3], [156, 3],  // strong typhoon
    [157, 4], [193, 4],  // very strong typhoon
    [194, 5], [320, 5],  // violent typhoon
  ])('maps %i km/h -> ordinal %i', (kmh, ord) => {
    expect(windToCategoryOrdinal(kmh)).toBe(ord);
  });

  it('clamps negative/garbage wind to ordinal 0', () => {
    expect(windToCategoryOrdinal(-5)).toBe(0);
  });
});

describe('categoryLabel', () => {
  it('labels each ordinal and clamps out-of-range', () => {
    expect(categoryLabel(0)).toBe('Tropical Depression');
    expect(categoryLabel(5)).toBe('Violent Typhoon');
    expect(categoryLabel(99)).toBe('Violent Typhoon'); // clamped
    expect(PAGASA_CATEGORY_LABELS).toHaveLength(6);
  });
});

describe('openMeteoUrl', () => {
  it('builds a keyless current-weather query in km/h', () => {
    const url = openMeteoUrl(10.3157, 123.8854, 'https://api.open-meteo.com/v1');
    expect(url).toContain('/forecast?');
    expect(url).toContain('latitude=10.3157');
    expect(url).toContain('longitude=123.8854');
    expect(url).toContain('current=wind_speed_10m');
    expect(url).toContain('wind_speed_unit=kmh');
    expect(url).not.toContain('apikey'); // free + keyless
  });

  it('tolerates a trailing slash on the base url', () => {
    expect(openMeteoUrl(1, 2, 'https://x/v1/')).toContain('https://x/v1/forecast?');
  });
});

describe('parseOpenMeteo', () => {
  it('reads the current block', () => {
    const r = parseOpenMeteo({
      current: { time: '2026-06-17T01:00', wind_speed_10m: 95, wind_gusts_10m: 120, precipitation: 5 },
    });
    expect(r).toEqual({ wind_kmh: 95, gust_kmh: 120, precip_mm: 5, observed_at: '2026-06-17T01:00' });
  });

  it('defaults gust/precip to null when absent', () => {
    const r = parseOpenMeteo({ current: { time: 't', wind_speed_10m: 40 } });
    expect(r.gust_kmh).toBeNull();
    expect(r.precip_mm).toBeNull();
  });

  it('throws when wind_speed_10m is missing', () => {
    expect(() => parseOpenMeteo({ current: {} })).toThrow();
    expect(() => parseOpenMeteo({})).toThrow();
  });
});

describe('toLiveConditions', () => {
  it('derives ordinal + label and defaults stale=false', () => {
    const c = toLiveConditions({ wind_kmh: 95, gust_kmh: 120, precip_mm: 5, observed_at: 't' });
    expect(c.category_ordinal).toBe(2);
    expect(c.category_label).toBe('Severe Tropical Storm');
    expect(c.source).toBe('open-meteo');
    expect(c.stale).toBe(false);
  });

  it('honors stale=true', () => {
    const c = toLiveConditions({ wind_kmh: 40, gust_kmh: null, precip_mm: null, observed_at: 't' }, { stale: true });
    expect(c.stale).toBe(true);
  });
});
