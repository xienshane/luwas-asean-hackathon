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
  { key: 'waterL',           label: 'Water',         unit: 'L',     icon: <Droplets        className="w-4 h-4 text-blue-400" />,   color: 'blue'   },
  { key: 'foodPacks',        label: 'Food Packs',    unit: 'packs', icon: <UtensilsCrossed className="w-4 h-4 text-amber-400" />,  color: 'amber'  },
  { key: 'hygieneKits',      label: 'Hygiene Kits',  unit: 'kits',  icon: <ShieldCheck     className="w-4 h-4 text-purple-400" />, color: 'purple' },
  { key: 'medicalSupplies',  label: 'Medical',       unit: 'packs', icon: <HeartPulse      className="w-4 h-4 text-red-400" />,    color: 'red'    },
  { key: 'shelterMaterials', label: 'Shelter',       unit: 'units', icon: <Home            className="w-4 h-4 text-teal-400" />,   color: 'teal'   },
] as const;

type SupplyKey = typeof SUPPLY_ROWS[number]['key'];

const BAR_COLORS: Record<string, string> = {
  blue: 'bg-blue-500', amber: 'bg-amber-500', purple: 'bg-purple-500', red: 'bg-red-500', teal: 'bg-teal-500',
};
const BAR_COLORS_LOW: Record<string, string> = {
  blue: 'bg-blue-900/60', amber: 'bg-amber-900/60', purple: 'bg-purple-900/60', red: 'bg-red-900/60', teal: 'bg-teal-900/60',
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
        <div className={`px-5 py-4 border-b border-slate-800 flex items-center gap-3 ${
          actionType === 'approve' ? 'bg-teal-950/40' : 'bg-red-950/40'
        }`}>
          {actionType === 'approve'
            ? <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />
            : <AlertOctagon  className="w-5 h-5 text-red-400 shrink-0" />}
          <h3 className="font-bold text-slate-200 font-mono tracking-wide">{title}</h3>
        </div>
        <p className="px-5 py-4 text-sm text-slate-400 leading-relaxed">{message}</p>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button onClick={onCancel} disabled={isProcessing}
            className="px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded-lg transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isProcessing}
            className={`px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wider rounded-lg flex items-center gap-2 transition-colors disabled:opacity-40 ${
              actionType === 'approve'
                ? 'bg-teal-700 hover:bg-teal-600 text-teal-50 border border-teal-600'
                : 'bg-red-800 hover:bg-red-700 text-red-50 border border-red-700'
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
  const barFill = isShort ? 'bg-red-500' : BAR_COLORS[row.color];
  const trackColor = isShort ? 'bg-red-950/40' : BAR_COLORS_LOW[row.color];

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-800/60 last:border-0">
      <div className="w-5 shrink-0">{row.icon}</div>
      <div className="w-24 shrink-0">
        <span className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider">{row.label}</span>
      </div>
      <div className="flex-1">
        <div className={`h-2 rounded-full ${trackColor} overflow-hidden`}>
          <div className={`h-full rounded-full transition-all duration-500 ${barFill}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="w-36 text-right shrink-0">
        <span className={`text-[12px] font-mono font-bold ${isShort ? 'text-red-400' : 'text-slate-200'}`}>
          {item.inventory.toLocaleString()}
        </span>
        <span className="text-[11px] text-slate-600 mx-1">/</span>
        <span className="text-[11px] text-slate-500 font-mono">{item.recommended.toLocaleString()} {row.unit}</span>
      </div>
      <div className="w-20 text-right shrink-0">
        {isShort ? (
          <span className="text-[10px] font-mono font-bold text-red-500 bg-red-950/50 border border-red-900/50 px-1.5 py-0.5 rounded">
            −{item.shortfall.toLocaleString()}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-teal-600">{Math.round(pct)}%</span>
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
    if (status === 'pending')  return 'bg-amber-400';
    if (status === 'approved') return 'bg-teal-400';
    if (status === 'rejected') return 'bg-red-500';
    return 'bg-slate-600';
  };

  const statusLabel = (status: string) => {
    if (status === 'pending')  return <span className="text-amber-400">Pending</span>;
    if (status === 'approved') return <span className="text-teal-400">Approved</span>;
    if (status === 'rejected') return <span className="text-red-400">Rejected</span>;
    return null;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
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
      <div className="shrink-0 bg-slate-900 border-b border-slate-800 px-5 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="bg-teal-900/60 p-1.5 rounded-lg">
            <Package className="w-4 h-4 text-teal-400" />
          </div>
          <div>
            <h2 className="font-mono font-bold text-[13px] uppercase tracking-[0.12em] text-slate-200">Supply Manifests</h2>
            <p className="text-[9px] text-slate-600 font-mono">Sphere Standard · 3-day emergency</p>
          </div>
        </div>

        {/* Metric pills */}
        <div className="flex items-center gap-2 ml-4">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-950/50 border border-amber-900/50 rounded-full">
            <Clock className="w-3 h-3 text-amber-400" />
            <span className="font-mono text-[11px] font-bold text-amber-400">{pending.length} pending</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-teal-950/50 border border-teal-900/50 rounded-full">
            <CheckCircle2 className="w-3 h-3 text-teal-400" />
            <span className="font-mono text-[11px] font-bold text-teal-400">{approved.length} approved</span>
          </div>
          {totalShortfall > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-950/50 border border-red-900/50 rounded-full">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span className="font-mono text-[11px] font-bold text-red-400">{totalShortfall.toLocaleString()} shortfall</span>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Filter toggle */}
          <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-[10px] font-mono">
            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-2.5 py-1 rounded transition-colors ${filterStatus === 'pending' ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
            >Pending</button>
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-2.5 py-1 rounded transition-colors ${filterStatus === 'all' ? 'bg-slate-800 text-slate-200 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
            >All</button>
          </div>
          {/* History toggle */}
          <button
            onClick={() => setShowHistory(h => !h)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-semibold border transition-colors ${
              showHistory
                ? 'bg-slate-700 border-slate-600 text-slate-200'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
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
            <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-teal-500" /> Action Log
            </h3>
            {history.length > 0 && (
              <button onClick={() => { if (confirm('Clear all history?')) setHistory([]); }}
                className="text-[10px] font-mono text-red-500/70 hover:text-red-400 transition-colors">
                Clear
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-600">
              <History className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm font-mono">No actions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(entry => (
                <div key={entry.id} className={`bg-slate-900 border rounded-xl p-4 ${
                  entry.action === 'approved' ? 'border-teal-900/50' : 'border-red-900/50'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-lg ${entry.action === 'approved' ? 'bg-teal-950' : 'bg-red-950'}`}>
                        {entry.action === 'approved'
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                          : <XCircle      className="w-3.5 h-3.5 text-red-400" />}
                      </div>
                      <div>
                        <p className="text-[12px] font-bold text-slate-200">{entry.barangayName}</p>
                        <p className="text-[10px] text-slate-500 font-mono capitalize">{entry.action}</p>
                      </div>
                    </div>
                    <p className="text-[10px] font-mono text-slate-600">{entry.timestamp.toLocaleString()}</p>
                  </div>
                  <div className="grid grid-cols-5 gap-1 text-[10px] font-mono">
                    {SUPPLY_ROWS.map(row => {
                      const item = entry.manifestSnapshot[row.key];
                      return (
                        <div key={row.key} className="bg-slate-800/50 rounded-lg p-2 text-center">
                          <p className="text-slate-600 mb-0.5">{row.label}</p>
                          <p className="text-slate-300 font-bold">{item.inventory.toLocaleString()}</p>
                          <p className="text-slate-600">/{item.recommended.toLocaleString()}</p>
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
          <div className="w-64 shrink-0 border-r border-slate-800 flex flex-col overflow-hidden bg-slate-950">
            <div className="shrink-0 px-3 py-2 border-b border-slate-800">
              <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600">
                {listBarangays.length} barangay{listBarangays.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {listBarangays.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-slate-600">
                  <CheckCircle2 className="w-8 h-8 mb-2 opacity-40 text-teal-600" />
                  <p className="text-[11px] font-mono text-center">All manifests reviewed</p>
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
                    className={`w-full text-left px-3 py-3 border-b border-slate-800/60 transition-all relative ${
                      isFlashing ? 'bg-teal-950/40' :
                      isSelected ? 'bg-slate-800/80' : 'hover:bg-slate-900/60'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-teal-500 rounded-r" />
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${statusDot(m.status)}`} />
                        <div className="min-w-0">
                          <p className={`text-[12px] font-bold truncate ${isSelected ? 'text-slate-100' : 'text-slate-300'}`}>
                            {b.name}
                          </p>
                          <p className="text-[9px] font-mono text-slate-600">{affected.toLocaleString()} affected</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {isCritical && m.status === 'pending' && (
                          <span className="text-[8px] font-mono font-bold text-red-500 bg-red-950/60 border border-red-900/50 px-1 py-0.5 rounded uppercase">
                            Crit
                          </span>
                        )}
                        <ChevronRight className={`w-3 h-3 ${isSelected ? 'text-teal-500' : 'text-slate-700'}`} />
                      </div>
                    </div>
                    {/* Mini readiness bar */}
                    <div className="mt-2 h-0.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          readiness >= 80 ? 'bg-teal-600' : readiness >= 50 ? 'bg-amber-500' : 'bg-red-600'
                        }`}
                        style={{ width: `${Math.min(100, readiness)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[8px] font-mono text-slate-600">{statusLabel(m.status)}</span>
                      <span className="text-[8px] font-mono text-slate-700">{Math.round(readiness)}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Right: detail pane ── */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {!selectedManifest || !selectedBarangay ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                <Package className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-mono text-sm">Select a barangay</p>
              </div>
            ) : (
              <>
                {/* Detail header */}
                <div className={`shrink-0 px-6 py-4 border-b border-slate-800 ${
                  selectedManifest.status === 'pending' ? 'bg-slate-900' : 'bg-slate-900/50'
                }`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg text-slate-100">{selectedBarangay.name}</h3>
                        {(selectedPred?.damageSeverity === 'severe' || selectedPred?.confidence === 'high') && selectedManifest.status === 'pending' && (
                          <span className="flex items-center gap-1 text-[9px] font-mono font-bold bg-red-950 border border-red-800 text-red-400 px-2 py-0.5 rounded-full uppercase">
                            <Zap className="w-2.5 h-2.5" /> Critical
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {selectedBarangay.cityMunicipality} · Pop. {selectedBarangay.population.toLocaleString()}
                        {selectedPred && (
                          <> · <span className="text-amber-400">{(selectedPred.overrideValue ?? selectedPred.predictedAffected ?? 0).toLocaleString()} est. affected</span></>
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
                            <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-1">Readiness</p>
                            <div className="flex items-baseline gap-1">
                              <span className={`text-2xl font-bold font-mono ${
                                pct >= 80 ? 'text-teal-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'
                              }`}>{pct}%</span>
                              {pct >= 80 ? <TrendingUp className="w-4 h-4 text-teal-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
                            </div>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold border ${
                            selectedManifest.status === 'pending'  ? 'bg-amber-950/60 border-amber-800 text-amber-300' :
                            selectedManifest.status === 'approved' ? 'bg-teal-950/60 border-teal-800 text-teal-300' :
                                                                     'bg-red-950/60 border-red-800 text-red-400'
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
                  <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-600 mb-3">Supply Breakdown</p>
                  <div className="bg-slate-900/50 border border-slate-800 rounded-xl px-4 divide-y-0">
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
                        color: SUPPLY_ROWS.some(r => selectedManifest[r.key].shortfall > 0) ? 'text-red-400' : 'text-teal-400',
                      },
                    ].map(({ label, value, sub, color }) => (
                      <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                        <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-1">{label}</p>
                        <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
                        <p className="text-[9px] text-slate-700 font-mono">{sub}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action bar — only for pending */}
                {selectedManifest.status === 'pending' && (
                  <div className="shrink-0 border-t border-slate-800 bg-slate-900/80 px-6 py-3 flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-600 mr-auto">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                      Human approval required before dispatch
                    </div>
                    <button
                      onClick={() => openDialog(selectedBarangay.id, 'reject')}
                      disabled={isProcessing}
                      className="px-4 py-2 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider border border-red-900 bg-red-950/50 text-red-400 hover:bg-red-900/60 hover:border-red-700 transition-colors flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                    <button
                      onClick={() => openDialog(selectedBarangay.id, 'approve')}
                      disabled={isProcessing}
                      className="px-5 py-2 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider bg-teal-700 hover:bg-teal-600 border border-teal-600 text-teal-50 transition-colors flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                  </div>
                )}

                {/* Approved/rejected state footer */}
                {(selectedManifest.status === 'approved' || selectedManifest.status === 'rejected') && (
                  <div className={`shrink-0 border-t px-6 py-3 flex items-center gap-2 text-[11px] font-mono ${
                    selectedManifest.status === 'approved'
                      ? 'border-teal-900/50 bg-teal-950/20 text-teal-500'
                      : 'border-red-900/50 bg-red-950/20 text-red-500'
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