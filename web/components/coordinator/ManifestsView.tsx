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
  Truck,
  Check,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  Gauge,
  BarChart3,
  History,
  Archive,
  Filter
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
  approvedBy?: string;
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

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  actionType: 'approve' | 'reject';
  isProcessing?: boolean;
}

function ConfirmationDialog({ isOpen, title, message, onConfirm, onCancel, actionType, isProcessing = false }: ConfirmationDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className={`p-4 ${actionType === 'approve' ? 'bg-teal-950/50' : 'bg-red-950/50'} border-b border-slate-700`}>
          <div className="flex items-center gap-3">
            {actionType === 'approve' ? (
              <CheckCircle2 className="w-6 h-6 text-teal-400" />
            ) : (
              <AlertOctagon className="w-6 h-6 text-red-400" />
            )}
            <h3 className="font-bold text-lg text-slate-200">{title}</h3>
          </div>
        </div>
        <div className="p-6">
          <p className="text-slate-300">{message}</p>
        </div>
        <div className="p-4 border-t border-slate-700 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isProcessing}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              actionType === 'approve'
                ? 'bg-teal-600 hover:bg-teal-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {isProcessing ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              actionType === 'approve' ? <Check className="w-4 h-4" /> : <XCircle className="w-4 h-4" />
            )}
            {isProcessing ? 'Processing...' : `Confirm ${actionType === 'approve' ? 'Approval' : 'Rejection'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// Storage lock utility to prevent concurrent writes
const storageLock = {
  key: 'manifest-storage-lock',
  acquire: async (): Promise<boolean> => {
    const now = Date.now();
    const lockData = localStorage.getItem('manifest-storage-lock');
    if (lockData) {
      try {
        const lock = JSON.parse(lockData);
        // Lock expires after 2 seconds (prevents deadlocks)
        if (now - lock.timestamp < 2000) {
          return false;
        }
      } catch (e) {
        // Invalid lock data, proceed
      }
    }
    localStorage.setItem('manifest-storage-lock', JSON.stringify({ timestamp: now, id: Math.random() }));
    return true;
  },
  release: () => {
    localStorage.removeItem('manifest-storage-lock');
  }
};

export default function ManifestsView({
  barangays,
  manifests,
  predictions,
  onUpdateManifestStatus
}: ManifestsViewProps) {
  const [expandedBarangay, setExpandedBarangay] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmationDialog, setConfirmationDialog] = useState<{
    isOpen: boolean;
    barangayId: string;
    action: 'approve' | 'reject';
  }>({ isOpen: false, barangayId: '', action: 'approve' });
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  
  // Refs for managing async operations
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveQueueRef = useRef<HistoryEntry[]>([]);
  const isSavingRef = useRef(false);
  const pendingOperationsRef = useRef<Map<string, boolean>>(new Map());

  // Load history from localStorage on mount
  useEffect(() => {
    const loadHistory = async () => {
      let lockAcquired = false;
      for (let i = 0; i < 3; i++) {
        if (await storageLock.acquire()) {
          lockAcquired = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (!lockAcquired) {
        console.warn('Could not acquire lock for loading history');
        return;
      }
      
      try {
        const savedHistory = localStorage.getItem('manifest-history');
        if (savedHistory) {
          const parsed = JSON.parse(savedHistory);
          setHistory(parsed.map((entry: any) => ({
            ...entry,
            timestamp: new Date(entry.timestamp)
          })));
        }
      } catch (e) {
        console.error('Failed to load history', e);
      } finally {
        storageLock.release();
      }
    };
    
    loadHistory();
  }, []);

  // Save history to localStorage with queue system to prevent conflicts
  const saveToLocalStorage = useCallback(async (historyData: HistoryEntry[]) => {
    // If a save is already in progress, queue this data
    if (isSavingRef.current) {
      saveQueueRef.current = historyData;
      return;
    }
    
    isSavingRef.current = true;
    
    // Acquire lock with retry
    let lockAcquired = false;
    for (let i = 0; i < 5; i++) {
      if (await storageLock.acquire()) {
        lockAcquired = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50 + (i * 50)));
    }
    
    if (!lockAcquired) {
      console.warn('Could not acquire storage lock after retries, skipping save');
      isSavingRef.current = false;
      return;
    }
    
    try {
      // Small delay to ensure any pending operations complete
      await new Promise(resolve => setTimeout(resolve, 10));
      localStorage.setItem('manifest-history', JSON.stringify(historyData));
      
      // Check if there's queued data that needs to be saved
      if (saveQueueRef.current.length > 0) {
        const queuedData = saveQueueRef.current;
        saveQueueRef.current = [];
        await saveToLocalStorage(queuedData);
      }
    } catch (error) {
      console.error('Failed to save history:', error);
    } finally {
      storageLock.release();
      isSavingRef.current = false;
    }
  }, []);

  // Debounced save effect
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      if (history.length > 0) {
        saveToLocalStorage(history);
      }
    }, 500);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [history, saveToLocalStorage]);

  const addToHistory = useCallback((barangayId: string, barangayName: string, action: 'approved' | 'rejected' | 'modified', manifest: SupplyManifest) => {
    // Check for duplicate pending operation
    const operationKey = `${barangayId}-${action}`;
    if (pendingOperationsRef.current.has(operationKey)) {
      console.warn('Duplicate operation prevented:', operationKey);
      return;
    }
    
    pendingOperationsRef.current.set(operationKey, true);
    
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random()}`,
      barangayId,
      barangayName,
      action,
      timestamp: new Date(),
      manifestSnapshot: JSON.parse(JSON.stringify(manifest)),
      approvedBy: 'Current User'
    };
    
    setHistory(prev => {
      // Prevent duplicate entries for the same manifest and action within a short time
      const lastEntry = prev[0];
      if (lastEntry && 
          lastEntry.barangayId === barangayId && 
          lastEntry.action === action &&
          Date.now() - lastEntry.timestamp.getTime() < 1000) {
        pendingOperationsRef.current.delete(operationKey);
        return prev;
      }
      
      const newHistory = [entry, ...prev].slice(0, 50);
      
      // Clear the operation flag after a short delay
      setTimeout(() => {
        pendingOperationsRef.current.delete(operationKey);
      }, 500);
      
      return newHistory;
    });
  }, []);

  const handleStatusUpdate = useCallback((barangayId: string, action: 'approved' | 'rejected') => {
    setConfirmationDialog({
      isOpen: true,
      barangayId,
      action: action === 'approved' ? 'approve' : 'reject'
    });
  }, []);

  const confirmStatusUpdate = useCallback(async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    
    const { barangayId, action } = confirmationDialog;
    const barangay = barangays.find(b => b.id === barangayId);
    const manifest = manifests[barangayId];
    const resolvedAction: 'approved' | 'rejected' = action === 'approve' ? 'approved' : 'rejected';

    if (barangay && manifest) {
      try {
        // Add to history first
        addToHistory(barangayId, barangay.name, resolvedAction, manifest);
        
        // Give React time to update state and prevent race conditions
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Update the manifest status
        onUpdateManifestStatus(barangayId, resolvedAction);
        
        // Wait for the status update to complete
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error('Error updating manifest status:', error);
      } finally {
        // Close dialog and reset processing state
        setConfirmationDialog({ isOpen: false, barangayId: '', action: 'approve' });
        setIsProcessing(false);
      }
    } else {
      setConfirmationDialog({ isOpen: false, barangayId: '', action: 'approve' });
      setIsProcessing(false);
    }
  }, [confirmationDialog, barangays, manifests, addToHistory, onUpdateManifestStatus, isProcessing]);

  const cancelStatusUpdate = useCallback(() => {
    if (isProcessing) return;
    setConfirmationDialog({ isOpen: false, barangayId: '', action: 'approve' });
  }, [isProcessing]);

  // Compute metrics
  const pendingManifests = Object.values(manifests).filter(m => m.status === 'pending');
  const approvedManifests = Object.values(manifests).filter(m => m.status === 'approved');
  const rejectedManifests = Object.values(manifests).filter(m => m.status === 'rejected');
  
  const pendingCount = pendingManifests.length;
  const approvedCount = approvedManifests.length;
  const rejectedCount = rejectedManifests.length;
  
  const totalShortfalls = pendingManifests.reduce((sum, manifest) => {
    const manifestShortfall = SUPPLY_ROWS.reduce((rowSum, row) => {
      return rowSum + (manifest[row.key].shortfall || 0);
    }, 0);
    return sum + manifestShortfall;
  }, 0);

  const filteredBarangays = barangays.filter(barangay => {
    const manifest = manifests[barangay.id];
    if (!manifest) return false;
    if (filterStatus === 'all') return true;
    if (filterStatus === 'pending') return manifest.status === 'pending';
    if (filterStatus === 'approved') return manifest.status === 'approved';
    if (filterStatus === 'rejected') return manifest.status === 'rejected';
    return true;
  });

  const sorted = [...filteredBarangays].sort((a, b) => {
    const pa = predictions[a.id]?.predictedAffected ?? 0;
    const pb = predictions[b.id]?.predictedAffected ?? 0;
    
    if (filterStatus === 'pending') {
      return pb - pa;
    }
    return 0;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      <ConfirmationDialog
        isOpen={confirmationDialog.isOpen}
        title={confirmationDialog.action === 'approve' ? 'Approve Manifest' : 'Reject Manifest'}
        message={confirmationDialog.action === 'approve' 
          ? 'Are you sure you want to approve this supply manifest? This will mark it as ready for dispatch and move it to the history.'
          : 'Are you sure you want to reject this supply manifest? This action cannot be undone and the manifest will be moved to history.'}
        onConfirm={confirmStatusUpdate}
        onCancel={cancelStatusUpdate}
        actionType={confirmationDialog.action}
        isProcessing={isProcessing}
      />

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-slate-300 transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              {showHistory ? 'Show Active' : 'View History'}
            </button>
            <span className="text-[10px] text-slate-500 font-mono">Last updated: {new Date().toLocaleTimeString()}</span>
          </div>
        </div>

        {!showHistory && (
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
              <p className="text-[9px] text-slate-500 uppercase font-bold">Pending Items</p>
              <p className="text-xl font-bold text-blue-400">{pendingCount}</p>
            </div>
          </div>
        )}

        {!showHistory && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
                filterStatus === 'pending'
                  ? 'bg-amber-950 border border-amber-800 text-amber-300'
                  : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-300'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Pending Only
            </button>
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
                filterStatus === 'all'
                  ? 'bg-slate-700 border border-slate-600 text-slate-200'
                  : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-300'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              All Active
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {showHistory ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <History className="w-4 h-4 text-teal-400" />
                Approval & Rejection History
              </h3>
              <button
                onClick={() => {
                  if (confirm('Clear all history?')) {
                    setHistory([]);
                  }
                }}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Clear History
              </button>
            </div>
            {history.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No history yet</p>
                <p className="text-xs mt-1">Approved or rejected manifests will appear here</p>
              </div>
            ) : (
              history.map(entry => (
                <div key={entry.id} className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg ${
                        entry.action === 'approved' ? 'bg-teal-950' : 'bg-red-950'
                      }`}>
                        {entry.action === 'approved' ? (
                          <CheckCircle2 className="w-4 h-4 text-teal-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-200">{entry.barangayName}</p>
                        <p className="text-[10px] text-slate-500">
                          {entry.action === 'approved' ? 'Approved' : 'Rejected'} by {entry.approvedBy}
                        </p>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {entry.timestamp.toLocaleString()}
                    </p>
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-[10px]">
                    {SUPPLY_ROWS.map(row => {
                      const item = entry.manifestSnapshot[row.key];
                      return (
                        <div key={row.key} className="text-center">
                          <p className="text-slate-500">{row.label}</p>
                          <p className="text-slate-300 font-mono">
                            {item.inventory.toLocaleString()} / {item.recommended.toLocaleString()} {row.unit}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          sorted.map(barangay => {
            const manifest = manifests[barangay.id];
            const pred = predictions[barangay.id];
            if (!manifest) return null;
            
            if (manifest.status === 'approved' || manifest.status === 'rejected') return null;

            const effectiveAffected = pred?.overrideValue ?? pred?.predictedAffected ?? 0;
            const statusCfg = STATUS_CONFIG[manifest.status] ?? STATUS_CONFIG.pending;
            const hasShortfall = SUPPLY_ROWS.some(row => manifest[row.key].shortfall > 0);
            const isExpanded = expandedBarangay === barangay.id;
            const isCritical = pred?.damageSeverity === 'severe' || pred?.confidence === 'high';
            
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
                            <span className={`font-mono font-bold ${hasShortfall ? 'text-red-400' : 'text-teal-400'}`}>
                              {SUPPLY_ROWS.reduce((sum, row) => sum + manifest[row.key].shortfall, 0).toLocaleString()} units
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {(manifest.status === 'pending' || manifest.status === 'modified') && (
                  <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-900/40 flex items-center justify-end gap-2">
                    <span className="text-[10px] text-slate-500 mr-auto flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Human approval required before dispatch
                    </span>
                    <button
                      onClick={() => handleStatusUpdate(barangay.id, 'approved')}
                      disabled={isProcessing}
                      className="px-3 py-1.5 bg-teal-900/80 hover:bg-teal-800 border border-teal-700 text-teal-200 font-bold rounded-lg text-[11px] cursor-pointer transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(barangay.id, 'rejected')}
                      disabled={isProcessing}
                      className="px-3 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 font-bold rounded-lg text-[11px] cursor-pointer transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}