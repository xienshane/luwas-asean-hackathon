// PostgREST and Realtime serialize PostGIS geometry as EWKB hex strings
// (e.g. "0101000020E6100000…"); some paths can hand us GeoJSON instead.
// This decodes either into {lng, lat}, or null when it isn't a point.
export interface LngLat {
  lng: number;
  lat: number;
}

export function geometryToLngLat(value: unknown): LngLat | null {
  if (value == null) return null;

  if (typeof value === 'object') {
    const g = value as { type?: string; coordinates?: unknown };
    if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
      const [lng, lat] = g.coordinates as number[];
      if (typeof lng === 'number' && typeof lat === 'number') return { lng, lat };
    }
    return null;
  }

  if (typeof value !== 'string' || value.length < 42 || /[^0-9a-fA-F]/.test(value)) {
    return null;
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  const view = new DataView(bytes.buffer);

  const littleEndian = bytes[0] === 1;
  let type = view.getUint32(1, littleEndian);
  let offset = 5;
  if (type & 0x20000000) {
    // EWKB SRID flag: 4 SRID bytes follow the type word.
    offset += 4;
    type &= ~0x20000000;
  }
  if ((type & 0xff) !== 1) return null; // not a point

  return {
    lng: view.getFloat64(offset, littleEndian),
    lat: view.getFloat64(offset + 8, littleEndian),
  };
}
