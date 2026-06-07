// lib/mockData.ts

export interface Barangay {
  id: string;
  name: string;
  cityMunicipality: string;
  population: number;
  areaKm2: number;
  popDensity: number;
  hazardComposite: number; // Worst of flood, landslide, storm surge
  hazardDetails: {
    flood: number;
    landslide: number;
    stormSurge: number;
  };
  lastConfirmedContact: string | null; // ISO Date string
  latitude: number;
  longitude: number;
  riskRanking: number; // Priority rank
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

// Helper function to generate realistic curved routes between waypoints
function generateRealisticRoute(
  waypoints: Array<{ lat: number; lng: number }>,
  segmentsPerPair: number = 10
): Array<{ lat: number; lng: number }> {
  if (waypoints.length < 2) return waypoints;
  
  const curvedRoute: Array<{ lat: number; lng: number }> = [];
  
  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    
    // Add intermediate points for smoother curves
    for (let j = 0; j <= segmentsPerPair; j++) {
      const t = j / segmentsPerPair;
      
      // Linear interpolation
      let lat = p1.lat * (1 - t) + p2.lat * t;
      let lng = p1.lng * (1 - t) + p2.lng * t;
      
      // Add bezier-style curve for non-straight paths
      if (i > 0 && i < waypoints.length - 2) {
        const p0 = waypoints[i - 1];
        const p3 = waypoints[i + 2];
        
        // Cubic Bezier interpolation for smoother curves
        const t2 = t * t;
        const t3 = t2 * t;
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        
        lat = mt3 * p0.lat + 3 * mt2 * t * p1.lat + 3 * mt * t2 * p2.lat + t3 * p3.lat;
        lng = mt3 * p0.lng + 3 * mt2 * t * p1.lng + 3 * mt * t2 * p2.lng + t3 * p3.lng;
      }
      
      // Add slight random offset for natural road variation (only for intermediate points)
      if (j > 0 && j < segmentsPerPair) {
        const offset = 0.0002 * Math.sin(t * Math.PI);
        lat += (Math.random() - 0.5) * offset;
        lng += (Math.random() - 0.5) * offset;
      }
      
      curvedRoute.push({ lat, lng });
    }
  }
  
  return curvedRoute;
}

// Global Cebu Warehouses / Shelters / Supply Hubs
export const mockLocationHubs: LocationHub[] = [
  { id: 'hub-1', name: 'Metro Cebu Central Warehouse', type: 'warehouse', latitude: 10.3121, longitude: 123.9056, capacityPercent: 65 },
  { id: 'hub-2', name: 'Mandaue Logistics Base', type: 'warehouse', latitude: 10.3341, longitude: 123.9312, capacityPercent: 88 },
  { id: 'hub-3', name: 'Guadalupe Emergency Shelter A', type: 'shelter', latitude: 10.3201, longitude: 123.8821, capacityPercent: 42 },
  { id: 'hub-4', name: 'Pasil Coastal Evac Center', type: 'shelter', latitude: 10.2905, longitude: 123.8911, capacityPercent: 95 },
  { id: 'hub-5', name: 'Lahug Heights Supply Depot', type: 'supply_hub', latitude: 10.3412, longitude: 123.8988, capacityPercent: 12 }
];

// Historical incidents context
export const mockHistoricalIncidents: Record<string, HistoricalIncident[]> = {
  'b-lahug': [
    { id: 'hi-1', year: 2021, event: 'Super Typhoon Odette', affectedCount: 1250, damageSeverity: 'severe' },
    { id: 'hi-2', year: 2023, event: 'Monsoon landslide', affectedCount: 150, damageSeverity: 'moderate' }
  ],
  'b-mambaling': [
    { id: 'hi-3', year: 2021, event: 'Super Typhoon Odette Coastal Flood', affectedCount: 4800, damageSeverity: 'severe' },
    { id: 'hi-4', year: 2024, event: 'Sitio Alaska Tidal Overwash', affectedCount: 920, damageSeverity: 'moderate' }
  ],
  'b-pasil': [
    { id: 'hi-5', year: 2021, event: 'Super Typhoon Odette Storm Surge', affectedCount: 2200, damageSeverity: 'severe' },
    { id: 'hi-6', year: 2020, event: 'Coastal High Tide Flooding', affectedCount: 600, damageSeverity: 'minor' }
  ],
  'b-talamban': [
    { id: 'hi-7', year: 2021, event: 'Super Typhoon Odette River Overflow', affectedCount: 650, damageSeverity: 'moderate' }
  ]
};

// Initial Mock Data (Cebu City region)
export const mockBarangays: Barangay[] = [
  {
    id: 'b-lahug',
    name: 'Lahug',
    cityMunicipality: 'Cebu City',
    population: 45850,
    areaKm2: 4.88,
    popDensity: 9395,
    hazardComposite: 0.85,
    hazardDetails: { flood: 0.3, landslide: 0.85, stormSurge: 0.0 },
    lastConfirmedContact: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    latitude: 10.3382,
    longitude: 123.9016,
    riskRanking: 3
  },
  {
    id: 'b-mambaling',
    name: 'Mambaling',
    cityMunicipality: 'Cebu City',
    population: 32560,
    areaKm2: 1.12,
    popDensity: 29071,
    hazardComposite: 0.90,
    hazardDetails: { flood: 0.9, landslide: 0.0, stormSurge: 0.7 },
    lastConfirmedContact: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    latitude: 10.2928,
    longitude: 123.8829,
    riskRanking: 2
  },
  {
    id: 'b-pasil',
    name: 'Pasil',
    cityMunicipality: 'Cebu City',
    population: 9400,
    areaKm2: 0.14,
    popDensity: 67142,
    hazardComposite: 0.95,
    hazardDetails: { flood: 0.8, landslide: 0.0, stormSurge: 0.95 },
    lastConfirmedContact: null,
    latitude: 10.2917,
    longitude: 123.8936,
    riskRanking: 1
  },
  {
    id: 'b-talamban',
    name: 'Talamban',
    cityMunicipality: 'Cebu City',
    population: 34120,
    areaKm2: 7.23,
    popDensity: 4719,
    hazardComposite: 0.65,
    hazardDetails: { flood: 0.5, landslide: 0.65, stormSurge: 0.0 },
    lastConfirmedContact: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    latitude: 10.3705,
    longitude: 123.9181,
    riskRanking: 7
  },
  {
    id: 'b-guadalupe',
    name: 'Guadalupe',
    cityMunicipality: 'Cebu City',
    population: 68420,
    areaKm2: 8.76,
    popDensity: 7810,
    hazardComposite: 0.70,
    hazardDetails: { flood: 0.4, landslide: 0.7, stormSurge: 0.0 },
    lastConfirmedContact: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
    latitude: 10.3225,
    longitude: 123.8845,
    riskRanking: 5
  },
  {
    id: 'b-ermita',
    name: 'Ermita',
    cityMunicipality: 'Cebu City',
    population: 8850,
    areaKm2: 0.22,
    popDensity: 40227,
    hazardComposite: 0.88,
    hazardDetails: { flood: 0.75, landslide: 0.0, stormSurge: 0.88 },
    lastConfirmedContact: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    latitude: 10.2961,
    longitude: 123.8998,
    riskRanking: 4
  },
  {
    id: 'b-mabolo',
    name: 'Mabolo',
    cityMunicipality: 'Cebu City',
    population: 23200,
    areaKm2: 2.15,
    popDensity: 10790,
    hazardComposite: 0.75,
    hazardDetails: { flood: 0.75, landslide: 0.1, stormSurge: 0.3 },
    lastConfirmedContact: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
    latitude: 10.3243,
    longitude: 123.9167,
    riskRanking: 6
  },
  {
    id: 'b-subangdaku',
    name: 'Subangdaku',
    cityMunicipality: 'Mandaue City',
    population: 19800,
    areaKm2: 1.89,
    popDensity: 10476,
    hazardComposite: 0.80,
    hazardDetails: { flood: 0.8, landslide: 0.0, stormSurge: 0.4 },
    lastConfirmedContact: new Date(Date.now() - 60 * 3600 * 1000).toISOString(),
    latitude: 10.3289,
    longitude: 123.9298,
    riskRanking: 8
  }
];

export const mockFieldReports: FieldReport[] = [
  {
    id: 'fr-1',
    barangayId: 'b-mambaling',
    barangayName: 'Mambaling',
    reporterName: 'Mobile App Volunteer (V-02)',
    source: 'app',
    rawText: 'Water levels rising rapidly in Sitio Alaska. Flooded up to chest level. 50+ families displaced, sitting on roofs. Need immediate evacuation and search-and-rescue boats.',
    populationEstimate: 250,
    needsSeverity: 'critical',
    roadStatus: 'Blocked',
    roadImpassable: true,
    impassableEdgeId: 'edge-mambaling-access',
    confidence: 0.95,
    status: 'pending',
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    latitude: 10.2915,
    longitude: 123.8812
  },
  {
    id: 'fr-2',
    barangayId: 'b-pasil',
    barangayName: 'Pasil',
    reporterName: '+63917******67 (SMS)',
    source: 'sms',
    rawText: 'LUWAS AID NEEDED: PASIL SEAWALL COLLAPSED. Storm surge has swept coastal houses in Sitio Lupa. High wind damage. We have no electricity and water supply. Many children need food and drinking water immediately.',
    populationEstimate: 120,
    needsSeverity: 'critical',
    roadStatus: 'Slow',
    roadImpassable: false,
    impassableEdgeId: null,
    confidence: 0.88,
    status: 'pending',
    createdAt: new Date(Date.now() - 1.5 * 3600 * 1000).toISOString(),
    latitude: 10.2902,
    longitude: 123.8925
  },
  {
    id: 'fr-3',
    barangayId: 'b-lahug',
    barangayName: 'Lahug',
    reporterName: 'NLP System (Parsed)',
    source: 'parsed',
    rawText: 'Landslide occurred along the hillside in Sitio Gaway-gaway. Three houses partially buried. Road is blocked with soil and boulders. No casualties reported yet, but slopes look unstable.',
    populationEstimate: 45,
    needsSeverity: 'high',
    roadStatus: 'Damaged',
    roadImpassable: true,
    impassableEdgeId: 'edge-lahug-talamban',
    confidence: 0.92,
    status: 'confirmed',
    createdAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    latitude: 10.3452,
    longitude: 123.8995
  },
  {
    id: 'fr-4',
    barangayId: 'b-guadalupe',
    barangayName: 'Guadalupe',
    reporterName: 'Health Worker (V-09)',
    source: 'app',
    rawText: 'Power lines down near church. Minor road debris. Flooding in low-lying fields but main roads are clear. Shelters established at Barangay Hall, currently housing 15 families.',
    populationEstimate: 60,
    needsSeverity: 'medium',
    roadStatus: 'Open',
    roadImpassable: false,
    impassableEdgeId: null,
    confidence: 0.81,
    status: 'confirmed',
    createdAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    latitude: 10.3210,
    longitude: 123.8820
  },
  {
    id: 'fr-5',
    barangayId: 'b-subangdaku',
    barangayName: 'Subangdaku',
    reporterName: '+63918******43 (SMS)',
    source: 'sms',
    rawText: 'Severe overflow of Mahiga creek. Highway near Subangdaku bridge is flooded. Traffic stalled, small cars flooded. Water entered ground floors of residential buildings.',
    populationEstimate: 80,
    needsSeverity: 'high',
    roadStatus: 'Blocked',
    roadImpassable: true,
    impassableEdgeId: 'edge-highway-subangdaku',
    confidence: 0.90,
    status: 'pending',
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    latitude: 10.3312,
    longitude: 123.9315
  }
];

export const mockTeams: Team[] = [
  {
    id: 'team-alpha',
    name: 'Rescue Alpha (4x4)',
    capacityKg: 1200,
    baseLocation: { lat: 10.3157, lng: 123.8854 },
    status: 'active',
    type: '4x4',
    currentAssignment: 'Lahug Landslide Clearing',
    activeRouteId: 'route-1'
  },
  {
    id: 'team-beta',
    name: 'Logistics Beta (Truck)',
    capacityKg: 5000,
    baseLocation: { lat: 10.3157, lng: 123.8854 },
    status: 'idle',
    type: 'truck'
  },
  {
    id: 'team-gamma',
    name: 'Water Rescue Gamma (Boat)',
    capacityKg: 800,
    baseLocation: { lat: 10.2917, lng: 123.9016 },
    status: 'dispatched',
    type: 'boat',
    currentAssignment: 'Mambaling Sitio Alaska Evacuation',
    activeRouteId: 'route-1'
  },
  {
    id: 'team-delta',
    name: 'Medic Delta (Ambulance)',
    capacityKg: 400,
    baseLocation: { lat: 10.3215, lng: 123.8967 },
    status: 'active',
    type: 'ambulance',
    currentAssignment: 'Pasil Coast Medical Aid',
    activeRouteId: 'route-3'
  }
];

// Clusterable PII-obfuscated volunteers
export const mockVolunteers: Volunteer[] = [
  { id: 'v-1', name: 'Volunteer V-01', phone: '+63917******11', teamId: 'team-alpha', teamName: 'Rescue Alpha (4x4)', availability: 'busy', lastCheckIn: '10m ago', latitude: 10.3371, longitude: 123.9001 },
  { id: 'v-2', name: 'Volunteer V-02', phone: '+63917******22', teamId: 'team-gamma', teamName: 'Water Rescue Gamma (Boat)', availability: 'busy', lastCheckIn: '5m ago', latitude: 10.2912, longitude: 123.8805 },
  { id: 'v-3', name: 'Volunteer V-03', phone: '+63917******33', teamId: null, teamName: null, availability: 'available', lastCheckIn: '1h ago', latitude: 10.3160, longitude: 123.8860 },
  { id: 'v-4', name: 'Volunteer V-04', phone: '+63917******44', teamId: null, teamName: null, availability: 'available', lastCheckIn: '25m ago', latitude: 10.3230, longitude: 123.8840 },
  { id: 'v-5', name: 'Volunteer V-05', phone: '+63917******55', teamId: null, teamName: null, availability: 'offline', lastCheckIn: '4h ago', latitude: 10.3690, longitude: 123.9170 }
];

export const mockRoadEdges: RoadEdge[] = [
  {
    id: 'edge-lahug-talamban',
    name: 'Lahug-Talamban Road',
    sourceNode: 'Lahug Centroid',
    targetNode: 'Talamban Centroid',
    sourceCoords: { lat: 10.3382, lng: 123.9016 },
    targetCoords: { lat: 10.3705, lng: 123.9181 },
    status: 'damaged',
    lengthM: 3800,
    notes: 'Blocked by landslide debris, heavy machinery required.'
  },
  {
    id: 'edge-mambaling-access',
    name: 'F. Llamas St',
    sourceNode: 'City Center',
    targetNode: 'Mambaling Centroid',
    sourceCoords: { lat: 10.3157, lng: 123.8854 },
    targetCoords: { lat: 10.2928, lng: 123.8829 },
    status: 'blocked',
    lengthM: 2600,
    notes: 'Flooded chest-deep, boat access only.'
  },
  {
    id: 'edge-highway-subangdaku',
    name: 'M.C. Briones St (Mandaue Highway)',
    sourceNode: 'Mabolo Centroid',
    targetNode: 'Subangdaku Centroid',
    sourceCoords: { lat: 10.3243, lng: 123.9167 },
    targetCoords: { lat: 10.3289, lng: 123.9298 },
    status: 'slow',
    lengthM: 1600,
    notes: 'High water overflow from Mahiga Creek, light vehicles advised to detour.'
  },
  {
    id: 'edge-city-pasil',
    name: 'Tres de Abril St (Pasil access)',
    sourceNode: 'City Center',
    targetNode: 'Pasil Centroid',
    sourceCoords: { lat: 10.3157, lng: 123.8854 },
    targetCoords: { lat: 10.2917, lng: 123.8936 },
    status: 'open',
    lengthM: 2700
  },
  {
    id: 'edge-city-lahug',
    name: 'Gorordo Ave',
    sourceNode: 'City Center',
    targetNode: 'Lahug Centroid',
    sourceCoords: { lat: 10.3157, lng: 123.8854 },
    targetCoords: { lat: 10.3382, lng: 123.9016 },
    status: 'open',
    lengthM: 2900
  },
  {
    id: 'edge-city-guadalupe',
    name: 'M. Velez St',
    sourceNode: 'City Center',
    targetNode: 'Guadalupe Centroid',
    sourceCoords: { lat: 10.3157, lng: 123.8854 },
    targetCoords: { lat: 10.3225, lng: 123.8845 },
    status: 'open',
    lengthM: 1100
  },
  {
    id: 'edge-city-mabolo',
    name: 'M.J. Cuenco Ave',
    sourceNode: 'City Center',
    targetNode: 'Mabolo Centroid',
    sourceCoords: { lat: 10.3157, lng: 123.8854 },
    targetCoords: { lat: 10.3243, lng: 123.9167 },
    status: 'open',
    lengthM: 3500
  },
  {
    id: 'edge-mabolo-subangdaku',
    name: 'Subangdaku Access Rd',
    sourceNode: 'Mabolo Centroid',
    targetNode: 'Subangdaku Centroid',
    sourceCoords: { lat: 10.3243, lng: 123.9167 },
    targetCoords: { lat: 10.3289, lng: 123.9298 },
    status: 'slow',
    lengthM: 1800,
    notes: 'Partial flooding, 4x4 vehicles only'
  }
];

// Updated Routes with realistic curved paths using waypoints
export const mockRoutes: Route[] = [
  {
    id: 'route-1',
    teamId: 'team-gamma',
    teamName: 'Water Rescue Gamma (Boat)',
    status: 'active',
    totalDistanceM: 5300,
    stops: [
      { sequence: 1, barangayId: 'b-pasil', barangayName: 'Pasil', action: 'Deliver Water & Medical Supplies' },
      { sequence: 2, barangayId: 'b-mambaling', barangayName: 'Mambaling', action: 'Search-and-Rescue Evacuation' }
    ],
    path: generateRealisticRoute([
      { lat: 10.2917, lng: 123.9016 }, // Start near Pasil coast
      { lat: 10.2917, lng: 123.8936 }, // Pasil center
      { lat: 10.2930, lng: 123.8880 }, // Midpoint coastal road
      { lat: 10.2928, lng: 123.8829 }  // Mambaling center
    ], 12)
  },
  {
    id: 'route-2',
    teamId: 'team-beta',
    teamName: 'Logistics Beta (Truck)',
    status: 'planned',
    totalDistanceM: 3800,
    stops: [
      { sequence: 1, barangayId: 'b-guadalupe', barangayName: 'Guadalupe', action: 'Deliver Shelter Materials' }
    ],
    path: generateRealisticRoute([
      { lat: 10.3157, lng: 123.8854 }, // City Center Warehouse
      { lat: 10.3185, lng: 123.8845 }, // Midway through residential area
      { lat: 10.3225, lng: 123.8845 }  // Guadalupe center
    ], 8)
  },
  {
    id: 'route-3',
    teamId: 'team-delta',
    teamName: 'Medic Delta (Ambulance)',
    status: 'active',
    totalDistanceM: 4500,
    stops: [
      { sequence: 1, barangayId: 'b-ermita', barangayName: 'Ermita', action: 'Medical Evacuation' },
      { sequence: 2, barangayId: 'b-pasil', barangayName: 'Pasil', action: 'Emergency Medical Response' }
    ],
    path: generateRealisticRoute([
      { lat: 10.3215, lng: 123.8967 }, // Medical base
      { lat: 10.3157, lng: 123.8854 }, // City center
      { lat: 10.3100, lng: 123.8900 }, // Coastal road junction
      { lat: 10.2961, lng: 123.8998 }, // Ermita
      { lat: 10.2935, lng: 123.8965 }, // Midpoint coastal
      { lat: 10.2917, lng: 123.8936 }  // Pasil
    ], 10)
  },
  {
    id: 'route-4',
    teamId: 'team-alpha',
    teamName: 'Rescue Alpha (4x4)',
    status: 'active',
    totalDistanceM: 4200,
    stops: [
      { sequence: 1, barangayId: 'b-lahug', barangayName: 'Lahug', action: 'Landslide Clearing Support' }
    ],
    path: generateRealisticRoute([
      { lat: 10.3157, lng: 123.8854 }, // Base
      { lat: 10.3240, lng: 123.8900 }, // Hillside approach
      { lat: 10.3315, lng: 123.8955 }, // Upper Lahug
      { lat: 10.3382, lng: 123.9016 }  // Lahug landslide site
    ], 10)
  },
  {
    id: 'route-5',
    teamId: 'team-beta',
    teamName: 'Logistics Beta (Truck)',
    status: 'planned',
    totalDistanceM: 6200,
    stops: [
      { sequence: 1, barangayId: 'b-subangdaku', barangayName: 'Subangdaku', action: 'Flood Relief Supplies' },
      { sequence: 2, barangayId: 'b-mabolo', barangayName: 'Mabolo', action: 'Food Distribution' }
    ],
    path: generateRealisticRoute([
      { lat: 10.3157, lng: 123.8854 }, // Warehouse
      { lat: 10.3200, lng: 123.9000 }, // Midpoint
      { lat: 10.3243, lng: 123.9167 }, // Mabolo
      { lat: 10.3265, lng: 123.9230 }, // Highway approach
      { lat: 10.3289, lng: 123.9298 }  // Subangdaku
    ], 15)
  }
];

// EOC-style Impact Predictions with Risk Contributors
export const mockImpactPredictions: Record<string, ImpactPrediction> = {
  'b-lahug': {
    barangayId: 'b-lahug',
    model: 'TabPFN v2',
    predictedAffected: 320,
    damageSeverity: 'moderate',
    confidence: 'moderate',
    overrideValue: null,
    contributors: ['Slope instability risk', 'Hillside structures', 'Landslide reports']
  },
  'b-mambaling': {
    barangayId: 'b-mambaling',
    model: 'TabPFN v2',
    predictedAffected: 1450,
    damageSeverity: 'severe',
    confidence: 'high',
    overrideValue: null,
    contributors: ['High population density', 'Sitio Alaska flooding', 'Impassable access road']
  },
  'b-pasil': {
    barangayId: 'b-pasil',
    model: 'TabPFN v2',
    predictedAffected: 2100,
    damageSeverity: 'severe',
    confidence: 'high',
    overrideValue: null,
    contributors: ['Seawall collapse reports', 'Extreme pop density', 'Storm surge exposure']
  },
  'b-talamban': {
    barangayId: 'b-talamban',
    model: 'TabPFN v2',
    predictedAffected: 80,
    damageSeverity: 'minor',
    confidence: 'moderate',
    overrideValue: null,
    contributors: ['River overflow', 'Creek proximity']
  },
  'b-guadalupe': {
    barangayId: 'b-guadalupe',
    model: 'TabPFN v2',
    predictedAffected: 150,
    damageSeverity: 'minor',
    confidence: 'moderate',
    overrideValue: null,
    contributors: ['Hillside settlement exposure']
  },
  'b-ermita': {
    barangayId: 'b-ermita',
    model: 'TabPFN v2',
    predictedAffected: 620,
    damageSeverity: 'severe',
    confidence: 'high',
    overrideValue: null,
    contributors: ['Coastal storm surge exposure', 'High wind damages']
  },
  'b-mabolo': {
    barangayId: 'b-mabolo',
    model: 'TabPFN v2',
    predictedAffected: 240,
    damageSeverity: 'moderate',
    confidence: 'moderate',
    overrideValue: null,
    contributors: ['Mahiga Creek flow overflow']
  },
  'b-subangdaku': {
    barangayId: 'b-subangdaku',
    model: 'TabPFN v2',
    predictedAffected: 540,
    damageSeverity: 'moderate',
    confidence: 'high',
    overrideValue: null,
    contributors: ['Highway bridge blockages', 'Mahiga Creek overflow']
  }
};

// Calculate Sphere manifest based on standard:
// - Water: 15 L/person/day for 3 days = 45 L per person
// - Food: 2,100 kcal/person/day for 3 days (approx 3 packs per person)
// - Hygiene Kits: 1 kit per 5 people
// - Medical Supplies: 1 pack per 10 people
// - Shelter Materials: 1 tarp/kit per 5 people
// Mock inventory stats represent Central Warehouses stockpiles
export function getSphereManifest(barangayId: string, affectedPeople: number): SupplyManifest {
  const waterReq = affectedPeople * 15 * 3;
  const foodReq = affectedPeople * 1 * 3;
  const hygieneReq = Math.ceil(affectedPeople * 0.2);
  const medicalReq = Math.ceil(affectedPeople * 0.1);
  const shelterReq = Math.ceil(affectedPeople * 0.2);

  // Central Inventory Stockpile Levels
  const inventoryAvailable = {
    waterL: 50000,
    foodPacks: 10000,
    shelterKits: 1500,
    blankets: 2500,
    hygieneKits: 2000,
    medicalSupplies: 1000,
    shelterMaterials: 1800
  };

  return {
    barangayId,
    days: 3,
    status: 'pending',
    waterL: {
      recommended: waterReq,
      inventory: inventoryAvailable.waterL,
      shortfall: Math.max(0, waterReq - inventoryAvailable.waterL)
    },
    foodPacks: {
      recommended: foodReq,
      inventory: inventoryAvailable.foodPacks,
      shortfall: Math.max(0, foodReq - inventoryAvailable.foodPacks)
    },
    hygieneKits: {
      recommended: hygieneReq,
      inventory: inventoryAvailable.hygieneKits,
      shortfall: Math.max(0, hygieneReq - inventoryAvailable.hygieneKits)
    },
    medicalSupplies: {
      recommended: medicalReq,
      inventory: inventoryAvailable.medicalSupplies,
      shortfall: Math.max(0, medicalReq - inventoryAvailable.medicalSupplies)
    },
    shelterMaterials: {
      recommended: shelterReq,
      inventory: inventoryAvailable.shelterMaterials,
      shortfall: Math.max(0, shelterReq - inventoryAvailable.shelterMaterials)
    },
    overridden: false
  };
}

// Silent Area Scoring Logic (Formula: pop_density_norm * hazard_norm * time_factor)
export function computeSilentAreaScores(
  barangays: Barangay[],
  tauHours: number = 24
): { barangayId: string; score: number; hoursSinceContact: number | null; timeFactor: number }[] {
  const densities = barangays.map(b => b.popDensity).filter(d => d > 0);
  const lnMin = Math.log(Math.min(...densities));
  const lnMax = Math.log(Math.max(...densities));
  const lnRange = lnMax - lnMin || 1;

  const hazards = barangays.map(b => b.hazardComposite);
  const hMin = Math.min(...hazards);
  const hMax = Math.max(...hazards);
  const hRange = hMax - hMin || 1;

  return barangays.map(b => {
    const popDensityNorm = b.popDensity > 0 ? (Math.log(b.popDensity) - lnMin) / lnRange : 0;
    const hazardNorm = (b.hazardComposite - hMin) / hRange;

    let hoursSinceContact: number | null = null;
    let timeFactor = 1.0;

    if (b.lastConfirmedContact) {
      const msSince = Date.now() - new Date(b.lastConfirmedContact).getTime();
      hoursSinceContact = Math.max(msSince / (3600 * 1000), 0);
      timeFactor = 1 - Math.exp(-hoursSinceContact / tauHours);
    }

    const score = popDensityNorm * hazardNorm * timeFactor;

    return {
      barangayId: b.id,
      score: Math.min(Math.max(score, 0), 1),
      hoursSinceContact,
      timeFactor
    };
  });
}