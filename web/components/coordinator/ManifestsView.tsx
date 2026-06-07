'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Check,
  AlertOctagon,
  History,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { SupplyManifest, Barangay, ImpactPrediction } from '@/lib/mockData';

interface ManifestsViewProps {
  barangays: Barangay[];
  manifests: Record<string, SupplyManifest>;
  predictions: Record<string, ImpactPrediction>;
  onUpdateManifestStatus: (barangayId: string, status: 'approved' | 'modified' | 'rejected') => void;
}

interface HistoryEntry {
  id: string;
  barangayId: string;
  barangayName: string;
  action: 'approved' | 'rejected' | 'modified';
  timestamp: Date;
  manifestSnapshot: SupplyManifest;
}

const SUPPLY_ROWS = [
  { key: 'waterL',           label: 'Water',         unit: 'L',     icon: <Droplets        className="w-4 h-4 text-blue-300" />,   color: 'blue'   },
  { key: 'foodPacks',        label: 'Food Packs',    unit: 'packs', icon: <UtensilsCrossed className="w-4 h-4 text-amber-300" />,  color: 'amber'  },
  { key: 'hygieneKits',      label: 'Hygiene Kits',  unit: 'kits',  icon: <ShieldCheck     className="w-4 h-4 text-purple-300" />, color: 'purple' },
  { key: 'medicalSupplies',  label: 'Medical',       unit: 'packs', icon: <HeartPulse      className="w-4 h-4 text-red-300" />,    color: 'red'    },
  { key: 'shelterMaterials', label: 'Shelter',       unit: 'units', icon: <Home            className="w-4 h-4 text-teal-300" />,   color: 'teal'   },
] as const;

type SupplyKey = typeof SUPPLY_ROWS[number]['key'];

const BAR_COLORS: Record<string, string> = {
  blue: 'bg-blue-400/60', amber: 'bg-amber-400/60', purple: 'bg-purple-400/60', red: 'bg-red-400/60', teal: 'bg-teal-400/60',
};
const BAR_COLORS_LOW: Record<string, string> = {
  blue: 'bg-blue-800/30', amber: 'bg-amber-800/30', purple: 'bg-purple-800/30', red: 'bg-red-800/30', teal: 'bg-teal-800/30',
};

// ── Confirmation dialog ────────────────────────────────────────────────────
function ConfirmationDialog({
  isOpen, title, message, onConfirm, onCancel, actionType, isProcessing = false,
}: {
  isOpen: boolean; title: string; message: string;
  onConfirm: () => void; onCancel: () => void;
  actionType: 'approve' | 'reject'; isProcessing?: boolean;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
        <div className={`px-5 py-4 border-b border-slate-700 flex items-center gap-3 ${
          actionType === 'approve' ? 'bg-teal-800/20' : 'bg-red-800/20'
        }`}>
          {actionType === 'approve'
            ? <CheckCircle2 className="w-5 h-5 text-teal-300 shrink-0" />
            : <AlertOctagon  className="w-5 h-5 text-red-300 shrink-0" />}
          <h3 className="font-semibold text-slate-200 tracking-wide">{title}</h3>
        </div>
        <p className="px-5 py-4 text-sm text-slate-300 leading-relaxed">{message}</p>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button onClick={onCancel} disabled={isProcessing}
            className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-slate-300 hover:text-slate-100 border border-slate-600 hover:border-slate-500 rounded-lg transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isProcessing}
            className={`px-4 py-2 text-xs font-medium uppercase tracking-wider rounded-lg flex items-center gap-2 transition-colors disabled:opacity-40 ${
              actionType === 'approve'
                ? 'bg-teal-700/80 hover:bg-teal-600/80 text-teal-50 border border-teal-600'
                : 'bg-red-700/80 hover:bg-red-600/80 text-red-50 border border-red-600'
            }`}>
            {isProcessing
              ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : actionType === 'approve' ? <Check className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            {isProcessing ? 'Processing…' : actionType === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Supply bar row ─────────────────────────────────────────────────────────
function SupplyBar({ row, item }: { row: typeof SUPPLY_ROWS[number]; item: { inventory: number; recommended: number; shortfall: number } }) {
  const pct = Math.min(100, (item.inventory / Math.max(item.recommended, 1)) * 100);
  const isShort = item.shortfall > 0;
  const barFill = isShort ? 'bg-red-400/60' : BAR_COLORS[row.color];
  const trackColor = isShort ? 'bg-red-800/30' : BAR_COLORS_LOW[row.color];

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-700/40 last:border-0">
      <div className="w-5 shrink-0">{row.icon}</div>
      <div className="w-24 shrink-0">
        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{row.label}</span>
      </div>
      <div className="flex-1">
        <div className={`h-2 rounded-full ${trackColor} overflow-hidden`}>
          <div className={`h-full rounded-full transition-all duration-500 ${barFill}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="w-36 text-right shrink-0">
        <span className={`text-[12px] font-bold ${isShort ? 'text-red-300' : 'text-slate-200'}`}>
          {item.inventory.toLocaleString()}
        </span>
        <span className="text-[11px] text-slate-500 mx-1">/</span>
        <span className="text-[11px] text-slate-400">{item.recommended.toLocaleString()} {row.unit}</span>
      </div>
      <div className="w-20 text-right shrink-0">
        {isShort ? (
          <span className="text-[10px] font-bold text-red-300 bg-red-800/30 border border-red-700/50 px-1.5 py-0.5 rounded">
            −{item.shortfall.toLocaleString()}
          </span>
        ) : (
          <span className="text-[10px] text-teal-500">{Math.round(pct)}%</span>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function ManifestsView({
  barangays, manifests, predictions, onUpdateManifestStatus,
}: ManifestsViewProps) {
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory]         = useState<HistoryEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [flashId, setFlashId]         = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'all'>('pending');
  const [dialog, setDialog] = useState<{ open: boolean; id: string; action: 'approve' | 'reject' }>({
    open: false, id: '', action: 'approve',
  });
  const pendingOpsRef = useRef<Set<string>>(new Set());

  // Auto-select first pending on mount
  useEffect(() => {
    const firstPending = barangays.find(b => manifests[b.id]?.status === 'pending');
    if (firstPending && !selectedId) setSelectedId(firstPending.id);
  }, [barangays, manifests, selectedId]);

  // Load history
  useEffect(() => {
    try {
      const raw = localStorage.getItem('manifest-history');
      if (raw) setHistory(JSON.parse(raw).map((e: HistoryEntry) => ({ ...e, timestamp: new Date(e.timestamp) })));
    } catch { /* ignore */ }
  }, []);

  // Persist history
  useEffect(() => {
    if (history.length === 0) return;
    try { localStorage.setItem('manifest-history', JSON.stringify(history)); } catch { /* ignore */ }
  }, [history]);

  const addToHistory = useCallback((id: string, name: string, action: 'approved' | 'rejected', manifest: SupplyManifest) => {
    const opKey = `${id}-${action}-${Date.now()}`;
    if (pendingOpsRef.current.has(opKey)) return;
    pendingOpsRef.current.add(opKey);
    setTimeout(() => pendingOpsRef.current.delete(opKey), 1000);

    setHistory(prev => [{
      id: opKey, barangayId: id, barangayName: name, action,
      timestamp: new Date(), manifestSnapshot: JSON.parse(JSON.stringify(manifest)),
    }, ...prev].slice(0, 50));
  }, []);

  const openDialog = (id: string, action: 'approve' | 'reject') =>
    setDialog({ open: true, id, action });

  const confirmAction = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    const { id, action } = dialog;
    const b = barangays.find(x => x.id === id);
    const m = manifests[id];
    const resolved = action === 'approve' ? 'approved' : 'rejected';
    if (b && m) {
      addToHistory(id, b.name, resolved, m);
      await new Promise(r => setTimeout(r, 120));
      onUpdateManifestStatus(id, resolved);
      setFlashId(id);
      setTimeout(() => {
        setFlashId(null);
        // Auto-advance to next pending
        const remaining = barangays.filter(x => x.id !== id && manifests[x.id]?.status === 'pending');
        setSelectedId(remaining[0]?.id ?? null);
      }, 600);
    }
    setDialog({ open: false, id: '', action: 'approve' });
    setIsProcessing(false);
  }, [dialog, barangays, manifests, addToHistory, onUpdateManifestStatus, isProcessing]);

  // Computed lists
  const pending  = barangays.filter(b => manifests[b.id]?.status === 'pending');
  const approved = barangays.filter(b => manifests[b.id]?.status === 'approved');
  const rejected = barangays.filter(b => manifests[b.id]?.status === 'rejected');

  const listBarangays = filterStatus === 'pending'
    ? [...pending].sort((a, b) => (predictions[b.id]?.predictedAffected ?? 0) - (predictions[a.id]?.predictedAffected ?? 0))
    : [...pending, ...approved, ...rejected].sort((a, b) => (predictions[b.id]?.predictedAffected ?? 0) - (predictions[a.id]?.predictedAffected ?? 0));

  const selectedBarangay = barangays.find(b => b.id === selectedId);
  const selectedManifest = selectedId ? manifests[selectedId] : null;
  const selectedPred     = selectedId ? predictions[selectedId] : null;

  // Metrics
  const totalShortfall = pending.reduce((sum, b) =>
    sum + SUPPLY_ROWS.reduce((s, r) => s + (manifests[b.id]?.[r.key]?.shortfall ?? 0), 0), 0);

  const statusDot = (status: string) => {
    if (status === 'pending')  return 'bg-amber-400/60';
    if (status === 'approved') return 'bg-teal-400/60';
    if (status === 'rejected') return 'bg-red-400/60';
    return 'bg-slate-500';
  };

  const statusLabel = (status: string) => {
    if (status === 'pending')  return <span className="text-amber-300">Pending</span>;
    if (status === 'approved') return <span className="text-teal-300">Approved</span>;
    if (status === 'rejected') return <span className="text-red-300">Rejected</span>;
    return null;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900 overflow-hidden">
      <ConfirmationDialog
        isOpen={dialog.open}
        title={dialog.action === 'approve' ? 'Approve Manifest' : 'Reject Manifest'}
        message={dialog.action === 'approve'
          ? 'Confirm approval — this manifest will be marked ready for dispatch.'
          : 'Confirm rejection — the manifest will be archived and the barangay notified.'}
        onConfirm={confirmAction}
        onCancel={() => { if (!isProcessing) setDialog({ open: false, id: '', action: 'approve' }); }}
        actionType={dialog.action}
        isProcessing={isProcessing}
      />

      {/* ── Top bar ── */}
      <div className="shrink-0 bg-slate-800/50 border-b border-slate-700 px-5 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="bg-teal-800/30 p-1.5 rounded-lg">
            <Package className="w-4 h-4 text-teal-300" />
          </div>
          <div>
            <h2 className="font-medium text-[13px] uppercase tracking-[0.12em] text-slate-200">Supply Manifests</h2>
            <p className="text-[9px] text-slate-500">Sphere Standard · 3-day emergency</p>
          </div>
        </div>

        {/* Metric pills */}
        <div className="flex items-center gap-2 ml-4">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-800/30 border border-amber-700/30 rounded-full">
            <Clock className="w-3 h-3 text-amber-300" />
            <span className="text-[11px] font-medium text-amber-300">{pending.length} pending</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-teal-800/30 border border-teal-700/30 rounded-full">
            <CheckCircle2 className="w-3 h-3 text-teal-300" />
            <span className="text-[11px] font-medium text-teal-300">{approved.length} approved</span>
          </div>
          {totalShortfall > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-800/30 border border-red-700/30 rounded-full">
              <AlertTriangle className="w-3 h-3 text-red-300" />
              <span className="text-[11px] font-medium text-red-300">{totalShortfall.toLocaleString()} shortfall</span>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Filter toggle */}
          <div className="flex bg-slate-800 border border-slate-700 rounded-lg p-0.5 text-[10px]">
            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-2.5 py-1 rounded transition-colors ${filterStatus === 'pending' ? 'bg-slate-700 text-amber-300 font-medium' : 'text-slate-400 hover:text-slate-300'}`}
            >Pending</button>
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-2.5 py-1 rounded transition-colors ${filterStatus === 'all' ? 'bg-slate-700 text-slate-200 font-medium' : 'text-slate-400 hover:text-slate-300'}`}
            >All</button>
          </div>
          {/* History toggle */}
          <button
            onClick={() => setShowHistory(h => !h)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
              showHistory
                ? 'bg-slate-700 border-slate-600 text-slate-200'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            History {history.length > 0 && <span className="bg-slate-600 text-slate-300 rounded-full px-1.5 py-0.5 text-[9px]">{history.length}</span>}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {showHistory ? (
        /* ── History panel ── */
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-teal-400" /> Action Log
            </h3>
            {history.length > 0 && (
              <button onClick={() => { if (confirm('Clear all history?')) setHistory([]); }}
                className="text-[10px] text-red-400/70 hover:text-red-300 transition-colors">
                Clear
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <History className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No actions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(entry => (
                <div key={entry.id} className={`bg-slate-800/50 border rounded-xl p-4 ${
                  entry.action === 'approved' ? 'border-teal-700/40' : 'border-red-700/40'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-lg ${entry.action === 'approved' ? 'bg-teal-800/30' : 'bg-red-800/30'}`}>
                        {entry.action === 'approved'
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-teal-300" />
                          : <XCircle      className="w-3.5 h-3.5 text-red-300" />}
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold text-slate-200">{entry.barangayName}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{entry.action}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500">{entry.timestamp.toLocaleString()}</p>
                  </div>
                  <div className="grid grid-cols-5 gap-1 text-[10px]">
                    {SUPPLY_ROWS.map(row => {
                      const item = entry.manifestSnapshot[row.key];
                      return (
                        <div key={row.key} className="bg-slate-800/50 rounded-lg p-2 text-center">
                          <p className="text-slate-500 mb-0.5">{row.label}</p>
                          <p className="text-slate-300 font-semibold">{item.inventory.toLocaleString()}</p>
                          <p className="text-slate-500">/{item.recommended.toLocaleString()}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Split pane ── */
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* ── Left: list ── */}
          <div className="w-64 shrink-0 border-r border-slate-700 flex flex-col overflow-hidden bg-slate-900">
            <div className="shrink-0 px-3 py-2 border-b border-slate-700">
              <p className="text-[9px] uppercase tracking-widest text-slate-500">
                {listBarangays.length} barangay{listBarangays.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {listBarangays.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-slate-500">
                  <CheckCircle2 className="w-8 h-8 mb-2 opacity-30 text-teal-500" />
                  <p className="text-[11px] text-center">All manifests reviewed</p>
                </div>
              ) : listBarangays.map(b => {
                const m = manifests[b.id];
                if (!m) return null;
                const pred = predictions[b.id];
                const affected = pred?.overrideValue ?? pred?.predictedAffected ?? 0;
                const isCritical = pred?.damageSeverity === 'severe' || pred?.confidence === 'high';
                const isSelected = selectedId === b.id;
                const isFlashing = flashId === b.id;
                const totalRec = SUPPLY_ROWS.reduce((s, r) => s + m[r.key].recommended, 0);
                const totalInv = SUPPLY_ROWS.reduce((s, r) => s + m[r.key].inventory, 0);
                const readiness = totalRec > 0 ? (totalInv / totalRec) * 100 : 0;

                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedId(b.id)}
                    className={`w-full text-left px-3 py-3 border-b border-slate-700/40 transition-all relative ${
                      isFlashing ? 'bg-teal-800/30' :
                      isSelected ? 'bg-slate-800/60' : 'hover:bg-slate-800/30'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-teal-400 rounded-r" />
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${statusDot(m.status)}`} />
                        <div className="min-w-0">
                          <p className={`text-[12px] font-semibold truncate ${isSelected ? 'text-slate-100' : 'text-slate-300'}`}>
                            {b.name}
                          </p>
                          <p className="text-[9px] text-slate-500">{affected.toLocaleString()} affected</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {isCritical && m.status === 'pending' && (
                          <span className="text-[8px] font-bold text-red-300 bg-red-800/30 border border-red-700/30 px-1 py-0.5 rounded uppercase">
                            Crit
                          </span>
                        )}
                        <ChevronRight className={`w-3 h-3 ${isSelected ? 'text-teal-400' : 'text-slate-600'}`} />
                      </div>
                    </div>
                    {/* Mini readiness bar */}
                    <div className="mt-2 h-0.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          readiness >= 80 ? 'bg-teal-500' : readiness >= 50 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(100, readiness)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[8px] text-slate-500">{statusLabel(m.status)}</span>
                      <span className="text-[8px] text-slate-500">{Math.round(readiness)}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Right: detail pane ── */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {!selectedManifest || !selectedBarangay ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                <Package className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">Select a barangay</p>
              </div>
            ) : (
              <>
                {/* Detail header */}
                <div className={`shrink-0 px-6 py-4 border-b border-slate-700 ${
                  selectedManifest.status === 'pending' ? 'bg-slate-800/30' : 'bg-slate-800/20'
                }`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg text-slate-100">{selectedBarangay.name}</h3>
                        {(selectedPred?.damageSeverity === 'severe' || selectedPred?.confidence === 'high') && selectedManifest.status === 'pending' && (
                          <span className="flex items-center gap-1 text-[9px] font-medium bg-red-800/30 border border-red-700/30 text-red-300 px-2 py-0.5 rounded-full uppercase">
                            <Zap className="w-2.5 h-2.5" /> Critical
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {selectedBarangay.cityMunicipality} · Pop. {selectedBarangay.population.toLocaleString()}
                        {selectedPred && (
                          <> · <span className="text-amber-300">{(selectedPred.overrideValue ?? selectedPred.predictedAffected ?? 0).toLocaleString()} est. affected</span></>
                        )}
                      </p>
                    </div>

                    {/* Readiness ring */}
                    {(() => {
                      const totalRec = SUPPLY_ROWS.reduce((s, r) => s + selectedManifest[r.key].recommended, 0);
                      const totalInv = SUPPLY_ROWS.reduce((s, r) => s + selectedManifest[r.key].inventory, 0);
                      const pct = Math.round(totalRec > 0 ? (totalInv / totalRec) * 100 : 0);
                      return (
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">Readiness</p>
                            <div className="flex items-baseline gap-1">
                              <span className={`text-2xl font-bold ${
                                pct >= 80 ? 'text-teal-300' : pct >= 50 ? 'text-amber-300' : 'text-red-300'
                              }`}>{pct}%</span>
                              {pct >= 80 ? <TrendingUp className="w-4 h-4 text-teal-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                            </div>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-[10px] font-medium border ${
                            selectedManifest.status === 'pending'  ? 'bg-amber-800/30 border-amber-700/30 text-amber-300' :
                            selectedManifest.status === 'approved' ? 'bg-teal-800/30 border-teal-700/30 text-teal-300' :
                                                                     'bg-red-800/30 border-red-700/30 text-red-300'
                          }`}>
                            {selectedManifest.status.toUpperCase()}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Supply rows */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  <p className="text-[9px] uppercase tracking-[0.15em] text-slate-500 mb-3">Supply Breakdown</p>
                  <div className="bg-slate-800/30 border border-slate-700 rounded-xl px-4 divide-y-0">
                    {SUPPLY_ROWS.map(row => (
                      <SupplyBar key={row.key} row={row} item={selectedManifest[row.key]} />
                    ))}
                  </div>

                  {/* Totals row */}
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {[
                      {
                        label: 'Total Required',
                        value: SUPPLY_ROWS.reduce((s, r) => s + selectedManifest[r.key].recommended, 0).toLocaleString(),
                        sub: 'units',
                        color: 'text-slate-300',
                      },
                      {
                        label: 'Total Available',
                        value: SUPPLY_ROWS.reduce((s, r) => s + selectedManifest[r.key].inventory, 0).toLocaleString(),
                        sub: 'units',
                        color: 'text-slate-300',
                      },
                      {
                        label: 'Total Gap',
                        value: SUPPLY_ROWS.reduce((s, r) => s + selectedManifest[r.key].shortfall, 0).toLocaleString(),
                        sub: 'units',
                        color: SUPPLY_ROWS.some(r => selectedManifest[r.key].shortfall > 0) ? 'text-red-300' : 'text-teal-300',
                      },
                    ].map(({ label, value, sub, color }) => (
                      <div key={label} className="bg-slate-800/30 border border-slate-700 rounded-xl p-3 text-center">
                        <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">{label}</p>
                        <p className={`text-lg font-bold ${color}`}>{value}</p>
                        <p className="text-[9px] text-slate-500">{sub}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action bar — only for pending */}
                {selectedManifest.status === 'pending' && (
                  <div className="shrink-0 border-t border-slate-700 bg-slate-800/30 px-6 py-3 flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mr-auto">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                      Human approval required before dispatch
                    </div>
                    <button
                      onClick={() => openDialog(selectedBarangay.id, 'reject')}
                      disabled={isProcessing}
                      className="px-4 py-2 rounded-lg text-[11px] font-medium uppercase tracking-wider border border-red-700 bg-red-800/30 text-red-300 hover:bg-red-800/50 hover:border-red-600 transition-colors flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                    <button
                      onClick={() => openDialog(selectedBarangay.id, 'approve')}
                      disabled={isProcessing}
                      className="px-5 py-2 rounded-lg text-[11px] font-medium uppercase tracking-wider bg-teal-700/60 hover:bg-teal-600/60 border border-teal-600 text-teal-50 transition-colors flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve Manifest
                    </button>
                  </div>
                )}

                {/* Approved/rejected state footer */}
                {(selectedManifest.status === 'approved' || selectedManifest.status === 'rejected') && (
                  <div className={`shrink-0 border-t px-6 py-3 flex items-center gap-2 text-[11px] ${
                    selectedManifest.status === 'approved'
                      ? 'border-teal-700/40 bg-teal-800/20 text-teal-300'
                      : 'border-red-700/40 bg-red-800/20 text-red-300'
                  }`}>
                    {selectedManifest.status === 'approved'
                      ? <><CheckCircle2 className="w-3.5 h-3.5" /> Manifest approved and queued for dispatch</>
                      : <><XCircle className="w-3.5 h-3.5" /> Manifest rejected — barangay notified</>}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}