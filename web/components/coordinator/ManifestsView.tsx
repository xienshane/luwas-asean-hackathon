'use client';

import React, { useState } from 'react';
import {
  Package,
  Droplets,
  UtensilsCrossed,
  HeartPulse,
  Home,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Truck,
  Check,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  Gauge,
  BarChart3
} from 'lucide-react';
import { SupplyManifest, Barangay, ImpactPrediction, getSphereManifest } from '@/lib/mockData';

interface ManifestsViewProps {
  barangays: Barangay[];
  manifests: Record<string, SupplyManifest>;
  predictions: Record<string, ImpactPrediction>;
  onUpdateManifestStatus: (barangayId: string, status: 'approved' | 'modified' | 'rejected') => void;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; style: string; label: string }> = {
  pending:  { icon: <Clock className="w-3.5 h-3.5" />,         style: 'bg-amber-950 border-amber-800 text-amber-300',  label: 'Pending'  },
  approved: { icon: <CheckCircle2 className="w-3.5 h-3.5" />,  style: 'bg-teal-950 border-teal-800 text-teal-300',    label: 'Approved' },
  modified: { icon: <AlertTriangle className="w-3.5 h-3.5" />, style: 'bg-blue-950 border-blue-800 text-blue-300',    label: 'Modified' },
  rejected: { icon: <XCircle className="w-3.5 h-3.5" />,       style: 'bg-red-950 border-red-800 text-red-400',       label: 'Rejected' },
};

const SUPPLY_ROWS = [
  { key: 'waterL',          label: 'Water',          unit: 'L',     icon: <Droplets       className="w-3.5 h-3.5 text-blue-400" /> },
  { key: 'foodPacks',       label: 'Food Packs',     unit: 'packs', icon: <UtensilsCrossed className="w-3.5 h-3.5 text-amber-400" /> },
  { key: 'hygieneKits',     label: 'Hygiene Kits',  unit: 'kits',  icon: <ShieldCheck    className="w-3.5 h-3.5 text-purple-400" /> },
  { key: 'medicalSupplies', label: 'Medical',        unit: 'packs', icon: <HeartPulse     className="w-3.5 h-3.5 text-red-400" /> },
  { key: 'shelterMaterials',label: 'Shelter',        unit: 'units', icon: <Home           className="w-3.5 h-3.5 text-teal-400" /> },
] as const;

type SupplyKey = typeof SUPPLY_ROWS[number]['key'];

export default function ManifestsView({
  barangays,
  manifests,
  predictions,
  onUpdateManifestStatus
}: ManifestsViewProps) {
  const [expandedBarangay, setExpandedBarangay] = useState<string | null>(null);

  // Compute metrics
  const pendingCount = Object.values(manifests).filter(m => m.status === 'pending').length;
  const approvedCount = Object.values(manifests).filter(m => m.status === 'approved').length;
  const rejectedCount = Object.values(manifests).filter(m => m.status === 'rejected').length;
  
  // Calculate total shortfalls
  const totalShortfalls = Object.values(manifests).reduce((sum, manifest) => {
    const manifestShortfall = SUPPLY_ROWS.reduce((rowSum, row) => {
      return rowSum + (manifest[row.key].shortfall || 0);
    }, 0);
    return sum + manifestShortfall;
  }, 0);

  // Calculate dispatch readiness (percentage of approved manifests)
  const totalManifests = Object.values(manifests).length;
  const dispatchReadiness = totalManifests > 0 ? (approvedCount / totalManifests) * 100 : 0;

  // Sort barangays by prediction severity and readiness
  const sorted = [...barangays].sort((a, b) => {
    const pa = predictions[a.id]?.predictedAffected ?? 0;
    const pb = predictions[b.id]?.predictedAffected ?? 0;
    const readinessA = manifests[a.id]?.status === 'approved' ? 1 : 0;
    const readinessB = manifests[b.id]?.status === 'approved' ? 1 : 0;
    // Prioritize pending and high impact
    if (readinessA !== readinessB) return readinessA - readinessB;
    return pb - pa;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Header with KPIs */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-950 border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-teal-900/80 p-2 rounded-lg">
              <Package className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h2 className="font-bold text-lg uppercase tracking-wider text-slate-200">Supply Manifests</h2>
              <p className="text-[10px] text-slate-500">Sphere Standard · 3-day emergency ration</p>
            </div>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">Last updated: {new Date().toLocaleTimeString()}</span>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2 text-center">
            <Clock className="w-4 h-4 text-amber-400 mx-auto mb-1" />
            <p className="text-[9px] text-slate-500 uppercase font-bold">Pending</p>
            <p className="text-xl font-bold text-amber-400">{pendingCount}</p>
          </div>
          <div className="bg-teal-950/20 border border-teal-800/30 rounded-lg p-2 text-center">
            <CheckCircle2 className="w-4 h-4 text-teal-400 mx-auto mb-1" />
            <p className="text-[9px] text-slate-500 uppercase font-bold">Approved</p>
            <p className="text-xl font-bold text-teal-400">{approvedCount}</p>
          </div>
          <div className="bg-red-950/20 border border-red-800/30 rounded-lg p-2 text-center">
            <XCircle className="w-4 h-4 text-red-400 mx-auto mb-1" />
            <p className="text-[9px] text-slate-500 uppercase font-bold">Rejected</p>
            <p className="text-xl font-bold text-red-400">{rejectedCount}</p>
          </div>
          <div className="bg-red-950/20 border border-red-800/30 rounded-lg p-2 text-center">
            <AlertTriangle className="w-4 h-4 text-red-400 mx-auto mb-1" />
            <p className="text-[9px] text-slate-500 uppercase font-bold">Total Shortfall</p>
            <p className="text-xl font-bold text-red-400">{totalShortfalls.toLocaleString()}</p>
          </div>
          <div className="bg-blue-950/20 border border-blue-800/30 rounded-lg p-2 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-blue-500/0 animate-pulse"></div>
            <Truck className="w-4 h-4 text-blue-400 mx-auto mb-1" />
            <p className="text-[9px] text-slate-500 uppercase font-bold">Dispatch Readiness</p>
            <p className="text-xl font-bold text-blue-400">{Math.round(dispatchReadiness)}%</p>
            <div className="w-full bg-slate-800 rounded-full h-0.5 mt-1">
              <div 
                className="bg-blue-500 h-0.5 rounded-full transition-all"
                style={{ width: `${dispatchReadiness}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {sorted.map(barangay => {
          const manifest = manifests[barangay.id];
          const pred = predictions[barangay.id];
          if (!manifest) return null;

          const effectiveAffected = pred?.overrideValue ?? pred?.predictedAffected ?? 0;
          const statusCfg = STATUS_CONFIG[manifest.status] ?? STATUS_CONFIG.pending;
          const hasShortfall = SUPPLY_ROWS.some(row => manifest[row.key].shortfall > 0);
          const isExpanded = expandedBarangay === barangay.id;
          const isCritical = pred?.damageSeverity === 'severe' || pred?.confidence === 'high';
          
          // Calculate overall readiness for this barangay
          const totalRecommended = SUPPLY_ROWS.reduce((sum, row) => sum + manifest[row.key].recommended, 0);
          const totalInventory = SUPPLY_ROWS.reduce((sum, row) => sum + manifest[row.key].inventory, 0);
          const readinessPercent = totalRecommended > 0 ? (totalInventory / totalRecommended) * 100 : 0;

          return (
            <div 
              key={barangay.id} 
              className={`bg-slate-900 border rounded-xl overflow-hidden transition-all ${
                isCritical && manifest.status === 'pending' 
                  ? 'border-red-500/50 ring-1 ring-red-500/30' 
                  : 'border-slate-800'
              }`}
            >
              {/* Card header */}
              <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-200">{barangay.name}</h3>
                      {isCritical && manifest.status === 'pending' && (
                        <span className="flex items-center gap-1 text-[9px] bg-red-950 border border-red-800 text-red-400 px-1.5 py-0.5 rounded font-bold">
                          <AlertOctagon className="w-2.5 h-2.5" /> CRITICAL
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500">{barangay.cityMunicipality} · Pop. {barangay.population.toLocaleString()}</p>
                  </div>
                  {hasShortfall && (
                    <span className="flex items-center gap-1 text-[10px] bg-red-950 border border-red-800 text-red-400 px-2 py-0.5 rounded font-bold">
                      <AlertTriangle className="w-2.5 h-2.5" /> Shortfall Detected
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Dispatch Readiness Indicator */}
                  <div className="text-right">
                    <div className="flex items-center gap-1">
                      <Gauge className="w-3 h-3 text-slate-500" />
                      <p className="text-[9px] text-slate-600 uppercase font-bold">Readiness</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <p className="text-slate-200 font-bold font-mono text-sm">{Math.round(readinessPercent)}%</p>
                      {readinessPercent >= 80 ? (
                        <TrendingUp className="w-3 h-3 text-teal-400" />
                      ) : readinessPercent < 50 ? (
                        <TrendingDown className="w-3 h-3 text-red-400" />
                      ) : null}
                    </div>
                    <div className="w-20 bg-slate-800 rounded-full h-1 mt-1">
                      <div 
                        className={`h-1 rounded-full transition-all ${
                          readinessPercent >= 80 ? 'bg-teal-500' : 
                          readinessPercent >= 50 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(100, readinessPercent)}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-right mr-2">
                    <p className="text-[9px] text-slate-600 uppercase font-bold">Est. Affected</p>
                    <p className="text-slate-200 font-bold font-mono text-sm">{effectiveAffected.toLocaleString()}</p>
                    {pred?.overrideValue != null && (
                      <p className="text-[9px] text-teal-500">coordinator override</p>
                    )}
                  </div>
                  <span className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${statusCfg.style}`}>
                    {statusCfg.icon}
                    {statusCfg.label}
                  </span>
                  <button
                    onClick={() => setExpandedBarangay(isExpanded ? null : barangay.id)}
                    className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Supply rows - Always visible summary */}
              <div className="grid grid-cols-5 divide-x divide-slate-800">
                {SUPPLY_ROWS.map(row => {
                  const item = manifest[row.key];
                  const pct = Math.min(100, Math.round((item.inventory / Math.max(item.recommended, 1)) * 100));
                  const isShort = item.shortfall > 0;

                  return (
                    <div key={row.key} className="px-4 py-3 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold uppercase">
                        {row.icon}
                        {row.label}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <p className={`text-sm font-bold font-mono ${isShort ? 'text-red-400' : 'text-teal-300'}`}>
                          {item.inventory.toLocaleString()}
                        </p>
                        <span className="text-[10px] text-slate-500">/ {item.recommended.toLocaleString()} {row.unit}</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1">
                        <div
                          className={`h-1 rounded-full transition-all ${isShort ? 'bg-red-500' : 'bg-teal-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className={`text-[9px] font-mono ${isShort ? 'text-red-400' : 'text-slate-500'}`}>
                        {isShort ? `Short: ${item.shortfall.toLocaleString()} ${row.unit}` : `${pct}% stocked`}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Expanded details - Inventory vs Required breakdown */}
              {isExpanded && (
                <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/30">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                        <BarChart3 className="w-3 h-3" /> Inventory Analysis
                      </p>
                      <div className="space-y-2">
                        {SUPPLY_ROWS.map(row => {
                          const item = manifest[row.key];
                          const shortfall = Math.max(0, item.recommended - item.inventory);
                          return (
                            <div key={row.key} className="flex justify-between text-xs">
                              <span className="text-slate-400">{row.label}</span>
                              <div className="text-right">
                                <span className="text-slate-300">{item.inventory.toLocaleString()}</span>
                                <span className="text-slate-600 mx-1">/</span>
                                <span className="text-slate-500">{item.recommended.toLocaleString()}</span>
                                {shortfall > 0 && (
                                  <span className="text-red-400 ml-2 text-[10px]">
                                    (Short: {shortfall.toLocaleString()})
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">Resource Requirements</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Total Required:</span>
                          <span className="text-slate-300 font-mono">
                            {SUPPLY_ROWS.reduce((sum, row) => sum + manifest[row.key].recommended, 0).toLocaleString()} units
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Total Available:</span>
                          <span className="text-slate-300 font-mono">
                            {SUPPLY_ROWS.reduce((sum, row) => sum + manifest[row.key].inventory, 0).toLocaleString()} units
                          </span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-slate-800">
                          <span className="text-slate-400 font-bold">Gap:</span>
                          <span className={`font-mono font-bold ${totalShortfalls > 0 ? 'text-red-400' : 'text-teal-400'}`}>
                            {totalShortfalls.toLocaleString()} units
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Approval actions */}
              {(manifest.status === 'pending' || manifest.status === 'modified') && (
                <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-900/40 flex items-center justify-end gap-2">
                  <span className="text-[10px] text-slate-500 mr-auto flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Human approval required before dispatch
                  </span>
                  <button
                    onClick={() => onUpdateManifestStatus(barangay.id, 'approved')}
                    className="px-3 py-1.5 bg-teal-900/80 hover:bg-teal-800 border border-teal-700 text-teal-200 font-bold rounded-lg text-[11px] cursor-pointer transition-colors flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve Manifest
                  </button>
                  <button
                    onClick={() => onUpdateManifestStatus(barangay.id, 'rejected')}
                    className="px-3 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 font-bold rounded-lg text-[11px] cursor-pointer transition-colors flex items-center gap-1"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}