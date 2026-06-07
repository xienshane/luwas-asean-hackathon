'use client';

import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Package, 
  Navigation, 
  Sliders, 
  TrendingUp, 
  Check, 
  X, 
  Layers, 
  AlertTriangle, 
  Clock, 
  Truck, 
  Archive, 
  Info,
  ChevronRight,
  Database,
  Building,
  UserCheck
} from 'lucide-react';
import { 
  Barangay, 
  ImpactPrediction, 
  SupplyManifest, 
  Team, 
  Route, 
  LocationHub,
  HistoricalIncident,
  mockLocationHubs,
  mockHistoricalIncidents,
  getSphereManifest
} from '@/lib/mockData';

interface RightIntelligencePanelProps {
  selectedBarangay: Barangay | null;
  barangays: Barangay[];
  reportsCount: number;
  scores: { barangayId: string; score: number; hoursSinceContact: number | null }[];
  prediction: ImpactPrediction | undefined;
  manifest: SupplyManifest | undefined;
  teams: Team[];
  routes: Route[];
  onSaveOverrides: (
    barangayId: string, 
    affectedOverride: number | null, 
    suppliesOverride: { waterL?: number; foodPacks?: number; shelterKits?: number; blankets?: number } | null
  ) => void;
  onUpdateManifestStatus: (barangayId: string, status: 'approved' | 'modified' | 'rejected') => void;
  onDispatchTeam: (teamId: string, barangayId: string) => void;
  onClearBarangaySelection: () => void;
}

export default function RightIntelligencePanel({
  selectedBarangay,
  barangays,
  reportsCount,
  scores,
  prediction,
  manifest,
  teams,
  routes,
  onSaveOverrides,
  onUpdateManifestStatus,
  onDispatchTeam,
  onClearBarangaySelection
}: RightIntelligencePanelProps) {
  // Drawer Tab State inside Silent Area Action drawer
  const [drawerTab, setDrawerTab] = useState<'overview' | 'supplies' | 'dispatch'>('overview');
  
  // Custom manual override form states
  const [isEditing, setIsEditing] = useState(false);
  const [affectedInput, setAffectedInput] = useState('');
  const [waterInput, setWaterInput] = useState('');
  const [foodInput, setFoodInput] = useState('');
  const [hygieneInput, setHygieneInput] = useState('');
  const [medicalInput, setMedicalInput] = useState('');
  const [shelterInput, setShelterInput] = useState('');

  // Sync state with selected barangay
  useEffect(() => {
    if (selectedBarangay) {
      setAffectedInput(prediction?.overrideValue?.toString() || '');
      setWaterInput('');
      setFoodInput('');
      setHygieneInput('');
      setMedicalInput('');
      setShelterInput('');
      setIsEditing(false);
    }
  }, [selectedBarangay, prediction]);

  // Priority response areas ranking (Standard View)
  const getPriorityRankings = () => {
    return barangays
      .map(b => {
        const s = scores.find(score => score.barangayId === b.id) || { score: 0 };
        const pred = prediction; // just to reference
        return {
          ...b,
          score: s.score
        };
      })
      .sort((a, b) => b.score - a.score);
  };

  const getRiskLevel = (score: number) => {
    if (score >= 0.7) return 'Critical Silence';
    if (score >= 0.4) return 'High Risk';
    if (score >= 0.2) return 'Watch';
    return 'Normal';
  };

  const handleSaveOverrides = () => {
    const overrideVal = affectedInput.trim() === '' ? null : parseInt(affectedInput, 10);
    
    // Package custom overrides
    const overrides = {
      waterL: waterInput ? parseInt(waterInput, 10) : undefined,
      foodPacks: foodInput ? parseInt(foodInput, 10) : undefined,
      hygieneKits: hygieneInput ? parseInt(hygieneInput, 10) : undefined,
      medicalSupplies: medicalInput ? parseInt(medicalInput, 10) : undefined,
      shelterMaterials: shelterInput ? parseInt(shelterInput, 10) : undefined
    };

    onSaveOverrides(
      selectedBarangay!.id, 
      overrideVal, 
      (overrides.waterL || overrides.foodPacks || overrides.hygieneKits || overrides.medicalSupplies || overrides.shelterMaterials) ? overrides : null
    );
    setIsEditing(false);
  };

  // 1. STANDARD VIEW (when no barangay is selected)
  if (!selectedBarangay) {
    const priorityAreas = getPriorityRankings();

    return (
      <div className="w-[320px] h-full bg-slate-950 border-l border-slate-800 flex flex-col overflow-hidden text-xs select-none">
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="text-teal-400 w-4 h-4" />
            <h3 className="font-bold text-[11px] uppercase tracking-wider text-slate-300">Decision Workspace</h3>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Priority Response Areas list */}
          <div className="space-y-2">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Priority Response Areas</span>
            <div className="space-y-1.5">
              {priorityAreas.slice(0, 3).map((area, index) => (
                <div key={area.id} className="bg-slate-900 border border-slate-800/80 p-2.5 rounded-lg flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-200">{area.name}</h4>
                    <span className="text-[9px] text-slate-500">{area.cityMunicipality}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 font-mono text-slate-400">
                      Rank {index + 1}
                    </span>
                    <span className="block text-[8px] text-teal-500 font-semibold mt-1">Score: {area.score.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Info message */}
          <div className="bg-slate-900/40 border border-slate-850 p-3 rounded-lg flex gap-2 text-slate-500 leading-relaxed text-[11px]">
            <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <span>Select a highlighted barangay node from the Live Operations Map to audit Sphere relief requirements, trigger OR-Tools dispatches, or manage manual overrides.</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. ACTIVE SILENT AREA ACTION DRAWER
  const selectedScore = scores.find((item) => item.barangayId === selectedBarangay.id) || { score: 0, hoursSinceContact: null };
  const activePredictions = prediction;
  const activeManifest = manifest;
  const activeManifestOverrides = activeManifest?.overridden;
  const manifestOverrides =
    activeManifestOverrides && typeof activeManifestOverrides === 'object'
      ? activeManifestOverrides as {
          waterL?: number;
          foodPacks?: number;
          hygieneKits?: number;
          medicalSupplies?: number;
          shelterMaterials?: number;
        }
      : undefined;

  const isAffectedOverridden = activePredictions?.overrideValue !== null && activePredictions?.overrideValue !== undefined;
  const effectiveAffected = isAffectedOverridden ? activePredictions!.overrideValue! : (activePredictions?.predictedAffected || 0);

  const sphereBaseline = getSphereManifest(selectedBarangay.id, effectiveAffected);

  const finalWater = manifestOverrides?.waterL !== undefined ? manifestOverrides.waterL : sphereBaseline.waterL.recommended;
  const finalFood = manifestOverrides?.foodPacks !== undefined ? manifestOverrides.foodPacks : sphereBaseline.foodPacks.recommended;
  const finalHygiene = manifestOverrides?.hygieneKits !== undefined ? manifestOverrides.hygieneKits : sphereBaseline.hygieneKits.recommended;
  const finalMedical = manifestOverrides?.medicalSupplies !== undefined ? manifestOverrides.medicalSupplies : sphereBaseline.medicalSupplies.recommended;
  const finalShelter = manifestOverrides?.shelterMaterials !== undefined ? manifestOverrides.shelterMaterials : sphereBaseline.shelterMaterials.recommended;

  const historicalIncidents = mockHistoricalIncidents[selectedBarangay.id] || [];

  return (
    <div className="w-[320px] h-full bg-slate-950 border-l border-slate-800 flex flex-col overflow-hidden text-xs select-none">
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[9px] text-teal-400 font-bold uppercase tracking-wider">Silent Area Action Drawer</span>
          <h3 className="font-bold text-slate-200 text-sm mt-0.5">{selectedBarangay.name} Region</h3>
        </div>
        <button 
          onClick={onClearBarangaySelection}
          className="text-slate-500 hover:text-slate-300 p-1 border border-slate-800 hover:border-slate-700 bg-slate-900 rounded cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Drawer Sub Navigation Tabs */}
      <div className="flex bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 font-bold">
        <button
          onClick={() => setDrawerTab('overview')}
          className={`flex-1 py-2 text-center border-b-2 cursor-pointer transition-colors ${
            drawerTab === 'overview' ? 'border-teal-500 text-teal-400 bg-slate-950/20' : 'border-transparent hover:text-slate-200'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setDrawerTab('supplies')}
          className={`flex-1 py-2 text-center border-b-2 cursor-pointer transition-colors ${
            drawerTab === 'supplies' ? 'border-teal-500 text-teal-400 bg-slate-950/20' : 'border-transparent hover:text-slate-200'
          }`}
        >
          Supplies
        </button>
        <button
          onClick={() => setDrawerTab('dispatch')}
          className={`flex-1 py-2 text-center border-b-2 cursor-pointer transition-colors ${
            drawerTab === 'dispatch' ? 'border-teal-500 text-teal-400 bg-slate-950/20' : 'border-transparent hover:text-slate-200'
          }`}
        >
          Route & Dispatch
        </button>
      </div>

      {/* Drawer Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ================= TAB 1: OVERVIEW ================= */}
        {drawerTab === 'overview' && (
          <div className="space-y-4">
            {/* Barangay Telemetry */}
            <div className="space-y-2 bg-slate-900/40 border border-slate-850 p-3 rounded-lg">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Region Telemetry</span>
              
              <div className="grid grid-cols-2 gap-2.5 font-mono text-[11px] text-slate-400">
                <div>
                  <span className="block text-[8px] uppercase font-bold text-slate-500">Municipality</span>
                  <span className="text-slate-200 font-semibold">{selectedBarangay.cityMunicipality}</span>
                </div>
                <div>
                  <span className="block text-[8px] uppercase font-bold text-slate-500">Population</span>
                  <span className="text-slate-200 font-semibold">{selectedBarangay.population.toLocaleString()}</span>
                </div>
                <div>
                  <span className="block text-[8px] uppercase font-bold text-slate-500">Silent Area Score</span>
                  <span className="text-red-400 font-semibold">{selectedScore.score.toFixed(2)}</span>
                </div>
                <div>
                  <span className="block text-[8px] uppercase font-bold text-slate-500">Risk Level</span>
                  <span className="text-red-400 font-semibold">{getRiskLevel(selectedScore.score)}</span>
                </div>
              </div>
            </div>

            {/* Impact predictions panel */}
            <div className="space-y-2 bg-slate-900/40 border border-slate-850 p-3 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">TabPFN Impact predictions</span>
                <span className="text-[9px] bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800 text-slate-400">
                  Conf: {activePredictions?.confidence || 'moderate'}
                </span>
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className={`text-xl font-bold tracking-tight ${isAffectedOverridden ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                  {activePredictions?.predictedAffected.toLocaleString() || '0'}
                </span>
                <span className="text-[9px] text-slate-500">EST. POPULATION AFFECTED</span>
              </div>

              {isAffectedOverridden && (
                <div className="flex items-center justify-between bg-teal-950/20 border border-teal-900/40 p-2 rounded text-[10.5px] text-teal-300">
                  <span className="flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" /> Overridden:</span>
                  <span className="font-bold">{activePredictions?.overrideValue?.toLocaleString()} People</span>
                </div>
              )}

              {/* Contributors list */}
              {activePredictions?.contributors && (
                <div className="mt-2 pt-2 border-t border-slate-800">
                  <span className="block text-[8px] uppercase font-bold text-slate-500 mb-1">Risk Contributors</span>
                  <ul className="list-disc pl-3 text-[10px] text-slate-400 space-y-0.5">
                    {activePredictions.contributors.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Historical Incident History */}
            {historicalIncidents.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Historical incident logs</span>
                <div className="space-y-1.5">
                  {historicalIncidents.map((inc) => (
                    <div key={inc.id} className="bg-slate-950 border border-slate-850 p-2 rounded flex items-center justify-between text-[10.5px]">
                      <div>
                        <span className="font-bold text-slate-400">{inc.year} - {inc.event}</span>
                        <span className="block text-[9px] text-slate-500 mt-0.5">Affected: {inc.affectedCount} persons</span>
                      </div>
                      <span className="text-[8px] bg-slate-900 border border-slate-850 px-1 py-0.2 rounded font-semibold capitalize text-slate-400">
                        {inc.damageSeverity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: SUPPLIES ================= */}
        {drawerTab === 'supplies' && (
          <div className="space-y-4">
            {/* Sphere Relief supplies details */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                <span>Sphere relief manifests</span>
                <span>3-Day Ration target</span>
              </div>

              {/* Supplies Grid */}
              <div className="space-y-1.5 text-[10.5px]">
                {/* Water */}
                <div className="bg-slate-900/60 border border-slate-850 p-2.5 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-300">Clean Drinking Water</span>
                    <span className="block text-[8px] text-slate-500 mt-0.5">Inv: {sphereBaseline.waterL.inventory.toLocaleString()} L</span>
                  </div>
                  <span className="font-bold text-teal-400">{finalWater.toLocaleString()} Liters</span>
                </div>

                {/* Food */}
                <div className="bg-slate-900/60 border border-slate-850 p-2.5 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-300">Emergency Food Packs</span>
                    <span className="block text-[8px] text-slate-500 mt-0.5">Inv: {sphereBaseline.foodPacks.inventory.toLocaleString()} packs</span>
                  </div>
                  <span className="font-bold text-teal-400">{finalFood.toLocaleString()} Packs</span>
                </div>

                {/* Hygiene Kits */}
                <div className="bg-slate-900/60 border border-slate-850 p-2.5 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-300">Standard Hygiene Kits</span>
                    <span className="block text-[8px] text-slate-500 mt-0.5">Inv: {sphereBaseline.hygieneKits.inventory.toLocaleString()} kits</span>
                  </div>
                  <span className="font-bold text-teal-400">{finalHygiene.toLocaleString()} Kits</span>
                </div>

                {/* Medical */}
                <div className="bg-slate-900/60 border border-slate-850 p-2.5 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-300">Medical Supplies</span>
                    <span className="block text-[8px] text-slate-500 mt-0.5">Inv: {sphereBaseline.medicalSupplies.inventory.toLocaleString()} packs</span>
                  </div>
                  <span className="font-bold text-teal-400">{finalMedical.toLocaleString()} Packs</span>
                </div>

                {/* Shelter */}
                <div className="bg-slate-900/60 border border-slate-850 p-2.5 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-300">Shelter / Tarps Materials</span>
                    <span className="block text-[8px] text-slate-500 mt-0.5">Inv: {sphereBaseline.shelterMaterials.inventory.toLocaleString()} units</span>
                  </div>
                  <span className="font-bold text-teal-400">{finalShelter.toLocaleString()} Units</span>
                </div>
              </div>
            </div>

            {/* Overrides / Approve actions */}
            <div className="space-y-2.5 bg-slate-900/40 border border-slate-850 p-3 rounded-lg">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="w-full py-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-900 font-bold rounded flex items-center justify-between px-2.5 cursor-pointer text-[10px]"
              >
                <span>COORDINATOR OVERRIDES</span>
                <span className="text-[9px] text-slate-500">{isEditing ? 'Collapse' : 'Configure Override'}</span>
              </button>

              {isEditing && (
                <div className="space-y-2 mt-2 pt-2 border-t border-slate-800 text-[10.5px]">
                  <div>
                    <label className="block text-[8.5px] uppercase font-bold text-slate-500 mb-1">Override Affected Pop</label>
                    <input
                      type="number"
                      value={affectedInput}
                      onChange={(e) => setAffectedInput(e.target.value)}
                      placeholder={activePredictions?.predictedAffected.toString()}
                      className="w-full bg-slate-950 border border-slate-800 p-1 rounded text-slate-300 text-xs focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="block text-[8px] uppercase font-bold text-slate-500 mb-0.5">Water (L)</label>
                      <input
                        type="number"
                        value={waterInput}
                        onChange={(e) => setWaterInput(e.target.value)}
                        placeholder={sphereBaseline.waterL.recommended.toString()}
                        className="w-full bg-slate-950 border border-slate-800 p-1 rounded text-slate-300 text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] uppercase font-bold text-slate-500 mb-0.5">Food (Packs)</label>
                      <input
                        type="number"
                        value={foodInput}
                        onChange={(e) => setFoodInput(e.target.value)}
                        placeholder={sphereBaseline.foodPacks.recommended.toString()}
                        className="w-full bg-slate-950 border border-slate-800 p-1 rounded text-slate-300 text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] uppercase font-bold text-slate-500 mb-0.5">Hygiene (Kits)</label>
                      <input
                        type="number"
                        value={hygieneInput}
                        onChange={(e) => setHygieneInput(e.target.value)}
                        placeholder={sphereBaseline.hygieneKits.recommended.toString()}
                        className="w-full bg-slate-950 border border-slate-800 p-1 rounded text-slate-300 text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] uppercase font-bold text-slate-500 mb-0.5">Shelter (Units)</label>
                      <input
                        type="number"
                        value={shelterInput}
                        onChange={(e) => setShelterInput(e.target.value)}
                        placeholder={sphereBaseline.shelterMaterials.recommended.toString()}
                        className="w-full bg-slate-950 border border-slate-800 p-1 rounded text-slate-300 text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSaveOverrides}
                    className="w-full py-1.5 bg-teal-900 hover:bg-teal-850 border border-teal-800 text-teal-200 font-bold rounded cursor-pointer"
                  >
                    Apply Custom Overrides
                  </button>
                </div>
              )}

              {/* Sphere manifest gate: HUMAN OVERSIGHT */}
              <div className="flex items-center gap-1.5 border-t border-slate-850 pt-3 text-[10px] text-slate-500 select-none">
                <button
                  onClick={() => onUpdateManifestStatus(selectedBarangay.id, 'approved')}
                  className="flex-1 py-1.5 bg-teal-900/80 hover:bg-teal-850 border border-teal-850 text-teal-200 hover:text-white font-bold rounded cursor-pointer transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => onUpdateManifestStatus(selectedBarangay.id, 'rejected')}
                  className="px-2.5 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 hover:text-white font-bold rounded cursor-pointer transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: DISPATCH ================= */}
        {drawerTab === 'dispatch' && (
          <div className="space-y-4">
            {/* Route planning stats */}
            <div className="space-y-2 bg-slate-900/40 border border-slate-850 p-3 rounded-lg">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Nearest Logistics Hubs</span>
              <div className="space-y-1.5">
                {mockLocationHubs.slice(0, 3).map((hub) => (
                  <div key={hub.id} className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-950 pb-1">
                    <span className="font-semibold text-slate-300">{hub.name}</span>
                    <span className="text-[9px] bg-slate-950 border border-slate-850 px-1 py-0.2 rounded font-mono text-slate-500">
                      Cap: {hub.capacityPercent}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Team Dispatch Options */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                <span>Available response teams</span>
                <span>Decision gate required</span>
              </div>

              <div className="space-y-1.5 text-[10.5px]">
                {teams.filter(t => t.status === 'active' || t.status === 'idle').map((team) => (
                  <div key={team.id} className="bg-slate-900 border border-slate-850 p-2 rounded-lg flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-slate-300">{team.name}</h5>
                      <span className="block text-[8px] text-slate-500 mt-0.5">Cargo: {team.capacityKg} kg</span>
                    </div>

                    <button
                      onClick={() => onDispatchTeam(team.id, selectedBarangay.id)}
                      className="px-2.5 py-1 bg-teal-900/80 hover:bg-teal-850 border border-teal-850 text-teal-200 hover:text-white font-bold rounded cursor-pointer transition-colors text-[9px]"
                    >
                      Dispatch
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Optimizer disclaimer */}
            <div className="bg-slate-950 border border-slate-850 p-2.5 rounded flex gap-1.5 text-slate-500 text-[10px] items-start select-none">
              <Cpu className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
              <span>OR-Tools route optimizer generates ETA based on current road blocks and pgRouting matrices. Human dispatch triggers are required. No automatic dispatches are executed.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
