'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { SupplyManifest, Barangay, ImpactPrediction } from '@/lib/types/coordinator';
import {
  StatusDot,
  Toolbar,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from './ui';
import type { Tone } from './ui';
import { pickAffected } from '@/lib/pipeline/affected';

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
  { key: 'waterL', label: 'Water', unit: 'L' },
  { key: 'foodPacks', label: 'Food packs', unit: 'packs' },
  { key: 'hygieneKits', label: 'Hygiene kits', unit: 'kits' },
  { key: 'medicalSupplies', label: 'Medical', unit: 'packs' },
  { key: 'shelterMaterials', label: 'Shelter', unit: 'units' },
] as const;

const STATUS_TONE: Record<string, Tone> = {
  pending: 'warning',
  approved: 'active',
  rejected: 'critical',
  modified: 'warning',
};

// ── Confirmation dialog (de-glassed) ────────────────────────────────────────
function ConfirmationDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  actionType,
  isProcessing = false,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  actionType: 'approve' | 'reject';
  isProcessing?: boolean;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface border border-line rounded-card shadow-modal max-w-sm w-full mx-4 overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <h3 className="text-[15px] font-medium text-fg">{title}</h3>
        </div>
        <p className="px-4 py-3 text-[14px] text-muted leading-relaxed">{message}</p>
        <div className="px-4 py-3 border-t border-line flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="px-4 py-2 text-[13px] text-muted hover:text-fg border border-line rounded-control transition-colors duration-100 cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isProcessing}
            className={`px-4 py-2 text-[13px] font-medium rounded-control border transition-colors duration-100 cursor-pointer disabled:opacity-40 ${
              actionType === 'approve'
                ? 'border-active/40 bg-active/10 text-active hover:bg-active/20'
                : 'border-critical/40 bg-critical/10 text-critical hover:bg-critical/20'
            }`}
          >
            {isProcessing ? 'Processing…' : actionType === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ManifestsView({ barangays, manifests, predictions, onUpdateManifestStatus }: ManifestsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'all'>('pending');
  const [dialog, setDialog] = useState<{ open: boolean; id: string; action: 'approve' | 'reject' }>({
    open: false,
    id: '',
    action: 'approve',
  });
  const pendingOpsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const firstPending = barangays.find((b) => manifests[b.id]?.status === 'pending');
    if (firstPending && !selectedId) setSelectedId(firstPending.id);
  }, [barangays, manifests, selectedId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('manifest-history');
      if (raw) setHistory(JSON.parse(raw).map((e: HistoryEntry) => ({ ...e, timestamp: new Date(e.timestamp) })));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (history.length === 0) return;
    try {
      localStorage.setItem('manifest-history', JSON.stringify(history));
    } catch {
      /* ignore */
    }
  }, [history]);

  const addToHistory = useCallback(
    (id: string, name: string, action: 'approved' | 'rejected', manifest: SupplyManifest) => {
      const opKey = `${id}-${action}-${Date.now()}`;
      if (pendingOpsRef.current.has(opKey)) return;
      pendingOpsRef.current.add(opKey);
      setTimeout(() => pendingOpsRef.current.delete(opKey), 1000);
      setHistory((prev) =>
        [
          { id: opKey, barangayId: id, barangayName: name, action, timestamp: new Date(), manifestSnapshot: JSON.parse(JSON.stringify(manifest)) },
          ...prev,
        ].slice(0, 50)
      );
    },
    []
  );

  const confirmAction = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    const { id, action } = dialog;
    const b = barangays.find((x) => x.id === id);
    const m = manifests[id];
    const resolved = action === 'approve' ? 'approved' : 'rejected';
    if (b && m) {
      addToHistory(id, b.name, resolved, m);
      await new Promise((r) => setTimeout(r, 120));
      onUpdateManifestStatus(id, resolved);
      const remaining = barangays.filter((x) => x.id !== id && manifests[x.id]?.status === 'pending');
      setSelectedId(remaining[0]?.id ?? null);
    }
    setDialog({ open: false, id: '', action: 'approve' });
    setIsProcessing(false);
  }, [dialog, barangays, manifests, addToHistory, onUpdateManifestStatus, isProcessing]);

  const pending = barangays.filter((b) => manifests[b.id]?.status === 'pending');
  const approved = barangays.filter((b) => manifests[b.id]?.status === 'approved');

  // Approved manifests float to the top of the "all" view; affected count is the tiebreaker.
  // (The "pending" filter only contains pending, so the rank is a no-op there.)
  const approvedRank = (id: string) => (manifests[id]?.status === 'approved' ? 0 : 1);
  const listBarangays = (filterStatus === 'pending' ? pending : barangays.filter((b) => manifests[b.id])).sort(
    (a, b) =>
      approvedRank(a.id) - approvedRank(b.id) ||
      (predictions[b.id]?.predictedAffected ?? 0) - (predictions[a.id]?.predictedAffected ?? 0)
  );

  const selectedBarangay = barangays.find((b) => b.id === selectedId);
  const selectedManifest = selectedId ? manifests[selectedId] : null;
  const selectedPred = selectedId ? predictions[selectedId] : null;

  const totalShortfall = pending.reduce(
    (sum, b) => sum + SUPPLY_ROWS.reduce((s, r) => s + (manifests[b.id]?.[r.key]?.shortfall ?? 0), 0),
    0
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-bg overflow-hidden">
      <ConfirmationDialog
        isOpen={dialog.open}
        title={dialog.action === 'approve' ? 'Approve manifest' : 'Reject manifest'}
        message={
          dialog.action === 'approve'
            ? 'This manifest will be marked ready for dispatch.'
            : 'The manifest will be archived and the barangay notified.'
        }
        onConfirm={confirmAction}
        onCancel={() => {
          if (!isProcessing) setDialog({ open: false, id: '', action: 'approve' });
        }}
        actionType={dialog.action}
        isProcessing={isProcessing}
      />

      <Toolbar>
        <span className="text-[15px] font-medium text-fg">Supply Manifests</span>
        <span className="text-[13px] text-muted">Sphere Standard · 3-day</span>
        <div className="ml-auto flex items-center gap-3 text-[13px] text-muted">
          <span className="flex items-center gap-1.5">
            <StatusDot tone="warning" />
            <span className="font-mono tabular-nums">{pending.length}</span> pending
          </span>
          <span className="flex items-center gap-1.5">
            <StatusDot tone="active" />
            <span className="font-mono tabular-nums">{approved.length}</span> approved
          </span>
          {totalShortfall > 0 && (
            <span className="text-critical"><span className="font-mono tabular-nums">{totalShortfall.toLocaleString()}</span> short</span>
          )}
          <div className="flex border border-line-strong rounded-control overflow-hidden">
            {(['pending', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={`px-2.5 py-1 capitalize transition-colors duration-100 cursor-pointer ${
                  filterStatus === f ? 'bg-raised text-fg' : 'text-muted hover:text-fg'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowHistory((s) => !s)}
            className={`px-2.5 py-1 rounded-control border transition-colors duration-100 cursor-pointer ${
              showHistory ? 'bg-raised border-line-strong text-fg' : 'border-line-strong text-muted hover:text-fg'
            }`}
          >
            History
          </button>
        </div>
      </Toolbar>

      {showHistory ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-medium text-fg">Action log</h3>
            {history.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Clear all history?')) setHistory([]);
                }}
                className="text-[12px] text-muted hover:text-critical cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <div className="text-[13px] text-muted">No actions yet.</div>
          ) : (
            <div>
              {history.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 py-2 border-b border-line text-[13px]">
                  <StatusDot tone={STATUS_TONE[entry.action]} />
                  <span className="text-fg w-32 truncate">{entry.barangayName}</span>
                  <span className="text-muted capitalize w-20">{entry.action}</span>
                  <span className="ml-auto text-[12px] text-muted font-mono tabular-nums">
                    {entry.timestamp.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* List */}
          <div className="w-64 shrink-0 border-r border-line flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-line text-[12px] text-muted">
              {listBarangays.length} barangay{listBarangays.length !== 1 ? 's' : ''}
            </div>
            <div className="flex-1 overflow-y-auto">
              {listBarangays.length === 0 ? (
                <div className="px-3 py-10 text-center text-[13px] text-muted">
                  {Object.keys(manifests).length === 0
                    ? 'No manifests yet — awaiting impact predictions.'
                    : 'All manifests reviewed.'}
                </div>
              ) : (
                listBarangays.map((b) => {
                  const m = manifests[b.id];
                  if (!m) return null;
                  const p = predictions[b.id];
                  const affected = pickAffected({ override: p?.overrideValue, reported: p?.reportedAffected, predicted: p?.predictedAffected });
                  const isSelected = selectedId === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelectedId(b.id)}
                      className={`relative w-full text-left flex items-center gap-2.5 px-3 py-2.5 border-b border-line transition-colors duration-100 cursor-pointer ${
                        isSelected ? 'bg-raised' : 'hover:bg-raised/40'
                      }`}
                    >
                      <StatusDot tone={STATUS_TONE[m.status] ?? 'neutral'} />
                      <span className="min-w-0">
                        <span className="block text-[13px] text-fg truncate">{b.name}</span>
                        <span className="block text-[12px] text-muted font-mono tabular-nums">
                          {affected.toLocaleString()} affected
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Detail: resource table */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {!selectedManifest || !selectedBarangay ? (
              <div className="flex-1 flex items-center justify-center text-[13px] text-muted">Select a barangay.</div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-medium text-fg">{selectedBarangay.name}</h3>
                      <span className="flex items-center gap-1.5 text-[12px] text-muted capitalize">
                        <StatusDot tone={STATUS_TONE[selectedManifest.status] ?? 'neutral'} />
                        {selectedManifest.status}
                      </span>
                    </div>
                    <div className="text-[12px] text-muted">
                      {selectedBarangay.cityMunicipality} · Pop.{' '}
                      <span className="font-mono tabular-nums">{selectedBarangay.population.toLocaleString()}</span>
                      {selectedPred && (
                        <>
                          {' · '}
                          <span className="font-mono tabular-nums">
                            {pickAffected({ override: selectedPred.overrideValue, reported: selectedPred.reportedAffected, predicted: selectedPred.predictedAffected }).toLocaleString()}
                          </span>{' '}
                          affected
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Resource</TH>
                        <TH align="right">Required</TH>
                        <TH align="right">Available</TH>
                        <TH align="right">Gap</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {SUPPLY_ROWS.map((row) => {
                        const item = selectedManifest[row.key];
                        const gap = item.inventory - item.recommended;
                        const short = gap < 0;
                        return (
                          <TR key={row.key}>
                            <TD>{row.label}</TD>
                            <TD align="right" mono>
                              {item.recommended.toLocaleString()} {row.unit}
                            </TD>
                            <TD align="right" mono>
                              {item.inventory.toLocaleString()} {row.unit}
                            </TD>
                            <TD align="right" mono>
                              <span className={short ? 'text-critical' : 'text-muted'}>
                                {short ? '−' : '+'}
                                {Math.abs(gap).toLocaleString()}
                              </span>
                            </TD>
                          </TR>
                        );
                      })}
                      {/* Totals */}
                      {(() => {
                        const req = SUPPLY_ROWS.reduce((s, r) => s + selectedManifest[r.key].recommended, 0);
                        const inv = SUPPLY_ROWS.reduce((s, r) => s + selectedManifest[r.key].inventory, 0);
                        const gap = inv - req;
                        const short = gap < 0;
                        return (
                          <TR>
                            <TD muted>Total</TD>
                            <TD align="right" mono muted>
                              {req.toLocaleString()}
                            </TD>
                            <TD align="right" mono muted>
                              {inv.toLocaleString()}
                            </TD>
                            <TD align="right" mono>
                              <span className={short ? 'text-critical' : 'text-muted'}>
                                {short ? '−' : '+'}
                                {Math.abs(gap).toLocaleString()}
                              </span>
                            </TD>
                          </TR>
                        );
                      })()}
                    </TBody>
                  </Table>
                </div>

                {selectedManifest.status === 'pending' ? (
                  <div className="shrink-0 border-t border-line px-4 py-3 flex items-center gap-3">
                    <span className="text-[12px] text-muted mr-auto">Human approval required before dispatch</span>
                    <button
                      onClick={() => setDialog({ open: true, id: selectedBarangay.id, action: 'reject' })}
                      className="px-4 py-2 text-[13px] border border-line text-muted hover:text-critical hover:border-critical/40 rounded-control transition-colors duration-100 cursor-pointer"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => setDialog({ open: true, id: selectedBarangay.id, action: 'approve' })}
                      className="px-4 py-2 text-[13px] font-medium border border-active/40 bg-active/10 text-active hover:bg-active/20 rounded-control transition-colors duration-100 cursor-pointer"
                    >
                      Approve manifest
                    </button>
                  </div>
                ) : (
                  <div className="shrink-0 border-t border-line px-4 py-3 text-[13px] flex items-center gap-2">
                    <StatusDot tone={STATUS_TONE[selectedManifest.status] ?? 'neutral'} />
                    <span className="text-muted">
                      {selectedManifest.status === 'approved'
                        ? 'Approved and queued for dispatch.'
                        : selectedManifest.status === 'rejected'
                        ? 'Rejected — barangay notified.'
                        : 'Modified by coordinator.'}
                    </span>
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
