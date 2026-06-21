'use client';

import React from 'react';
import { ChevronRight, Check, Flag } from 'lucide-react';
import type { FieldReport, Route, SupplyManifest, Barangay } from '@/lib/types/coordinator';
import { SeverityRail, StatusDot, DetailPanel, SEVERITY_TONE } from './ui';

interface OperationsPanelProps {
  reports: FieldReport[];
  routes: Route[];
  manifests: Record<string, SupplyManifest>;
  barangays: Barangay[];
  onSelectReport: (r: FieldReport) => void;
  onConfirmReport: (id: string) => void;
  onFlagReport: (id: string) => void;
  onViewChange: (view: string) => void;
}

const SOURCE_LABEL: Record<string, string> = { app: 'Mobile App', sms: 'SMS', parsed: 'AI-Parsed' };
const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SHORT_KEYS = ['waterL', 'foodPacks', 'hygieneKits', 'medicalSupplies', 'shelterMaterials'] as const;

// Pinned locale + timezone so the formatted instant is identical on the server
// (typically UTC) and the client browser — otherwise it re-introduces the
// hydration mismatch independently of the timestamp itself. Cebu = Asia/Manila.
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Manila',
  });

// Persistent right rail — Operations (triage) mode. Selection swaps this out for
// the entity detail panel (handled in CommandDashboard).
export default function OperationsPanel({
  reports,
  routes,
  manifests,
  barangays,
  onSelectReport,
  onConfirmReport,
  onFlagReport,
  onViewChange,
}: OperationsPanelProps) {
  const pending = reports.filter((r) => r.status === 'pending');
  const critical = pending.filter((r) => r.needsSeverity === 'critical').length;
  const dispatchQueue = routes.filter((r) => r.status === 'planned').length;
  const supplyShortages = barangays.filter((b) => {
    const m = manifests[b.id];
    return m && SHORT_KEYS.some((k) => (m[k]?.shortfall ?? 0) > 0);
  }).length;

  const queue = [...pending].sort(
    (a, b) =>
      SEVERITY_ORDER[a.needsSeverity] - SEVERITY_ORDER[b.needsSeverity] ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const counters: { label: string; count: number; critical?: boolean; view: string }[] = [
    { label: 'Needs verification', count: pending.length, view: 'reports' },
    { label: 'Critical incidents', count: critical, critical: true, view: 'reports' },
    { label: 'Dispatch queue', count: dispatchQueue, view: 'teams' },
    { label: 'Supply shortages', count: supplyShortages, view: 'manifests' },
  ];

  return (
    <DetailPanel
      className="luwas-rail-swap w-[25%] min-w-[340px] max-w-[360px] shrink-0"
      eyebrow="Operations"
      title={pending.length > 0 ? `${pending.length} awaiting` : 'All clear'}
    >
      <div>
        {/* Action counters */}
        <div className="border-b border-line">
          {counters.map((c) => (
            <button
              key={c.label}
              onClick={() => onViewChange(c.view)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-raised/40 transition-colors duration-100 cursor-pointer"
            >
              <span className="flex items-center gap-2 text-[14px] text-fg">
                {c.critical && <StatusDot tone="critical" />}
                {c.label}
              </span>
              <span className="flex items-center gap-2">
                <span className={`text-[14px] tabular-nums ${c.critical && c.count > 0 ? 'text-critical' : 'text-muted'}`}>
                  {c.count}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-muted" />
              </span>
            </button>
          ))}
        </div>

        {/* Awaiting verification queue */}
        <div className="px-4 py-2 text-[13px] text-muted">Awaiting verification</div>
        {queue.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted">All reports verified.</div>
        ) : (
          queue.map((r) => (
            <div
              key={r.id}
              onClick={() => onSelectReport(r)}
              className="group relative px-4 py-3 border-t border-line hover:bg-raised/40 transition-colors duration-100 cursor-pointer"
            >
              <SeverityRail tone={SEVERITY_TONE[r.needsSeverity] ?? 'neutral'} />
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-[14px] font-medium text-fg truncate">{r.barangayName}</span>
                <span className="text-[12px] text-muted font-mono tabular-nums shrink-0">{hhmm(r.createdAt)}</span>
              </div>
              <p className="text-[13px] text-muted leading-snug line-clamp-2 mb-2">{r.translatedText ?? r.rawText}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-muted truncate">
                  {SOURCE_LABEL[r.source]} · {r.reporterName}
                </span>
                {/* Actions stay hidden until the row is hovered/focused so the
                    queue reads lightly; the green Confirm and red Flag reveal
                    together. focus-within keeps them keyboard-reachable. */}
                <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onConfirmReport(r.id);
                    }}
                    className="flex items-center gap-1 px-2 py-1 border border-active/40 bg-active/10 text-active hover:bg-active/20 rounded-control text-[12px] transition-colors duration-100 cursor-pointer"
                  >
                    <Check className="w-3 h-3" /> Confirm
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFlagReport(r.id);
                    }}
                    className="flex items-center gap-1 px-2 py-1 border border-critical/40 bg-critical/10 text-critical hover:bg-critical/20 rounded-control text-[12px] transition-colors duration-100 cursor-pointer"
                  >
                    <Flag className="w-3 h-3" /> Flag
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </DetailPanel>
  );
}
