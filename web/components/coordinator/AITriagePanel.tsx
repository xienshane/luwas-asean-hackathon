'use client';

import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  HelpCircle, 
  RefreshCw, 
  Save, 
  ShieldAlert, 
  Truck, 
  UserCheck, 
  Info, 
  Sliders 
} from 'lucide-react';

// Define types locally if not available from imports
export interface Barangay {
  id: string;
  name: string;
  region: string;
  population: number;
  coordinates: [number, number];
}

export interface ImpactPrediction {
  barangayId: string;
  predictedAffected: number;
  damageSeverity: 'mild' | 'moderate' | 'severe';
  confidence: number;
  overrideValue?: number | null;
}

export interface SupplyManifest {
  barangayId: string;
  waterL: number;
  foodPacks: number;
  shelterKits: number;
  blankets: number;
  overridden?: {
    waterL?: number;
    foodPacks?: number;
    shelterKits?: number;
    blankets?: number;
  } | null;
}

export const getSphereManifest = (barangayId: string, affectedPopulation: number): SupplyManifest => {
  // Sphere standards: 15L water per person per day for 3 days = 45L per person
  // 1 food pack per person per day for 3 days = 3 packs per person
  // 1 shelter kit per 5 families (assuming 5 people per family)
  // 1 blanket per person
  
  const waterL = affectedPopulation * 45;
  const foodPacks = affectedPopulation * 3;
  const shelterKits = Math.ceil(affectedPopulation / 5);
  const blankets = affectedPopulation;
  
  return {
    barangayId,
    waterL,
    foodPacks,
    shelterKits,
    blankets,
    overridden: null
  };
};

interface AITriagePanelProps {
  barangay: Barangay | null;
  prediction: ImpactPrediction | undefined;
  manifest: SupplyManifest | undefined;
  onSaveOverrides: (
    barangayId: string, 
    affectedOverride: number | null, 
    suppliesOverride: { waterL?: number; foodPacks?: number; shelterKits?: number; blankets?: number } | null
  ) => void;
}

type SupplyOverrideManifest = {
  waterL?: number;
  foodPacks?: number;
  shelterKits?: number;
  blankets?: number;
};

export default function AITriagePanel({
  barangay,
  prediction,
  manifest,
  onSaveOverrides
}: AITriagePanelProps) {
  // Override form states
  const [affectedInput, setAffectedInput] = useState<string>('');
  const [waterInput, setWaterInput] = useState<string>('');
  const [foodInput, setFoodInput] = useState<string>('');
  const [shelterInput, setShelterInput] = useState<string>('');
  const [blanketInput, setBlanketInput] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);

  const overriddenManifest = typeof manifest?.overridden === 'object' && manifest?.overridden !== null
    ? manifest.overridden
    : undefined;

  // Sync inputs with predictions and manifests when barangay changes
  useEffect(() => {
    if (barangay) {
      setAffectedInput(prediction?.overrideValue?.toString() || '');
      setWaterInput(overriddenManifest?.waterL?.toString() || '');
      setFoodInput(overriddenManifest?.foodPacks?.toString() || '');
      setShelterInput(overriddenManifest?.shelterKits?.toString() || '');
      setBlanketInput(overriddenManifest?.blankets?.toString() || '');
      setIsEditing(false);
    }
  }, [barangay, prediction, manifest]);

  if (!barangay) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
        <Cpu className="w-12 h-12 text-indigo-500/50 mb-3 animate-pulse" />
        <h3 className="text-slate-300 font-semibold mb-1 text-sm uppercase tracking-wider">AI Triage & Logistics</h3>
        <p className="text-xs text-slate-500 max-w-[220px]">
          Select a priority barangay node from the map or listing to audit impact assessments and generate supply dispatches.
        </p>
      </div>
    );
  }

  // Calculate current effective affected population (override vs predicted)
  const isAffectedOverridden = prediction?.overrideValue !== null && prediction?.overrideValue !== undefined;
  const effectiveAffected = isAffectedOverridden 
    ? (prediction?.overrideValue ?? 0) 
    : (prediction?.predictedAffected ?? 0);

  // Get baseline Sphere calculations
  const sphereBaseline = getSphereManifest(barangay.id, effectiveAffected);

  // Calculate effective supplies (use override if available, otherwise baseline)
  const finalWater = overriddenManifest?.waterL !== undefined ? overriddenManifest.waterL : sphereBaseline.waterL;
  const finalFood = overriddenManifest?.foodPacks !== undefined ? overriddenManifest.foodPacks : sphereBaseline.foodPacks;
  const finalShelter = overriddenManifest?.shelterKits !== undefined ? overriddenManifest.shelterKits : sphereBaseline.shelterKits;
  const finalBlankets = overriddenManifest?.blankets !== undefined ? overriddenManifest.blankets : sphereBaseline.blankets;

  const isSuppliesOverridden = !!(
    overriddenManifest?.waterL !== undefined ||
    overriddenManifest?.foodPacks !== undefined ||
    overriddenManifest?.shelterKits !== undefined ||
    overriddenManifest?.blankets !== undefined
  );

  const handleSave = () => {
    const affectedVal = affectedInput.trim() === '' ? null : parseInt(affectedInput, 10);
    
    // Check if any supply values are overridden
    const wVal = waterInput.trim() === '' ? undefined : parseInt(waterInput, 10);
    const fVal = foodInput.trim() === '' ? undefined : parseInt(foodInput, 10);
    const sVal = shelterInput.trim() === '' ? undefined : parseInt(shelterInput, 10);
    const bVal = blanketInput.trim() === '' ? undefined : parseInt(blanketInput, 10);

    const hasAnyOverride = wVal !== undefined || fVal !== undefined || sVal !== undefined || bVal !== undefined;

    onSaveOverrides(
      barangay.id, 
      affectedVal, 
      hasAnyOverride ? { waterL: wVal, foodPacks: fVal, shelterKits: sVal, blankets: bVal } : null
    );
    setIsEditing(false);
  };

  const handleReset = () => {
    onSaveOverrides(barangay.id, null, null);
    setAffectedInput('');
    setWaterInput('');
    setFoodInput('');
    setShelterInput('');
    setBlanketInput('');
    setIsEditing(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Panel Header */}
      <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">AI Logistics Audit</h3>
            <span className="text-[10px] text-indigo-400 font-medium">{barangay.name} Region</span>
          </div>
        </div>
        
        {/* Reset Buttons */}
        {(isAffectedOverridden || isSuppliesOverridden) && (
          <button 
            onClick={handleReset}
            className="px-2 py-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-md border border-slate-700 flex items-center gap-1 transition-all"
          >
            <RefreshCw className="w-3 h-3" /> Clear Overrides
          </button>
        )}
      </div>

      {/* Panel Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Section 1: TabPFN Impact Assessment */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase">TabPFN v2 Prediction</span>
            <span className="text-[9px] bg-slate-900 text-slate-400 border border-slate-800 px-1.5 py-0.5 rounded">
              Confidence: {Math.round((prediction?.confidence || 0.85) * 100)}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/40">
              <span className="text-[9px] text-slate-500 block uppercase font-medium">Predicted Affected</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className={`text-lg font-bold tracking-tight ${isAffectedOverridden ? 'text-indigo-400 line-through decoration-1' : 'text-rose-400'}`}>
                  {prediction?.predictedAffected?.toLocaleString() || '0'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">people</span>
              </div>
            </div>
            
            <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/40">
              <span className="text-[9px] text-slate-500 block uppercase font-medium">Damage Severity</span>
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 mt-1.5 rounded-full capitalize tracking-wide ${
                prediction?.damageSeverity === 'severe' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                prediction?.damageSeverity === 'moderate' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              }`}>
                {prediction?.damageSeverity || 'unknown'}
              </span>
            </div>
          </div>

          {/* User Override Indicator */}
          {isAffectedOverridden && (
            <div className="bg-indigo-950/20 border border-indigo-900/40 p-2 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[10px] text-indigo-300 font-semibold uppercase">Coordinator Overridden</span>
              </div>
              <span className="text-xs font-bold text-indigo-400">
                {prediction?.overrideValue?.toLocaleString()} <span className="text-[9px] text-indigo-500">PEOPLE</span>
              </span>
            </div>
          )}
        </div>

        {/* Section 2: Sphere Humanitarian Manifest */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase">Sphere Supply Manifest</span>
              <div className="group relative">
                <HelpCircle className="w-3.5 h-3.5 text-slate-600 hover:text-slate-400 cursor-help" />
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-950 border border-slate-800 text-[9px] text-slate-400 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 z-30">
                  <p className="font-semibold text-slate-200 mb-0.5">Humanitarian Standards (3 Days):</p>
                  <ul className="list-disc pl-3 space-y-0.5">
                    <li>Water: 15L / person / day</li>
                    <li>Food: 2,100 kcal / person / day</li>
                    <li>Rations: 1 food pack / person / day</li>
                  </ul>
                </div>
              </div>
            </div>
            <span className="text-[9px] text-indigo-400 font-bold bg-indigo-950/30 border border-indigo-900/40 px-1.5 py-0.5 rounded">
              3-Day Emergency Ration
            </span>
          </div>

          {/* Sphere Supplies Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/50 flex flex-col justify-between">
              <span className="text-[9px] text-slate-500 block font-medium uppercase">Clean Water</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-sm font-bold text-blue-400">{finalWater.toLocaleString()}</span>
                <span className="text-[9px] text-slate-500 uppercase font-medium">Liters</span>
              </div>
              {overriddenManifest?.waterL !== undefined && (
                <span className="text-[8px] text-indigo-400 font-semibold uppercase mt-1">✓ Overridden</span>
              )}
            </div>

            <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/50 flex flex-col justify-between">
              <span className="text-[9px] text-slate-500 block font-medium uppercase">Food Packs</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-sm font-bold text-amber-500">{finalFood.toLocaleString()}</span>
                <span className="text-[9px] text-slate-500 uppercase font-medium">Packs</span>
              </div>
              {overriddenManifest?.foodPacks !== undefined && (
                <span className="text-[8px] text-indigo-400 font-semibold uppercase mt-1">✓ Overridden</span>
              )}
            </div>

            <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/50 flex flex-col justify-between">
              <span className="text-[9px] text-slate-500 block font-medium uppercase">Shelter Kits</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-sm font-bold text-emerald-400">{finalShelter.toLocaleString()}</span>
                <span className="text-[9px] text-slate-500 uppercase font-medium">Kits</span>
              </div>
              {overriddenManifest?.shelterKits !== undefined && (
                <span className="text-[8px] text-indigo-400 font-semibold uppercase mt-1">✓ Overridden</span>
              )}
            </div>

            <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/50 flex flex-col justify-between">
              <span className="text-[9px] text-slate-500 block font-medium uppercase">Blankets</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-sm font-bold text-indigo-400">{finalBlankets.toLocaleString()}</span>
                <span className="text-[9px] text-slate-500 uppercase font-medium">Units</span>
              </div>
              {overriddenManifest?.blankets !== undefined && (
                <span className="text-[8px] text-indigo-400 font-semibold uppercase mt-1">✓ Overridden</span>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Override Configuration Console */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-3">
          <button 
            onClick={() => setIsEditing(!isEditing)}
            className="w-full py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-[10px] text-slate-300 font-bold rounded-lg border border-slate-800 flex items-center justify-between transition-all"
          >
            <span className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              COORDINATOR INTERACTION CONSOLE
            </span>
            <span className="text-slate-500 text-[9px]">{isEditing ? 'Collapse' : 'Configure Override'}</span>
          </button>

          {isEditing && (
            <div className="space-y-3 pt-1 border-t border-slate-900 animate-fadeIn text-xs">
              <div className="bg-slate-900/30 p-2 rounded-lg text-[10px] text-slate-500 border border-slate-900 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>Entering custom fields forces an override on the deterministic AI models and recomputes the logistical requirements. Keep empty to revert to AI default.</span>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-[9px] font-semibold text-slate-500 uppercase mb-1">Override Affected Population</label>
                  <input 
                    type="number" 
                    value={affectedInput}
                    onChange={(e) => setAffectedInput(e.target.value)}
                    placeholder={prediction?.predictedAffected?.toString() || '0'}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1 px-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[8px] font-semibold text-slate-500 uppercase mb-1">Override Water (L)</label>
                    <input 
                      type="number" 
                      value={waterInput}
                      onChange={(e) => setWaterInput(e.target.value)}
                      placeholder={sphereBaseline.waterL.toString()}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1 px-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-semibold text-slate-500 uppercase mb-1">Override Food (Packs)</label>
                    <input 
                      type="number" 
                      value={foodInput}
                      onChange={(e) => setFoodInput(e.target.value)}
                      placeholder={sphereBaseline.foodPacks.toString()}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1 px-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-semibold text-slate-500 uppercase mb-1">Override Shelter (Kits)</label>
                    <input 
                      type="number" 
                      value={shelterInput}
                      onChange={(e) => setShelterInput(e.target.value)}
                      placeholder={sphereBaseline.shelterKits.toString()}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1 px-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-semibold text-slate-500 uppercase mb-1">Override Blankets</label>
                    <input 
                      type="number" 
                      value={blanketInput}
                      onChange={(e) => setBlanketInput(e.target.value)}
                      placeholder={sphereBaseline.blankets.toString()}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1 px-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>
                </div>
              </div>

              <button 
                onClick={handleSave}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-950/20 transition-all cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" /> Save Override Parameters
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}