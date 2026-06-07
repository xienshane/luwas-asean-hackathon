'use client';

import React from 'react';
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
  Clock
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

export default function ManifestsView({
  barangays,
  manifests,
  predictions,
  onUpdateManifestStatus
}: ManifestsViewProps) {
  // Compute pending count
  const pendingCount = Object.values(manifests).filter(m => m.status === 'pending').length;

  // Sort barangays by prediction severity
  const sorted = [...barangays].sort((a, b) => {
    const pa = predictions[a.id]?.predictedAffected ?? 0;
    const pb = predictions[b.id]?.predictedAffected ?? 0;
    return pb - pa;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center gap-2">
        <Package className="w-4 h-4 text-teal-400" />
        <h2 className="font-bold text-sm uppercase tracking-wider text-slate-300">Supply Manifests</h2>
        {pendingCount > 0 && (
          <span className="bg-amber-950 border border-amber-800 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
            {pendingCount} awaiting approval
          </span>
        )}
        <span className="ml-auto text-[10px] text-slate-500 font-mono">Sphere Standard · 3-day ration</span>
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

          return (
            <div key={barangay.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              {/* Card header */}
              <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <h3 className="font-bold text-slate-200">{barangay.name}</h3>
                    <p className="text-[10px] text-slate-500">{barangay.cityMunicipality} · Pop. {barangay.population.toLocaleString()}</p>
                  </div>
                  {hasShortfall && (
                    <span className="flex items-center gap-1 text-[10px] bg-red-950 border border-red-800 text-red-400 px-2 py-0.5 rounded font-bold">
                      <AlertTriangle className="w-2.5 h-2.5" /> Shortfall
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
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
                </div>
              </div>

              {/* Supply rows */}
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
                      <p className="text-sm font-bold text-teal-300 font-mono">
                        {item.recommended.toLocaleString()}
                        <span className="text-[10px] text-slate-500 font-normal ml-0.5">{row.unit}</span>
                      </p>
                      <div className="w-full bg-slate-800 rounded-full h-1">
                        <div
                          className={`h-1 rounded-full transition-all ${isShort ? 'bg-red-500' : 'bg-teal-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className={`text-[9px] font-mono ${isShort ? 'text-red-400' : 'text-slate-500'}`}>
                        {isShort ? `−${item.shortfall.toLocaleString()} short` : `${pct}% available`}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Approval actions — only show if pending or modified */}
              {(manifest.status === 'pending' || manifest.status === 'modified') && (
                <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-900/40 flex items-center justify-end gap-2">
                  <span className="text-[10px] text-slate-500 mr-auto">
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
