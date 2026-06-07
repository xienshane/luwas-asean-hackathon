'use client';

import React, { useState } from 'react';
import { 
  AlertTriangle, 
  Clock, 
  MapPin, 
  ShieldAlert, 
  TrendingUp, 
  Users, 
  MessageSquare, 
  Smartphone, 
  Cpu, 
  Check, 
  AlertOctagon, 
  Search, 
  Truck 
} from 'lucide-react';
import { Barangay, FieldReport, Team } from '@/lib/mockData';

interface SidebarAnalyticsProps {
  barangays: Barangay[];
  reports: FieldReport[];
  teams: Team[];
  selectedBarangay: Barangay | null;
  onSelectBarangay: (b: Barangay) => void;
  selectedReport: FieldReport | null;
  onSelectReport: (r: FieldReport) => void;
  scores: { barangayId: string; score: number; hoursSinceContact: number | null }[];
  onConfirmReport: (reportId: string) => void;
  onFlagReport: (reportId: string) => void;
}

export default function SidebarAnalytics({
  barangays,
  reports,
  teams,
  selectedBarangay,
  onSelectBarangay,
  selectedReport,
  onSelectReport,
  scores,
  onConfirmReport,
  onFlagReport
}: SidebarAnalyticsProps) {
  const [activeTab, setActiveTab] = useState<'silent' | 'reports' | 'teams'>('silent');
  const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'confirmed'>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  // Sort barangays by Silent Area Score (highest priority first)
  const getSortedBarangays = () => {
    return barangays
      .map(b => {
        const s = scores.find(score => score.barangayId === b.id) || { score: 0, hoursSinceContact: null };
        return {
          ...b,
          score: s.score,
          hoursSinceContact: s.hoursSinceContact
        };
      })
      .filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => b.score - a.score);
  };

  // Filter reports
  const getFilteredReports = () => {
    return reports
      .filter(r => {
        if (reportFilter === 'pending') return r.status === 'pending';
        if (reportFilter === 'confirmed') return r.status === 'confirmed';
        return true;
      })
      .filter(r => r.barangayName.toLowerCase().includes(searchQuery.toLowerCase()) || r.rawText.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  const formatHours = (hours: number | null) => {
    if (hours === null) return 'No contact (max)';
    if (hours < 1) return 'Less than 1h';
    return `${Math.round(hours)}h ago`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Search and Navigation */}
      <div className="p-4 bg-slate-900/60 border-b border-slate-800 space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search location, reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 pl-9 pr-4 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-slate-950 p-1 rounded-xl text-xs text-slate-400 font-medium">
          <button
            onClick={() => setActiveTab('silent')}
            className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'silent' ? 'bg-indigo-600 text-white font-bold' : 'hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Silent Areas
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 relative ${
              activeTab === 'reports' ? 'bg-indigo-600 text-white font-bold' : 'hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Reports
            {reports.filter(r => r.status === 'pending').length > 0 && (
              <span className="absolute -top-1 -right-1 w-4.5 h-4.5 bg-rose-500 text-white font-bold text-[9px] rounded-full flex items-center justify-center border-2 border-slate-900">
                {reports.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('teams')}
            className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'teams' ? 'bg-indigo-600 text-white font-bold' : 'hover:text-slate-200'
            }`}
          >
            <Truck className="w-3.5 h-3.5" /> Fleet
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {/* SILENT AREAS TAB */}
        {activeTab === 'silent' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[9px] text-slate-500 font-semibold px-1.5 mb-1.5 uppercase tracking-wider">
              <span>Barangay Priority Scoring</span>
              <span>Sorted by Score</span>
            </div>

            {getSortedBarangays().map((b) => {
              const isSelected = selectedBarangay?.id === b.id;
              
              // Define priority levels
              let cardBorder = 'border-slate-800/60';
              let badgeColor = 'bg-green-500/10 text-green-400 border border-green-500/20';
              let priorityText = 'Low Risk';

              if (b.score >= 0.6) {
                cardBorder = isSelected ? 'border-red-500' : 'border-red-900/40';
                badgeColor = 'bg-red-500/10 text-red-400 border border-red-500/30 animate-pulse';
                priorityText = 'CRITICAL SILENCE';
              } else if (b.score >= 0.3) {
                cardBorder = isSelected ? 'border-orange-500' : 'border-orange-950/40';
                badgeColor = 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
                priorityText = 'MODERATE';
              } else if (isSelected) {
                cardBorder = 'border-indigo-500';
              }

              return (
                <div
                  key={b.id}
                  onClick={() => onSelectBarangay(b)}
                  className={`bg-slate-950/40 hover:bg-slate-950/80 p-3 rounded-xl border ${cardBorder} cursor-pointer transition-all duration-200 flex flex-col gap-2`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{b.name}</h4>
                      <span className="text-[10px] text-slate-500">{b.cityMunicipality}</span>
                    </div>
                    
                    {/* Score Ring / Badge */}
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-slate-400 font-bold bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">
                        Score: {b.score.toFixed(2)}
                      </span>
                      <span className={`text-[8px] font-semibold mt-1 px-1 py-0.2 rounded uppercase ${badgeColor}`}>
                        {priorityText}
                      </span>
                    </div>
                  </div>

                  {/* Components breakdown */}
                  <div className="grid grid-cols-3 gap-1.5 text-[10px] text-slate-400 pt-2 border-t border-slate-900/80">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-500 uppercase font-semibold">Density</span>
                      <span className="font-medium">{b.population.toLocaleString()} / km²</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-500 uppercase font-semibold">Max Hazard</span>
                      <span className="font-medium">{Math.round(b.hazardComposite * 100)}%</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] text-slate-500 uppercase font-semibold">Silence</span>
                      <span className={`font-semibold ${b.hoursSinceContact === null || b.hoursSinceContact > 48 ? 'text-red-400 font-bold' : 'text-slate-400'}`}>
                        {formatHours(b.hoursSinceContact)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* REPORTS FEED TAB */}
        {activeTab === 'reports' && (
          <div className="space-y-2.5">
            {/* Sub filters */}
            <div className="flex gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800/80 text-[10px] text-slate-400 mb-1.5">
              <button
                onClick={() => setReportFilter('pending')}
                className={`flex-1 py-1 rounded-md transition-all ${
                  reportFilter === 'pending' ? 'bg-slate-800 text-amber-400 font-semibold' : 'hover:text-slate-200'
                }`}
              >
                Pending
              </button>
              <button
                onClick={() => setReportFilter('confirmed')}
                className={`flex-1 py-1 rounded-md transition-all ${
                  reportFilter === 'confirmed' ? 'bg-slate-800 text-indigo-400 font-semibold' : 'hover:text-slate-200'
                }`}
              >
                Confirmed
              </button>
              <button
                onClick={() => setReportFilter('all')}
                className={`flex-1 py-1 rounded-md transition-all ${
                  reportFilter === 'all' ? 'bg-slate-800 text-slate-200 font-semibold' : 'hover:text-slate-200'
                }`}
              >
                All
              </button>
            </div>

            {getFilteredReports().length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                No reports matching criteria.
              </div>
            ) : (
              getFilteredReports().map((r) => {
                const isSelected = selectedReport?.id === r.id;
                
                let sourceIcon = <Smartphone className="w-3.5 h-3.5 text-blue-400" />;
                if (r.source === 'sms') sourceIcon = <MessageSquare className="w-3.5 h-3.5 text-orange-400" />;
                if (r.source === 'parsed') sourceIcon = <Cpu className="w-3.5 h-3.5 text-purple-400" />;

                let sevBadge = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                if (r.needsSeverity === 'critical') sevBadge = 'bg-red-500/15 text-red-400 border border-red-500/30';
                if (r.needsSeverity === 'low') sevBadge = 'bg-green-500/10 text-green-400 border border-green-500/20';

                return (
                  <div
                    key={r.id}
                    onClick={() => onSelectReport(r)}
                    className={`bg-slate-950/40 hover:bg-slate-950/80 p-3 rounded-xl border ${
                      isSelected ? 'border-indigo-500 bg-slate-900/60' : 'border-slate-800/60'
                    } cursor-pointer transition-all duration-200 flex flex-col gap-2`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {sourceIcon}
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">
                          {r.source} Report
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded uppercase ${sevBadge}`}>
                          {r.needsSeverity}
                        </span>
                        <span className="text-[9px] text-slate-500 flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed bg-slate-950/50 p-1.5 rounded-lg border border-slate-900">
                      "{r.rawText}"
                    </p>

                    <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1 font-medium text-slate-300">
                        <MapPin className="w-3 h-3 text-indigo-400" /> {r.barangayName}
                      </span>
                      <span className="text-[9px] text-slate-500 bg-slate-900 border border-slate-800 px-1 py-0.2 rounded">
                        Confidence: {Math.round(r.confidence * 100)}%
                      </span>
                    </div>

                    {/* Report Confirmation Trigger Actions */}
                    {r.status === 'pending' && isSelected && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-900">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onConfirmReport(r.id);
                          }}
                          className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg flex items-center justify-center gap-1 text-[10px] transition-all cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" /> Confirm Contact
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onFlagReport(r.id);
                          }}
                          className="py-1.5 px-2.5 bg-slate-905 hover:bg-slate-800 text-slate-400 hover:text-red-400 border border-slate-800 rounded-lg flex items-center justify-center gap-1 text-[10px] transition-all cursor-pointer"
                          title="Flag report as unreliable"
                        >
                          <AlertOctagon className="w-3.5 h-3.5" /> Flag
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TEAMS/FLEET TAB */}
        {activeTab === 'teams' && (
          <div className="space-y-2">
            <div className="text-[9px] text-slate-500 font-semibold px-1.5 mb-1.5 uppercase tracking-wider">
              Logistics Fleet Status
            </div>

            {teams.map((t) => {
              let statusColor = 'bg-green-500/10 text-green-400 border border-green-500/20';
              if (t.status === 'dispatched') statusColor = 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
              if (t.status === 'maintenance') statusColor = 'bg-red-500/10 text-red-400 border border-red-500/20';

              return (
                <div
                  key={t.id}
                  className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-xl flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg">
                      <Truck className="w-4.5 h-4.5 text-indigo-400" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-200">{t.name}</h5>
                      <span className="text-[10px] text-slate-500">Max Cargo: {t.capacityKg} kg</span>
                    </div>
                  </div>

                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded capitalize ${statusColor}`}>
                    {t.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
