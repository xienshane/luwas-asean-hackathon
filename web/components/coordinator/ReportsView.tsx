'use client';

import React, { useState, useMemo } from 'react';
import { Search, X, Check, Flag } from 'lucide-react';
import type { FieldReport } from '@/lib/types/coordinator';
import { DetailPanel, SeverityRail, StatusDot, Toolbar, SEVERITY_TONE } from './ui';

interface ReportsViewProps {
  reports: FieldReport[];
  onConfirmReport: (id: string) => void;
  onFlagReport: (reportId: string) => void;
  // Lazily fills the English translation for a report that lacks one, so the
  // detail panel can default to translated text even while a report is unconfirmed.
  onTranslateReport?: (reportId: string) => void;
}

const SOURCE_LABEL: Record<string, string> = {
  app: 'Mobile App',
  sms: 'SMS',
  parsed: 'AI-Parsed',
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

export default function ReportsView({ reports, onConfirmReport, onFlagReport, onTranslateReport }: ReportsViewProps) {
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [filterSource, setFilterSource] = useState<'all' | 'app' | 'sms' | 'parsed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Detail panel shows the English translation by default; toggle reveals the original.
  // Keyed by report id so switching reports resets to the translation automatically.
  const [originalForId, setOriginalForId] = useState<string | null>(null);

  const match = (r: FieldReport) =>
    (filterSeverity === 'all' || r.needsSeverity === filterSeverity) &&
    (filterSource === 'all' || r.source === filterSource) &&
    (searchQuery === '' ||
      r.rawText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.barangayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reporterName.toLowerCase().includes(searchQuery.toLowerCase()));

  const pending = useMemo(
    () =>
      reports
        .filter((r) => r.status === 'pending' && match(r))
        .sort((a, b) => SEVERITY_ORDER[a.needsSeverity] - SEVERITY_ORDER[b.needsSeverity]),
    [reports, filterSeverity, filterSource, searchQuery]
  );
  const flagged = useMemo(
    () => reports.filter((r) => r.status === 'flagged' && match(r)),
    [reports, filterSeverity, filterSource, searchQuery]
  );
  const confirmed = useMemo(
    () =>
      reports
        .filter((r) => r.status === 'confirmed' && match(r))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [reports, filterSeverity, filterSource, searchQuery]
  );

  const selected = selectedId ? reports.find((r) => r.id === selectedId) ?? null : null;
  const hasFilters = filterSeverity !== 'all' || filterSource !== 'all' || searchQuery !== '';

  // Open a report and lazily request its translation if it doesn't have one yet,
  // so the detail panel shows English by default — confirmed or not.
  const select = (r: FieldReport) => {
    setSelectedId(r.id);
    if (!r.translatedText) onTranslateReport?.(r.id);
  };

  const toggleCheck = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulk = (fn: (id: string) => void) => {
    checked.forEach(fn);
    setChecked(new Set());
  };

  return (
    <div className="flex-1 flex h-full bg-bg overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <Toolbar>
          <span className="text-[15px] font-medium text-fg">Field Reports</span>
          <div className="relative ml-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reports…"
              className="w-56 bg-surface border border-line-strong rounded-control pl-8 pr-7 py-1.5 text-[13px] text-fg placeholder:text-muted focus:outline-none focus:border-muted"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-fg">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as typeof filterSeverity)}
            className="bg-surface border border-line-strong text-[13px] text-fg rounded-control px-2.5 py-1.5 focus:outline-none focus:border-muted cursor-pointer"
          >
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value as typeof filterSource)}
            className="bg-surface border border-line-strong text-[13px] text-fg rounded-control px-2.5 py-1.5 focus:outline-none focus:border-muted cursor-pointer"
          >
            <option value="all">All sources</option>
            <option value="app">Mobile App</option>
            <option value="sms">SMS</option>
            <option value="parsed">AI-Parsed</option>
          </select>

          <button
            onClick={() => setShowHistory((s) => !s)}
            className={`ml-auto px-2.5 py-1.5 text-[13px] rounded-control border transition-colors duration-100 cursor-pointer ${
              showHistory ? 'bg-raised border-line text-fg' : 'border-line text-muted hover:text-fg'
            }`}
          >
            History
          </button>
        </Toolbar>

        {/* Bulk action bar */}
        {checked.size > 0 && (
          <div className="flex items-center gap-3 px-4 h-10 border-b border-line bg-raised/40 text-[13px]">
            <span className="text-muted">{checked.size} selected</span>
            <button
              onClick={() => bulk(onConfirmReport)}
              className="flex items-center gap-1 px-2.5 py-1 border border-active/40 bg-active/10 text-active hover:bg-active/20 rounded-control transition-colors duration-100 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> Confirm
            </button>
            <button
              onClick={() => bulk(onFlagReport)}
              className="flex items-center gap-1 px-2.5 py-1 border border-line text-muted hover:text-critical hover:border-critical/40 rounded-control transition-colors duration-100 cursor-pointer"
            >
              <Flag className="w-3.5 h-3.5" /> Flag
            </button>
            <button onClick={() => setChecked(new Set())} className="ml-auto text-muted hover:text-fg cursor-pointer">
              Clear
            </button>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          <Section title="Needs verification" count={pending.length}>
            {pending.length === 0 ? (
              <Empty>{hasFilters ? 'No matching reports.' : 'Nothing awaiting verification.'}</Empty>
            ) : (
              pending.map((r) => (
                <Row
                  key={r.id}
                  report={r}
                  selected={selectedId === r.id}
                  checked={checked.has(r.id)}
                  onSelect={() => select(r)}
                  onCheck={() => toggleCheck(r.id)}
                  onConfirm={() => onConfirmReport(r.id)}
                  onFlag={() => onFlagReport(r.id)}
                />
              ))
            )}
          </Section>

          {flagged.length > 0 && (
            <Section title="Flagged" count={flagged.length}>
              {flagged.map((r) => (
                <Row
                  key={r.id}
                  report={r}
                  selected={selectedId === r.id}
                  checked={checked.has(r.id)}
                  onSelect={() => select(r)}
                  onCheck={() => toggleCheck(r.id)}
                  onConfirm={() => onConfirmReport(r.id)}
                />
              ))}
            </Section>
          )}

          {showHistory && (
            <Section title="Confirmed" count={confirmed.length}>
              {confirmed.length === 0 ? (
                <Empty>No confirmed reports.</Empty>
              ) : (
                confirmed.map((r) => (
                  <Row key={r.id} report={r} selected={selectedId === r.id} onSelect={() => select(r)} muted />
                ))
              )}
            </Section>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <DetailPanel
          className="w-[360px]"
          eyebrow={`#${selected.id} · ${SOURCE_LABEL[selected.source]}`}
          title={selected.barangayName}
          subtitle={`${ago(selected.createdAt)} · ${selected.reporterName}`}
          onClose={() => setSelectedId(null)}
          footer={
            selected.status !== 'confirmed' ? (
              <div className="flex items-center gap-2 p-3">
                <button
                  onClick={() => {
                    onConfirmReport(selected.id);
                    setSelectedId(null);
                  }}
                  className="flex-1 py-2 border border-active/40 bg-active/10 text-active hover:bg-active/20 rounded-control font-medium flex items-center justify-center gap-1.5 transition-colors duration-100 cursor-pointer"
                >
                  <Check className="w-4 h-4" /> {selected.status === 'flagged' ? 'Confirm & unflag' : 'Confirm'}
                </button>
                {selected.status === 'pending' && (
                  <button
                    onClick={() => {
                      onFlagReport(selected.id);
                      setSelectedId(null);
                    }}
                    className="px-3 py-2 border border-line text-muted hover:text-critical hover:border-critical/40 rounded-control flex items-center gap-1.5 transition-colors duration-100 cursor-pointer"
                  >
                    <Flag className="w-4 h-4" /> Flag
                  </button>
                )}
              </div>
            ) : undefined
          }
        >
          <div className="p-4 space-y-4 text-[13px]">
            {(() => {
              const hasTranslation =
                !!selected.translatedText && selected.translatedText !== selected.rawText;
              const showingOriginal = originalForId === selected.id || !hasTranslation;
              return (
                <div className="space-y-1.5">
                  {hasTranslation && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted">
                        {showingOriginal ? 'Original' : 'Translated · machine'}
                      </span>
                      <button
                        onClick={() => setOriginalForId((cur) => (cur === selected.id ? null : selected.id))}
                        className="text-[12px] text-active hover:underline cursor-pointer"
                      >
                        {showingOriginal ? 'Show translation' : 'Show original'}
                      </button>
                    </div>
                  )}
                  <div className="bg-surface border border-line rounded-control p-3 text-fg leading-relaxed">
                    &ldquo;{showingOriginal ? selected.rawText : selected.translatedText}&rdquo;
                  </div>
                </div>
              );
            })()}
            <div className="grid grid-cols-2 gap-y-3 gap-x-4">
              <Meta label="Severity">
                <span className="flex items-center gap-1.5 capitalize">
                  <StatusDot tone={SEVERITY_TONE[selected.needsSeverity] ?? 'neutral'} />
                  {selected.needsSeverity}
                </span>
              </Meta>
              <Meta label="Est. affected">
                <span className="font-mono tabular-nums">{selected.populationEstimate.toLocaleString()}</span>
              </Meta>
              <Meta label="Road status">{selected.roadStatus}</Meta>
              <Meta label="Confidence">
                <span className="font-mono tabular-nums">{Math.round(selected.confidence * 100)}%</span>
              </Meta>
              <Meta label="Coordinates">
                <span className="font-mono tabular-nums text-[12px]">
                  {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
                </span>
              </Meta>
              <Meta label="Received">{new Date(selected.createdAt).toLocaleString()}</Meta>
            </div>
          </div>
        </DetailPanel>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="sticky top-0 z-10 bg-bg/95 px-4 py-2 border-b border-line flex items-center gap-2">
        <h3 className="text-[13px] font-medium text-fg">{title}</h3>
        <span className="text-[12px] text-muted tabular-nums">{count}</span>
      </div>
      {children}
    </section>
  );
}

function Row({
  report,
  selected,
  checked,
  onSelect,
  onCheck,
  onConfirm,
  onFlag,
  muted,
}: {
  report: FieldReport;
  selected: boolean;
  checked?: boolean;
  onSelect: () => void;
  onCheck?: () => void;
  onConfirm?: () => void;
  onFlag?: () => void;
  muted?: boolean;
}) {
  return (
    <div
      onClick={onSelect}
      className={`group relative flex items-center gap-3 px-4 py-1.5 border-b border-line cursor-pointer transition-colors duration-100 ${
        selected ? 'bg-raised' : 'hover:bg-raised/40'
      } ${muted ? 'opacity-70 hover:opacity-100' : ''}`}
    >
      <SeverityRail tone={SEVERITY_TONE[report.needsSeverity] ?? 'neutral'} />
      {onCheck && (
        <input
          type="checkbox"
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={onCheck}
          className="w-3.5 h-3.5 shrink-0 cursor-pointer accent-[var(--color-muted)]"
        />
      )}
      <span className="font-mono tabular-nums text-[12px] text-muted shrink-0 w-10">#{report.id}</span>
      <span className="text-[13px] text-fg shrink-0 w-28 truncate">{report.barangayName}</span>
      <span className="font-mono tabular-nums text-[12px] text-muted shrink-0 w-16">{ago(report.createdAt)}</span>
      <span className="text-[13px] text-muted truncate flex-1">{report.translatedText ?? report.rawText}</span>
      <span className="text-[12px] text-muted shrink-0 w-20 truncate hidden lg:block">{SOURCE_LABEL[report.source]}</span>
      {(onConfirm || onFlag) && (
        <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
          {onConfirm && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfirm();
              }}
              title="Confirm"
              className="px-2 py-1 border border-active/40 bg-active/10 text-active hover:bg-active/20 rounded-control text-[12px] flex items-center gap-1 cursor-pointer transition-colors duration-100"
            >
              <Check className="w-3 h-3" /> Confirm
            </button>
          )}
          {onFlag && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFlag();
              }}
              title="Flag"
              className="px-2 py-1 border border-line text-muted hover:text-critical hover:border-critical/40 rounded-control text-[12px] flex items-center gap-1 cursor-pointer transition-colors duration-100"
            >
              <Flag className="w-3 h-3" /> Flag
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] text-muted mb-0.5">{label}</div>
      <div className="text-fg">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-[13px] text-muted">{children}</div>;
}
