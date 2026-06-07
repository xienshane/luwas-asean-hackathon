'use client';

import React, { useState } from 'react';
import {
  FileText,
  Check,
  AlertOctagon,
  Clock,
  ChevronDown,
  ChevronUp,
  Filter,
  MapPin
} from 'lucide-react';
import { FieldReport } from '@/lib/mockData';

interface ReportsViewProps {
  reports: FieldReport[];
  onConfirmReport: (id: string) => void;
  onFlagReport: (id: string) => void;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-950 text-red-300 border-red-800',
  high:     'bg-orange-950 text-orange-300 border-orange-800',
  medium:   'bg-amber-950 text-amber-300 border-amber-800',
  low:      'bg-slate-800 text-slate-400 border-slate-700',
};

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-amber-950 text-amber-300 border-amber-800',
  confirmed: 'bg-teal-950 text-teal-300 border-teal-800',
  flagged:   'bg-red-950 text-red-400 border-red-800',
};

const SOURCE_LABEL: Record<string, string> = {
  app:    'Mobile App',
  sms:    'SMS',
  parsed: 'AI-Parsed',
};

export default function ReportsView({ reports, onConfirmReport, onFlagReport }: ReportsViewProps) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'confirmed' | 'flagged'>('all');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = reports
    .filter(r => filterStatus === 'all' || r.status === filterStatus)
    .filter(r => filterSeverity === 'all' || r.needsSeverity === filterSeverity)
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.needsSeverity] ?? 4) - (order[b.needsSeverity] ?? 4);
    });

  const pendingCount = reports.filter(r => r.status === 'pending').length;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-teal-400" />
          <h2 className="font-bold text-sm uppercase tracking-wider text-slate-300">Field Reports</h2>
          {pendingCount > 0 && (
            <span className="bg-amber-950 border border-amber-800 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {pendingCount} awaiting verification
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
            className="bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-teal-600 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="flagged">Flagged</option>
          </select>
          <select
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value as typeof filterSeverity)}
            className="bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-teal-600 cursor-pointer"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_140px_90px_80px_90px_100px] gap-0 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-900/60 border-b border-slate-800 px-6 py-2 sticky top-0 z-10">
          <span>Report / Location</span>
          <span>Reporter</span>
          <span>Source</span>
          <span>Severity</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-40 text-slate-600 italic text-sm">
            No reports match the current filter.
          </div>
        )}

        {filtered.map(report => {
          const isExpanded = expandedId === report.id;
          const ago = Math.round((Date.now() - new Date(report.createdAt).getTime()) / 60000);
          const agoStr = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;

          return (
            <div key={report.id} className="border-b border-slate-800/60 hover:bg-slate-900/30 transition-colors">
              {/* Main row */}
              <div className="grid grid-cols-[1fr_140px_90px_80px_90px_100px] gap-0 px-6 py-3 items-center text-xs">
                {/* Report text + barangay */}
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-mono text-slate-500">#{report.id}</span>
                    <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                      <MapPin className="w-2.5 h-2.5" />{report.barangayName}
                    </span>
                    <span className="text-[10px] text-slate-600 flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />{agoStr}
                    </span>
                  </div>
                  <p className="text-slate-300 truncate text-[11.5px]">"{report.rawText}"</p>
                </div>

                {/* Reporter */}
                <span className="text-slate-400 text-[11px] truncate">{report.reporterName}</span>

                {/* Source */}
                <span className="text-slate-400 text-[11px]">{SOURCE_LABEL[report.source]}</span>

                {/* Severity */}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase w-fit ${SEVERITY_STYLES[report.needsSeverity]}`}>
                  {report.needsSeverity}
                </span>

                {/* Status */}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase w-fit ${STATUS_STYLES[report.status]}`}>
                  {report.status}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1.5 justify-end">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : report.id)}
                    className="p-1 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    title="Expand"
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {report.status === 'pending' && (
                    <>
                      <button
                        onClick={() => onConfirmReport(report.id)}
                        className="px-2 py-1 bg-teal-900/70 hover:bg-teal-800 border border-teal-700 text-teal-300 font-bold rounded flex items-center gap-0.5 cursor-pointer transition-colors text-[10px]"
                      >
                        <Check className="w-3 h-3" /> Confirm
                      </button>
                      <button
                        onClick={() => onFlagReport(report.id)}
                        className="px-2 py-1 bg-red-950/70 hover:bg-red-900 border border-red-800 text-red-400 font-bold rounded flex items-center gap-0.5 cursor-pointer transition-colors text-[10px]"
                      >
                        <AlertOctagon className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-6 pb-4 grid grid-cols-2 gap-4 bg-slate-900/20 border-t border-slate-800/40">
                  <div className="pt-3 space-y-2">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Full Report Text</p>
                    <p className="text-[12px] text-slate-300 leading-relaxed italic bg-slate-900/60 border border-slate-800 rounded p-3">
                      "{report.rawText}"
                    </p>
                  </div>
                  <div className="pt-3 grid grid-cols-2 gap-3 text-[11px]">
                    {[
                      ['Confidence', `${Math.round(report.confidence * 100)}%`],
                      ['Est. Affected', report.populationEstimate.toLocaleString()],
                      ['Road Status', report.roadStatus],
                      ['Road Impassable', report.roadImpassable ? 'Yes' : 'No'],
                      ['Coordinates', `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`],
                      ['Reported At', new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })],
                    ].map(([label, value]) => (
                      <div key={label as string}>
                        <p className="text-[9px] uppercase font-bold text-slate-600">{label}</p>
                        <p className="text-slate-300 font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
