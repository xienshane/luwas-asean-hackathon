// Coordinator dashboard domain types.
//
// These describe the shapes the coordinator UI renders, independent of where the data
// comes from. Real data (lib/supabase/coordinator.ts) and demo fixtures (lib/mockData.ts)
// both produce values of these types — so when the mock fixtures are eventually removed,
// nothing here moves.

// A GeoJSON Polygon/MultiPolygon geometry — the real barangay boundary from PostGIS,
// served by the coordinator_barangay_scores view for the map choropleth.
export type BoundaryGeometry = {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
};

export interface Barangay {
  id: string;
  name: string;
  cityMunicipality: string;
  population: number;
  popDensity: number;
  hazardComposite: number; // Worst of flood, landslide, storm surge
  lastConfirmedContact: string | null; // ISO Date string
  latitude: number;
  longitude: number;
  // Real barangay boundary (GeoJSON) for the map fill; absent → map falls back to a
  // centroid hexagon.
  boundary?: BoundaryGeometry;
  // Not rendered anywhere today; optional so demo fixtures may still set them.
  areaKm2?: number;
  hazardDetails?: {
    flood: number;
    landslide: number;
    stormSurge: number;
  };
  riskRanking?: number; // Priority rank
}

export interface FieldReport {
  id: string;
  barangayId: string | null;
  barangayName: string;
  reporterName: string;
  source: 'app' | 'sms' | 'parsed';
  rawText: string;
  populationEstimate: number;
  needsSeverity: 'critical' | 'high' | 'medium' | 'low';
  roadStatus: string;
  roadImpassable: boolean;
  impassableEdgeId: string | null;
  confidence: number;
  status: 'pending' | 'confirmed' | 'flagged';
  createdAt: string;
  latitude: number;
  longitude: number;
}

export interface Team {
  id: string;
  name: string;
  capacityKg: number;
  baseLocation: { lat: number; lng: number };
  status: 'active' | 'dispatched' | 'maintenance' | 'idle';
  type: 'truck' | '4x4' | 'boat' | 'ambulance';
  currentAssignment?: string;
  activeRouteId?: string;
}

export interface Volunteer {
  id: string;
  name: string; // Masked PII, e.g. "V-04" or "Juan R. (Masked)"
  phone: string; // Obfuscated phone "+63917******82"
  teamId: string | null;
  teamName: string | null;
  availability: 'available' | 'busy' | 'offline';
  lastCheckIn: string;
  latitude: number;
  longitude: number;
}

export interface RoadEdge {
  id: string;
  name: string;
  sourceNode: string;
  targetNode: string;
  sourceCoords: { lat: number; lng: number };
  targetCoords: { lat: number; lng: number };
  status: 'open' | 'slow' | 'blocked' | 'damaged'; // Extended status
  lengthM: number;
  notes?: string;
}

export interface Route {
  id: string;
  teamId: string;
  teamName: string;
  status: 'planned' | 'active' | 'completed';
  stops: {
    sequence: number;
    barangayId: string;
    barangayName: string;
    action: string;
    manifestId?: string;
  }[];
  totalDistanceM: number;
  path: { lat: number; lng: number }[];
}

export interface ImpactPrediction {
  barangayId: string;
  model: string;
  predictedAffected: number;
  damageSeverity: 'severe' | 'moderate' | 'minor';
  confidence: 'high' | 'moderate' | 'low';
  overrideValue: number | null;
  contributors: string[];
}

export interface SupplyItem {
  recommended: number;
  inventory: number;
  shortfall: number;
}

export interface SupplyManifest {
  barangayId: string;
  days: number;
  status: 'pending' | 'approved' | 'modified' | 'rejected';
  waterL: SupplyItem;
  foodPacks: SupplyItem;
  hygieneKits: SupplyItem;
  medicalSupplies: SupplyItem;
  shelterMaterials: SupplyItem;
  overridden: boolean;
}

export interface LocationHub {
  id: string;
  name: string;
  type: 'warehouse' | 'supply_hub' | 'shelter';
  latitude: number;
  longitude: number;
  capacityPercent: number;
}

export interface HistoricalIncident {
  id: string;
  year: number;
  event: string;
  affectedCount: number;
  damageSeverity: 'severe' | 'moderate' | 'minor';
}
