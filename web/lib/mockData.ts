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

// ─── Scaled-up Hubs (8 Locations) ─────────────────────────────────────────────
export const mockLocationHubs: LocationHub[] = [
  { id: 'hub-1', name: 'Metro Cebu Central Warehouse', type: 'warehouse', latitude: 10.3121, longitude: 123.9056, capacityPercent: 65 },
  { id: 'hub-2', name: 'Mandaue Logistics Base', type: 'warehouse', latitude: 10.3341, longitude: 123.9312, capacityPercent: 88 },
  { id: 'hub-3', name: 'Guadalupe Emergency Shelter A', type: 'shelter', latitude: 10.3201, longitude: 123.8821, capacityPercent: 42 },
  { id: 'hub-4', name: 'Pasil Coastal Evac Center', type: 'shelter', latitude: 10.2905, longitude: 123.8911, capacityPercent: 95 },
  { id: 'hub-5', name: 'Lahug Heights Supply Depot', type: 'supply_hub', latitude: 10.3412, longitude: 123.8988, capacityPercent: 12 },
  { id: 'hub-6', name: 'Labangon Community Shelter', type: 'shelter', latitude: 10.3015, longitude: 123.8741, capacityPercent: 30 },
  { id: 'hub-7', name: 'Banilad Logistics Outpost', type: 'supply_hub', latitude: 10.3421, longitude: 123.9142, capacityPercent: 50 },
  { id: 'hub-8', name: 'Talisay Regional Hub', type: 'warehouse', latitude: 10.2580, longitude: 123.8390, capacityPercent: 74 }
];

// ─── Expanded Historical Context ──────────────────────────────────────────────
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
  ],
  'b-guadalupe': [
    { id: 'hi-8', year: 2021, event: 'Super Typhoon Odette Landslide', affectedCount: 800, damageSeverity: 'moderate' }
  ],
  'b-tisa': [
    { id: 'hi-9', year: 2022, event: 'Severe Flash Flood', affectedCount: 1400, damageSeverity: 'moderate' }
  ],
  'b-bulacao': [
    { id: 'hi-10', year: 2021, event: 'Super Typhoon Odette Hillside Runoff', affectedCount: 1100, damageSeverity: 'severe' }
  ]
};

// ─── Expanded Barangay Database (16 Items) ───────────────────────────────────
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
  },
  {
    id: 'b-banilad',
    name: 'Banilad',
    cityMunicipality: 'Cebu City',
    population: 18230,
    areaKm2: 1.95,
    popDensity: 9348,
    hazardComposite: 0.55,
    hazardDetails: { flood: 0.4, landslide: 0.2, stormSurge: 0.0 },
    lastConfirmedContact: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    latitude: 10.3421,
    longitude: 123.9142,
    riskRanking: 12
  },
  {
    id: 'b-labangon',
    name: 'Labangon',
    cityMunicipality: 'Cebu City',
    population: 33400,
    areaKm2: 1.45,
    popDensity: 23034,
    hazardComposite: 0.78,
    hazardDetails: { flood: 0.75, landslide: 0.2, stormSurge: 0.0 },
    lastConfirmedContact: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    latitude: 10.3015,
    longitude: 123.8741,
    riskRanking: 9
  },
  {
    id: 'b-tisa',
    name: 'Tisa',
    cityMunicipality: 'Cebu City',
    population: 39500,
    areaKm2: 2.10,
    popDensity: 18809,
    hazardComposite: 0.82,
    hazardDetails: { flood: 0.6, landslide: 0.82, stormSurge: 0.0 },
    lastConfirmedContact: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
    latitude: 10.2985,
    longitude: 123.8680,
    riskRanking: 10
  },
  {
    id: 'b-bulacao',
    name: 'Bulacao',
    cityMunicipality: 'Cebu City',
    population: 31000,
    areaKm2: 3.42,
    popDensity: 9064,
    hazardComposite: 0.80,
    hazardDetails: { flood: 0.5, landslide: 0.8, stormSurge: 0.0 },
    lastConfirmedContact: null,
    latitude: 10.2701,
    longitude: 123.8456,
    riskRanking: 11
  },
  {
    id: 'b-inayawan',
    name: 'Inayawan',
    cityMunicipality: 'Cebu City',
    population: 34500,
    areaKm2: 3.01,
    popDensity: 11461,
    hazardComposite: 0.85,
    hazardDetails: { flood: 0.85, landslide: 0.0, stormSurge: 0.6 },
    lastConfirmedContact: new Date(Date.now() - 96 * 3600 * 1000).toISOString(),
    latitude: 10.2642,
    longitude: 123.8569,
    riskRanking: 13
  },
  {
    id: 'b-pardo',
    name: 'Pardo',
    cityMunicipality: 'Cebu City',
    population: 26800,
    areaKm2: 2.85,
    popDensity: 9403,
    hazardComposite: 0.72,
    hazardDetails: { flood: 0.6, landslide: 0.4, stormSurge: 0.0 },
    lastConfirmedContact: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    latitude: 10.2778,
    longitude: 123.8488,
    riskRanking: 14
  },
  {
    id: 'b-carreta',
    name: 'Carreta',
    cityMunicipality: 'Cebu City',
    population: 12300,
    areaKm2: 0.95,
    popDensity: 12947,
    hazardComposite: 0.81,
    hazardDetails: { flood: 0.81, landslide: 0.0, stormSurge: 0.4 },
    lastConfirmedContact: new Date(Date.now() - 15 * 3600 * 1000).toISOString(),
    latitude: 10.3129,
    longitude: 123.9125,
    riskRanking: 15
  },
  {
    id: 'b-tejero',
    name: 'Tejero',
    cityMunicipality: 'Cebu City',
    population: 15400,
    areaKm2: 0.82,
    popDensity: 18780,
    hazardComposite: 0.86,
    hazardDetails: { flood: 0.8, landslide: 0.0, stormSurge: 0.86 },
    lastConfirmedContact: new Date(Date.now() - 22 * 3600 * 1000).toISOString(),
    latitude: 10.3061,
    longitude: 123.9082,
    riskRanking: 16
  }
];

// ─── Scaled-up Field Reports (14 Incidents) ──────────────────────────────────
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
  },
  {
    id: 'fr-6',
    barangayId: 'b-tisa',
    barangayName: 'Tisa',
    reporterName: 'Local Official V-11',
    source: 'app',
    rawText: 'Flash flood runoffs from the hills hit Sitio Katipunan. Low-lying houses submerged in 3 feet of muddy water. Residents evacuated to chapel. Basic food rations and dry clothes needed.',
    populationEstimate: 110,
    needsSeverity: 'high',
    roadStatus: 'Slow',
    roadImpassable: false,
    impassableEdgeId: null,
    confidence: 0.87,
    status: 'pending',
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    latitude: 10.2970,
    longitude: 123.8650
  },
  {
    id: 'fr-7',
    barangayId: 'b-bulacao',
    barangayName: 'Bulacao',
    reporterName: 'NLP System (Parsed)',
    source: 'parsed',
    rawText: 'Reports of cracked earth and mud displacement near boundary. Unstable slopes threatening 8 residential structures. Evacuation has begun, but assistance for physical moving is requested.',
    populationEstimate: 35,
    needsSeverity: 'high',
    roadStatus: 'Slow',
    roadImpassable: false,
    impassableEdgeId: null,
    confidence: 0.89,
    status: 'pending',
    createdAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    latitude: 10.2688,
    longitude: 123.8412
  },
  {
    id: 'fr-8',
    barangayId: 'b-inayawan',
    barangayName: 'Inayawan',
    reporterName: '+63920******11 (SMS)',
    source: 'sms',
    rawText: 'HELP: Coastal garbage heap sliding. High water has washed waste piles into the residential streets. Bad odor, high pathogen risk. Need masks, disinfectant, and water filters.',
    populationEstimate: 180,
    needsSeverity: 'critical',
    roadStatus: 'Blocked',
    roadImpassable: true,
    impassableEdgeId: 'edge-pardo-inayawan',
    confidence: 0.84,
    status: 'pending',
    createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    latitude: 10.2612,
    longitude: 123.8590
  },
  {
    id: 'fr-9',
    barangayId: 'b-banilad',
    barangayName: 'Banilad',
    reporterName: 'Resident App (V-14)',
    source: 'app',
    rawText: 'Minor flooding near AS Fortuna. Traffic slowed down, but roads are passable. No major residential damages. Submitting for monitoring.',
    populationEstimate: 15,
    needsSeverity: 'low',
    roadStatus: 'Slow',
    roadImpassable: false,
    impassableEdgeId: null,
    confidence: 0.94,
    status: 'confirmed',
    createdAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
    latitude: 10.3440,
    longitude: 123.9160
  },
  {
    id: 'fr-10',
    barangayId: null,
    barangayName: 'Unknown (Boundary)',
    reporterName: 'Anonymous Call',
    source: 'sms',
    rawText: 'Spam alert: Free internet offers at local mall.',
    populationEstimate: 0,
    needsSeverity: 'low',
    roadStatus: 'Open',
    roadImpassable: false,
    impassableEdgeId: null,
    confidence: 0.12,
    status: 'flagged',
    createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    latitude: 10.3000,
    longitude: 123.9000
  },
  {
    id: 'fr-11',
    barangayId: 'b-tejero',
    barangayName: 'Tejero',
    reporterName: '+63917******99 (SMS)',
    source: 'sms',
    rawText: 'HIGH TIDE SEAWATER ENTERING SITIOS. Drainage backflow has filled streets with 2 feet of salty seawater. Family houses flooded. Drinking water is spoiled.',
    populationEstimate: 210,
    needsSeverity: 'high',
    roadStatus: 'Slow',
    roadImpassable: false,
    impassableEdgeId: null,
    confidence: 0.87,
    status: 'pending',
    createdAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    latitude: 10.3050,
    longitude: 123.9090
  },
  {
    id: 'fr-12',
    barangayId: 'b-labangon',
    barangayName: 'Labangon',
    reporterName: 'NLP System (Parsed)',
    source: 'parsed',
    rawText: 'River levels near Tres de Abril bridge are very high. Debris collecting at bridge supports. Water spilling into nearby roads. Local monitoring team deployed.',
    populationEstimate: 50,
    needsSeverity: 'medium',
    roadStatus: 'Slow',
    roadImpassable: false,
    impassableEdgeId: null,
    confidence: 0.91,
    status: 'confirmed',
    createdAt: new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
    latitude: 10.3032,
    longitude: 123.8760
  },
  {
    id: 'fr-13',
    barangayId: 'b-carreta',
    barangayName: 'Carreta',
    reporterName: 'Community Lead V-16',
    source: 'app',
    rawText: 'High winds damaged roofs of several makeshift homes near the cemetery area. Families seeking shelter under tarps. Tarpaulins, ropes, and family kits requested.',
    populationEstimate: 95,
    needsSeverity: 'medium',
    roadStatus: 'Open',
    roadImpassable: false,
    impassableEdgeId: null,
    confidence: 0.85,
    status: 'confirmed',
    createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    latitude: 10.3142,
    longitude: 123.9110
  },
  {
    id: 'fr-14',
    barangayId: 'b-talamban',
    barangayName: 'Talamban',
    reporterName: 'Local Monitor (V-05)',
    source: 'app',
    rawText: 'Floodwaters in low-lying agricultural zones have receded. Main roads fully clear. Commercial areas resumed operations.',
    populationEstimate: 0,
    needsSeverity: 'low',
    roadStatus: 'Open',
    roadImpassable: false,
    impassableEdgeId: null,
    confidence: 0.93,
    status: 'confirmed',
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    latitude: 10.3685,
    longitude: 123.9190
  }
];

// ─── Operational Response Teams (8 Teams) ────────────────────────────────────
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
    currentAssignment: 'Mambaling Evacuation',
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
  },
  {
    id: 'team-epsilon',
    name: 'Heavy Rescue Epsilon (4x4)',
    capacityKg: 1500,
    baseLocation: { lat: 10.3421, lng: 123.9142 },
    status: 'idle',
    type: '4x4'
  },
  {
    id: 'team-zeta',
    name: 'Supply Caravan Zeta (Truck)',
    capacityKg: 8000,
    baseLocation: { lat: 10.3341, lng: 123.9312 },
    status: 'dispatched',
    type: 'truck',
    currentAssignment: 'Subangdaku Flood relief',
    activeRouteId: 'route-5'
  },
  {
    id: 'team-eta',
    name: 'Coastal Response Eta (Boat)',
    capacityKg: 1000,
    baseLocation: { lat: 10.2905, lng: 123.8911 },
    status: 'idle',
    type: 'boat'
  },
  {
    id: 'team-theta',
    name: 'Talisay Medic Theta (Ambulance)',
    capacityKg: 400,
    baseLocation: { lat: 10.2580, lng: 123.8390 },
    status: 'maintenance',
    type: 'ambulance'
  }
];

// ─── Volunteer Personnel Network (18 Tracked Volunteers) ──────────────────────
export const mockVolunteers: Volunteer[] = [
  { id: 'v-1', name: 'Volunteer V-01', phone: '+63917******11', teamId: 'team-alpha', teamName: 'Rescue Alpha (4x4)', availability: 'busy', lastCheckIn: '10m ago', latitude: 10.3371, longitude: 123.9001 },
  { id: 'v-2', name: 'Volunteer V-02', phone: '+63917******22', teamId: 'team-gamma', teamName: 'Water Rescue Gamma (Boat)', availability: 'busy', lastCheckIn: '5m ago', latitude: 10.2912, longitude: 123.8805 },
  { id: 'v-3', name: 'Volunteer V-03', phone: '+63917******33', teamId: null, teamName: null, availability: 'available', lastCheckIn: '1h ago', latitude: 10.3160, longitude: 123.8860 },
  { id: 'v-4', name: 'Volunteer V-04', phone: '+63917******44', teamId: null, teamName: null, availability: 'available', lastCheckIn: '25m ago', latitude: 10.3230, longitude: 123.8840 },
  { id: 'v-5', name: 'Volunteer V-05', phone: '+63917******55', teamId: null, teamName: null, availability: 'offline', lastCheckIn: '4h ago', latitude: 10.3690, longitude: 123.9170 },
  { id: 'v-6', name: 'Volunteer V-06', phone: '+63918******11', teamId: 'team-delta', teamName: 'Medic Delta (Ambulance)', availability: 'busy', lastCheckIn: '2m ago', latitude: 10.2950, longitude: 123.8990 },
  { id: 'v-7', name: 'Volunteer V-07', phone: '+63918******22', teamId: 'team-zeta', teamName: 'Supply Caravan Zeta (Truck)', availability: 'busy', lastCheckIn: '15m ago', latitude: 10.3295, longitude: 123.9280 },
  { id: 'v-8', name: 'Volunteer V-08', phone: '+63918******33', teamId: null, teamName: null, availability: 'available', lastCheckIn: '10m ago', latitude: 10.3025, longitude: 123.8732 },
  { id: 'v-9', name: 'Volunteer V-09', phone: '+63918******44', teamId: null, teamName: null, availability: 'available', lastCheckIn: '3h ago', latitude: 10.3205, longitude: 123.8815 },
  { id: 'v-10', name: 'Volunteer V-10', phone: '+63918******55', teamId: null, teamName: null, availability: 'offline', lastCheckIn: '1d ago', latitude: 10.2580, longitude: 123.8390 },
  { id: 'v-11', name: 'Volunteer V-11', phone: '+63919******11', teamId: null, teamName: null, availability: 'available', lastCheckIn: '8m ago', latitude: 10.2980, longitude: 123.8670 },
  { id: 'v-12', name: 'Volunteer V-12', phone: '+63919******22', teamId: null, teamName: null, availability: 'available', lastCheckIn: '30m ago', latitude: 10.2690, longitude: 123.8440 },
  { id: 'v-13', name: 'Volunteer V-13', phone: '+63919******33', teamId: null, teamName: null, availability: 'busy', lastCheckIn: '12m ago', latitude: 10.2635, longitude: 123.8560 },
  { id: 'v-14', name: 'Volunteer V-14', phone: '+63919******44', teamId: null, teamName: null, availability: 'available', lastCheckIn: '5m ago', latitude: 10.3425, longitude: 123.9150 },
  { id: 'v-15', name: 'Volunteer V-15', phone: '+63919******55', teamId: null, teamName: null, availability: 'offline', lastCheckIn: '2d ago', latitude: 10.3120, longitude: 123.9130 },
  { id: 'v-16', name: 'Volunteer V-16', phone: '+63920******11', teamId: null, teamName: null, availability: 'available', lastCheckIn: '4m ago', latitude: 10.3140, longitude: 123.9100 },
  { id: 'v-17', name: 'Volunteer V-17', phone: '+63920******22', teamId: null, teamName: null, availability: 'available', lastCheckIn: '50m ago', latitude: 10.3055, longitude: 123.9075 },
  { id: 'v-18', name: 'Volunteer V-18', phone: '+63920******33', teamId: null, teamName: null, availability: 'available', lastCheckIn: '1h ago', latitude: 10.2780, longitude: 123.8490 }
];

// ─── Cebu Road Interconnections (18 Road Edges) ──────────────────────────────
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
  },
  {
    id: 'edge-city-labangon',
    name: 'Tres de Abril (Labangon side)',
    sourceNode: 'City Center',
    targetNode: 'Labangon Centroid',
    sourceCoords: { lat: 10.3157, lng: 123.8854 },
    targetCoords: { lat: 10.3015, lng: 123.8741 },
    status: 'open',
    lengthM: 1800
  },
  {
    id: 'edge-labangon-tisa',
    name: 'Tisa-Labangon Connect',
    sourceNode: 'Labangon Centroid',
    targetNode: 'Tisa Centroid',
    sourceCoords: { lat: 10.3015, lng: 123.8741 },
    targetCoords: { lat: 10.2985, lng: 123.8680 },
    status: 'slow',
    lengthM: 1200,
    notes: 'Partial hillside mud slides, traffic slowed down.'
  },
  {
    id: 'edge-tisa-bulacao',
    name: 'Tisa Hill Bypass Rd',
    sourceNode: 'Tisa Centroid',
    targetNode: 'Bulacao Centroid',
    sourceCoords: { lat: 10.2985, lng: 123.8680 },
    targetCoords: { lat: 10.2701, lng: 123.8456 },
    status: 'open',
    lengthM: 3400
  },
  {
    id: 'edge-pardo-inayawan',
    name: 'Pardo Coastal Connect',
    sourceNode: 'Pardo Centroid',
    targetNode: 'Inayawan Centroid',
    sourceCoords: { lat: 10.2778, lng: 123.8488 },
    targetCoords: { lat: 10.2642, lng: 123.8569 },
    status: 'blocked',
    lengthM: 1900,
    notes: 'Coastal garbage slide blocking access'
  },
  {
    id: 'edge-bulacao-pardo',
    name: 'Bulacao-Pardo Trunk Line',
    sourceNode: 'Bulacao Centroid',
    targetNode: 'Pardo Centroid',
    sourceCoords: { lat: 10.2701, lng: 123.8456 },
    targetCoords: { lat: 10.2778, lng: 123.8488 },
    status: 'open',
    lengthM: 1500
  },
  {
    id: 'edge-city-carreta',
    name: 'Carreta Boulevard',
    sourceNode: 'City Center',
    targetNode: 'Carreta Centroid',
    sourceCoords: { lat: 10.3157, lng: 123.8854 },
    targetCoords: { lat: 10.3129, lng: 123.9125 },
    status: 'open',
    lengthM: 2800
  },
  {
    id: 'edge-carreta-tejero',
    name: 'Carreta-Tejero Alley connect',
    sourceNode: 'Carreta Centroid',
    targetNode: 'Tejero Centroid',
    sourceCoords: { lat: 10.3129, lng: 123.9125 },
    targetCoords: { lat: 10.3061, lng: 123.9082 },
    status: 'slow',
    lengthM: 1100,
    notes: 'Drainage overflows, small vehicles take detour.'
  },
  {
    id: 'edge-tejero-pasil',
    name: 'Coastal Promenade connect',
    sourceNode: 'Tejero Centroid',
    targetNode: 'Pasil Centroid',
    sourceCoords: { lat: 10.3061, lng: 123.9082 },
    targetCoords: { lat: 10.2917, lng: 123.8936 },
    status: 'open',
    lengthM: 2200
  },
  {
    id: 'edge-lahug-banilad',
    name: 'Lahug-Banilad Overpass Line',
    sourceNode: 'Lahug Centroid',
    targetNode: 'Banilad Centroid',
    sourceCoords: { lat: 10.3382, lng: 123.9016 },
    targetCoords: { lat: 10.3421, lng: 123.9142 },
    status: 'open',
    lengthM: 1700
  },
  {
    id: 'edge-banilad-subangdaku',
    name: 'A.S. Fortuna Access',
    sourceNode: 'Banilad Centroid',
    targetNode: 'Subangdaku Centroid',
    sourceCoords: { lat: 10.3421, lng: 123.9142 },
    targetCoords: { lat: 10.3289, lng: 123.9298 },
    status: 'open',
    lengthM: 2200
  }
];

// ─── Realistically Curved Routing Paths (6 Routes) ───────────────────────────
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
    teamId: 'team-zeta',
    teamName: 'Supply Caravan Zeta (Truck)',
    status: 'active',
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
  },
  {
    id: 'route-6',
    teamId: 'team-epsilon',
    teamName: 'Heavy Rescue Epsilon (4x4)',
    status: 'planned',
    totalDistanceM: 5800,
    stops: [
      { sequence: 1, barangayId: 'b-tisa', barangayName: 'Tisa', action: 'Landslide Debris Extraction' },
      { sequence: 2, barangayId: 'b-bulacao', barangayName: 'Bulacao', action: 'Support Mud Displacement evacuation' }
    ],
    path: generateRealisticRoute([
      { lat: 10.3421, lng: 123.9142 }, // Banilad logistics outpost start
      { lat: 10.3157, lng: 123.8854 }, // City center transit
      { lat: 10.3015, lng: 123.8741 }, // Labangon transit
      { lat: 10.2985, lng: 123.8680 }, // Tisa centroid stop
      { lat: 10.2840, lng: 123.8550 }, // Hillside descent approach
      { lat: 10.2701, lng: 123.8456 }  // Bulacao centroid stop
    ], 14)
  }
];

// ─── Impact Predictions (All 16 Barangays mapped) ────────────────────────────
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
  },
  'b-banilad': {
    barangayId: 'b-banilad',
    model: 'TabPFN v2',
    predictedAffected: 110,
    damageSeverity: 'minor',
    confidence: 'moderate',
    overrideValue: null,
    contributors: ['Commercial street drainage backup', 'Slow road accessibility']
  },
  'b-labangon': {
    barangayId: 'b-labangon',
    model: 'TabPFN v2',
    predictedAffected: 420,
    damageSeverity: 'moderate',
    confidence: 'moderate',
    overrideValue: null,
    contributors: ['High population density', 'River overflow approach']
  },
  'b-tisa': {
    barangayId: 'b-tisa',
    model: 'TabPFN v2',
    predictedAffected: 510,
    damageSeverity: 'moderate',
    confidence: 'moderate',
    overrideValue: null,
    contributors: ['Hillside flash runoffs', 'Blocked connectors']
  },
  'b-bulacao': {
    barangayId: 'b-bulacao',
    model: 'TabPFN v2',
    predictedAffected: 380,
    damageSeverity: 'moderate',
    confidence: 'moderate',
    overrideValue: null,
    contributors: ['Hillside structural slope fractures', 'Mud displacement warnings']
  },
  'b-inayawan': {
    barangayId: 'b-inayawan',
    model: 'TabPFN v2',
    predictedAffected: 980,
    damageSeverity: 'severe',
    confidence: 'high',
    overrideValue: null,
    contributors: ['Waste pile slide hazards', 'Tidal surge overwash', 'Clogged drainage routes']
  },
  'b-pardo': {
    barangayId: 'b-pardo',
    model: 'TabPFN v2',
    predictedAffected: 190,
    damageSeverity: 'minor',
    confidence: 'moderate',
    overrideValue: null,
    contributors: ['Inayawan boundary overflow', 'Slight structural wind damage']
  },
  'b-carreta': {
    barangayId: 'b-carreta',
    model: 'TabPFN v2',
    predictedAffected: 310,
    damageSeverity: 'moderate',
    confidence: 'moderate',
    overrideValue: null,
    contributors: ['High density informal settlement risks', 'Low-lying drainage overflow']
  },
  'b-tejero': {
    barangayId: 'b-tejero',
    model: 'TabPFN v2',
    predictedAffected: 780,
    damageSeverity: 'severe',
    confidence: 'high',
    overrideValue: null,
    contributors: ['Coastal storm tide backups', 'Severe seawall spillages', 'High density index']
  }
};

// ─── Supply Manifest Generation (Sphere Standards) ───────────────────────────
export function getSphereManifest(barangayId: string, affectedPeople: number): SupplyManifest {
  const waterReq = affectedPeople * 15 * 3;
  const foodReq = affectedPeople * 1 * 3;
  const hygieneReq = Math.ceil(affectedPeople * 0.2);
  const medicalReq = Math.ceil(affectedPeople * 0.1);
  const shelterReq = Math.ceil(affectedPeople * 0.2);

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

// ─── Silent Area Scoring Logic ────────────────────────────────────────────────
export function computeSilentAreaScores(
  barangays: Barangay[],
  tauHours: number = 24
): { barangayId: string; score: number; hoursSinceContact: number | null; timeFactor: number; popDensityNorm: number; hazardNorm: number }[] {
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
      timeFactor,
      popDensityNorm,
      hazardNorm
    };
  });
}