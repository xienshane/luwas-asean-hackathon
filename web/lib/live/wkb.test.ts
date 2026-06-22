import { describe, expect, it } from 'vitest';
import { geometryToLngLat } from './wkb';

// Build an EWKB hex string (little-endian point + SRID flag) the way PostGIS
// emits it through PostgREST/Realtime, so the test is self-contained.
function encodeEwkbPoint(lng: number, lat: number, srid = 4326): string {
  const buf = new ArrayBuffer(25);
  const view = new DataView(buf);
  view.setUint8(0, 1); // little endian
  view.setUint32(1, 0x20000001, true); // point + SRID flag
  view.setUint32(5, srid, true);
  view.setFloat64(9, lng, true);
  view.setFloat64(17, lat, true);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

describe('geometryToLngLat', () => {
  it('decodes an EWKB hex point', () => {
    const hex = encodeEwkbPoint(123.8854, 10.3157);
    expect(geometryToLngLat(hex)).toEqual({ lng: 123.8854, lat: 10.3157 });
  });

  it('accepts a GeoJSON point object', () => {
    expect(geometryToLngLat({ type: 'Point', coordinates: [123.9, 10.3] })).toEqual({
      lng: 123.9,
      lat: 10.3,
    });
  });

  it('returns null for garbage', () => {
    expect(geometryToLngLat('not-hex')).toBeNull();
    expect(geometryToLngLat(null)).toBeNull();
  });
});
