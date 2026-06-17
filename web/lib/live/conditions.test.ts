import { describe, it, expect } from 'vitest';
import {
  windToCategoryOrdinal,
  categoryLabel,
  parseOpenMeteo,
  openMeteoUrl,
  toLiveConditions,
  pickWorstReading,
  CEBU_SAMPLE_POINTS,
  PAGASA_CATEGORY_LABELS,
} from './conditions';

const reading = (wind_kmh: number) => ({ wind_kmh, gust_kmh: wind_kmh + 20, precip_mm: 1, observed_at: 't' });

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

describe('CEBU_SAMPLE_POINTS', () => {
  it('spans the province with valid Cebu-area coordinates', () => {
    expect(CEBU_SAMPLE_POINTS.length).toBeGreaterThanOrEqual(3);
    for (const p of CEBU_SAMPLE_POINTS) {
      expect(p.lat).toBeGreaterThan(9);
      expect(p.lat).toBeLessThan(12);
      expect(p.lng).toBeGreaterThan(123);
      expect(p.lng).toBeLessThan(125);
    }
  });
});

describe('pickWorstReading', () => {
  it('returns the reading with the highest sustained wind', () => {
    const worst = pickWorstReading([reading(60), reading(160), reading(90)]);
    expect(worst.wind_kmh).toBe(160);
    expect(worst.gust_kmh).toBe(180); // gust follows the worst-wind point
  });

  it('handles a single reading', () => {
    expect(pickWorstReading([reading(70)]).wind_kmh).toBe(70);
  });

  it('throws on an empty list', () => {
    expect(() => pickWorstReading([])).toThrow();
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
