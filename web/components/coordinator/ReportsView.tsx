'use client';

import React, { useState, useMemo } from 'react';
import {
  FileText,
  Check,
  Clock,
  ChevronDown,
  ChevronUp,
  MapPin,
  Search,
  X,
  SortAsc,
  SortDesc,
  Eye,
  EyeOff,
  RefreshCw,
  Smartphone,
  MessageSquare,
  Bot,
  Circle,
  CircleDot,
  AlertCircle,
  CheckCircle,
  Users,
  AlertTriangle,
  Activity,
  History,
  Archive,
  ChevronRight,
  Flag
} from 'lucide-react';
import { FieldReport } from '@/lib/mockData';

interface ReportsViewProps {
  reports: FieldReport[];
  onConfirmReport: (id: string) => void;
  onFlagReport: (reportId: string) => void;
  onRefresh?: () => void;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-950 text-red-300 border-red-800',
  high:     'bg-orange-950 text-orange-300 border-orange-800',
  medium:   'bg-amber-950 text-amber-300 border-amber-800',
  low:      'bg-slate-800 text-slate-400 border-slate-700',
};

const SEVERITY_ICONS: Record<string, React.ElementType> = {
  critical: AlertCircle,
  high: AlertTriangle,
  medium: CircleDot,
  low: Circle,
};

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-amber-950 text-amber-300 border-amber-800',
  confirmed: 'bg-teal-950 text-teal-300 border-teal-800',
  flagged:   'bg-red-950 text-red-300 border-red-800',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock,
  confirmed: CheckCircle,
  flagged: Flag,
};

const SOURCE_LABEL: Record<string, string> = {
  app:    'Mobile App',
  sms:    'SMS',
  parsed: 'AI-Parsed',
};

const SOURCE_ICONS: Record<string, React.ElementType> = {
  app: Smartphone,
  sms: MessageSquare,
  parsed: Bot,
};

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export default function ReportsView({ reports, onConfirmReport, onFlagReport, onRefresh }: ReportsViewProps) {
  // Filter states
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [filterSource, setFilterSource] = useState<'all' | 'app' | 'sms' | 'parsed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [expandedFlaggedId, setExpandedFlaggedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'time' | 'severity'>('severity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showFlagged, setShowFlagged] = useState(true); // New state for flagged section
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());

  // Separate reports by status
  const pendingReports = reports.filter(r => r.status === 'pending');
  const confirmedReports = reports.filter(r => r.status === 'confirmed');
  const flaggedReports = reports.filter(r => r.status === 'flagged');

  // Stats calculations
  const stats = useMemo(() => {
    const total = reports.length;
    const pending = pendingReports.length;
    const confirmed = confirmedReports.length;
    const flagged = flaggedReports.length;
    
    return { total, pending, confirmed, flagged };
  }, [reports, pendingReports.length, confirmedReports.length, flaggedReports.length]);

  // Filtered and sorted pending reports
  const filteredPending = useMemo(() => {
    let filtered = pendingReports
      .filter(r => filterSeverity === 'all' || r.needsSeverity === filterSeverity)
      .filter(r => filterSource === 'all' || r.source === filterSource)
      .filter(r => searchQuery === '' || 
        r.rawText.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.barangayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.reporterName.toLowerCase().includes(searchQuery.toLowerCase())
      );

    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'severity') {
        comparison = SEVERITY_ORDER[a.needsSeverity] - SEVERITY_ORDER[b.needsSeverity];
      } else if (sortBy === 'time') {
        comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [pendingReports, filterSeverity, filterSource, searchQuery, sortBy, sortOrder]);

  // Filtered flagged reports
  const filteredFlagged = useMemo(() => {
    let filtered = flaggedReports
      .filter(r => filterSeverity === 'all' || r.needsSeverity === filterSeverity)
      .filter(r => filterSource === 'all' || r.source === filterSource)
      .filter(r => searchQuery === '' || 
        r.rawText.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.barangayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.reporterName.toLowerCase().includes(searchQuery.toLowerCase())
      );

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return filtered;
  }, [flaggedReports, filterSeverity, filterSource, searchQuery]);

  // Filtered confirmed reports for history
  const filteredConfirmed = useMemo(() => {
    let filtered = confirmedReports
      .filter(r => filterSeverity === 'all' || r.needsSeverity === filterSeverity)
      .filter(r => filterSource === 'all' || r.source === filterSource)
      .filter(r => searchQuery === '' || 
        r.rawText.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.barangayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.reporterName.toLowerCase().includes(searchQuery.toLowerCase())
      );

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return filtered;
  }, [confirmedReports, filterSeverity, filterSource, searchQuery]);

  const clearFilters = () => {
    setFilterSeverity('all');
    setFilterSource('all');
    setSearchQuery('');
  };

  const hasActiveFilters = filterSeverity !== 'all' || filterSource !== 'all' || searchQuery !== '';

  const handleBulkConfirm = () => {
    selectedReports.forEach(id => {
      const report = pendingReports.find(r => r.id === id);
      if (report) {
        onConfirmReport(id);
      }
    });
    setSelectedReports(new Set());
  };

  const handleBulkFlag = () => {
    selectedReports.forEach(id => {
      onFlagReport(id);
    });
    setSelectedReports(new Set());
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Header with Stats */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-950 border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-teal-900/80 p-2 rounded-lg">
              <FileText className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h2 className="font-bold text-lg uppercase tracking-wider text-slate-200">Field Reports</h2>
              <p className="text-[10px] text-slate-500">Real-time incident reporting from field operations</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFlagged(!showFlagged)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2 ${
                showFlagged ? 'bg-red-900/50 text-red-300 border border-red-800' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              {showFlagged ? 'Hide Flagged' : 'Show Flagged'}
              {stats.flagged > 0 && (
                <span className="ml-1 bg-red-950 text-red-300 px-1.5 py-0.5 rounded-full text-[9px]">
                  {stats.flagged}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2 ${
                showHistory ? 'bg-teal-900/50 text-teal-300 border border-teal-800' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              {showHistory ? 'Hide History' : 'Show History'}
            </button>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4 text-slate-400" />
              </button>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              title={showFilters ? "Hide filters" : "Show filters"}
            >
              {showFilters ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-center">
            <Activity className="w-5 h-5 text-slate-500 mx-auto mb-1" />
            <p className="text-[10px] text-slate-500 uppercase font-bold">Total Reports</p>
            <p className="text-2xl font-bold text-slate-200">{stats.total}</p>
          </div>
          <div className="bg-amber-950/20 border border-amber-800/30 rounded-lg p-3 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl"></div>
            <Clock className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <p className="text-[10px] text-amber-400 uppercase font-bold">Pending</p>
            <p className="text-2xl font-bold text-amber-400">{stats.pending}</p>
          </div>
          <div className="bg-red-950/20 border border-red-800/30 rounded-lg p-3 text-center">
            <Flag className="w-5 h-5 text-red-400 mx-auto mb-1" />
            <p className="text-[10px] text-red-400 uppercase font-bold">Flagged</p>
            <p className="text-2xl font-bold text-red-400">{stats.flagged}</p>
          </div>
          <div className="bg-teal-950/20 border border-teal-800/30 rounded-lg p-3 text-center">
            <Archive className="w-5 h-5 text-teal-400 mx-auto mb-1" />
            <p className="text-[10px] text-teal-400 uppercase font-bold">Confirmed</p>
            <p className="text-2xl font-bold text-teal-400">{stats.confirmed}</p>
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-slate-900/50 border-b border-slate-800 px-6 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search Bar */}
            <div className="flex-1 min-w-[200px] relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by keyword, barangay, or reporter..."
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-teal-600 placeholder-slate-600"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Severity Filter */}
            <select
              value={filterSeverity}
              onChange={e => setFilterSeverity(e.target.value as typeof filterSeverity)}
              className="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-teal-600 cursor-pointer"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            {/* Source Filter */}
            <select
              value={filterSource}
              onChange={e => setFilterSource(e.target.value as typeof filterSource)}
              className="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-teal-600 cursor-pointer"
            >
              <option value="all">All Sources</option>
              <option value="app">Mobile App</option>
              <option value="sms">SMS</option>
              <option value="parsed">AI-Parsed</option>
            </select>

            {/* Sort Controls for Pending */}
            <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setSortBy('severity')}
                className={`px-2 py-1 rounded text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  sortBy === 'severity' ? 'bg-teal-900 text-teal-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <AlertCircle className="w-3 h-3" /> Severity
              </button>
              <button
                onClick={() => setSortBy('time')}
                className={`px-2 py-1 rounded text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  sortBy === 'time' ? 'bg-teal-900 text-teal-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock className="w-3 h-3" /> Time
              </button>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-1 rounded text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                {sortOrder === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />}
              </button>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectedReports.size > 0 && (
        <div className="bg-teal-950/30 border-b border-teal-800 px-6 py-2 flex items-center justify-between">
          <span className="text-xs text-teal-300 font-semibold">
            {selectedReports.size} pending report{selectedReports.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkConfirm}
              className="px-3 py-1 bg-teal-900 hover:bg-teal-800 text-teal-300 font-bold rounded text-xs flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3 h-3" /> Confirm All
            </button>
            <button
              onClick={handleBulkFlag}
              className="px-3 py-1 bg-red-900/50 hover:bg-red-900 text-red-300 font-bold rounded text-xs flex items-center gap-1 cursor-pointer"
            >
              <Flag className="w-3 h-3" /> Flag All
            </button>
            <button
              onClick={() => setSelectedReports(new Set())}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Pending Reports Section */}
        <div className="border-b border-slate-800">
          <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm px-6 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-sm uppercase tracking-wider text-amber-400">Pending Verification</h3>
              <span className="bg-amber-950 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {filteredPending.length}
              </span>
            </div>
          </div>

          {filteredPending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-600">
              <CheckCircle className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm italic">No pending reports match the current filter.</p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-3 px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {filteredPending.map(report => {
                const isExpanded = expandedId === report.id;
                const ago = Math.round((Date.now() - new Date(report.createdAt).getTime()) / 60000);
                const agoStr = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
                const isSelected = selectedReports.has(report.id);
                const SeverityIcon = SEVERITY_ICONS[report.needsSeverity];
                const SourceIcon = SOURCE_ICONS[report.source];

                return (
                  <div key={report.id} className="bg-slate-900/20 hover:bg-slate-900/40 transition-colors">
                    <div className="px-6 py-3">
                      <div className="flex items-start gap-3">
                        <div className="pt-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedReports(new Set([...selectedReports, report.id]));
                              } else {
                                const newSet = new Set(selectedReports);
                                newSet.delete(report.id);
                                setSelectedReports(newSet);
                              }
                            }}
                            className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 cursor-pointer"
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[10px] font-mono text-slate-500">#{report.id}</span>
                            <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                              <MapPin className="w-2.5 h-2.5" /> {report.barangayName}
                            </span>
                            <span className="text-[10px] text-slate-600 flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" /> {agoStr}
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase flex items-center gap-1 ${SEVERITY_STYLES[report.needsSeverity]}`}>
                              <SeverityIcon className="w-2.5 h-2.5" />
                              {report.needsSeverity}
                            </span>
                            <span className="text-[9px] text-slate-500 flex items-center gap-1">
                              <SourceIcon className="w-2.5 h-2.5" /> {SOURCE_LABEL[report.source]}
                            </span>
                          </div>
                          <p className="text-slate-300 text-[11.5px] mb-2">"{report.rawText}"</p>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 flex items-center gap-1">
                              <Users className="w-2.5 h-2.5" /> {report.reporterName}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : report.id)}
                                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer flex items-center gap-1"
                              >
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                {isExpanded ? 'Show less' : 'Show details'}
                              </button>
                              <button
                                onClick={() => onFlagReport(report.id)}
                                className="px-2 py-1 bg-red-900/50 hover:bg-red-900 border border-red-800 text-red-300 font-bold rounded flex items-center gap-1 cursor-pointer transition-colors text-[10px]"
                              >
                                <Flag className="w-3 h-3" /> Flag
                              </button>
                              <button
                                onClick={() => onConfirmReport(report.id)}
                                className="px-2 py-1 bg-teal-900/70 hover:bg-teal-800 border border-teal-700 text-teal-300 font-bold rounded flex items-center gap-1 cursor-pointer transition-colors text-[10px]"
                              >
                                <Check className="w-3 h-3" /> Confirm
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                            
                      {isExpanded && (
                        <div className="mt-3 ml-7 pl-4 border-l-2 border-teal-500/30">
                          <div className="grid grid-cols-2 gap-3 text-[11px]">
                            <div className="bg-slate-900/60 rounded-lg p-3">
                              <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mb-2">Full Report</p>
                              <p className="text-slate-300 italic">"{report.rawText}"</p>
                            </div>
                            <div className="space-y-2">
                              <div className="bg-slate-900/60 rounded-lg p-3">
                                <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                                  <Bot className="w-2.5 h-2.5" /> AI Analysis
                                </p>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-slate-500">Confidence:</span>
                                    <span className="text-slate-300 font-semibold">{Math.round(report.confidence * 100)}%</span>
                                  </div>
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-slate-500">Est. Affected:</span>
                                    <span className="text-slate-300 font-semibold">{report.populationEstimate.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-slate-500">Road Status:</span>
                                    <span className="text-slate-300 font-semibold">{report.roadStatus}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Flagged Reports Section */}
        {showFlagged && filteredFlagged.length > 0 && (
          <div className="border-b border-red-800/30">
            <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm px-6 py-3 border-b border-red-800/30">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-red-400" />
                <h3 className="font-bold text-sm uppercase tracking-wider text-red-400">Flagged Reports - Needs Review</h3>
                <span className="bg-red-950 text-red-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {filteredFlagged.length}
                </span>
              </div>
            </div>

            <div className="divide-y divide-red-800/20">
              {filteredFlagged.map(report => {
                const isExpanded = expandedFlaggedId === report.id;
                const ago = Math.round((Date.now() - new Date(report.createdAt).getTime()) / 60000);
                const agoStr = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
                const SeverityIcon = SEVERITY_ICONS[report.needsSeverity];
                const SourceIcon = SOURCE_ICONS[report.source];

                return (
                  <div key={report.id} className="bg-red-950/5 hover:bg-red-950/20 transition-colors">
                    <div className="px-6 py-3">
                      <div className="flex items-start gap-3">
                        <Flag className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[10px] font-mono text-slate-500">#{report.id}</span>
                            <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                              <MapPin className="w-2.5 h-2.5" /> {report.barangayName}
                            </span>
                            <span className="text-[10px] text-slate-600 flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" /> {agoStr}
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase flex items-center gap-1 ${SEVERITY_STYLES[report.needsSeverity]}`}>
                              <SeverityIcon className="w-2.5 h-2.5" />
                              {report.needsSeverity}
                            </span>
                            <span className="text-[9px] text-slate-500 flex items-center gap-1">
                              <SourceIcon className="w-2.5 h-2.5" /> {SOURCE_LABEL[report.source]}
                            </span>
                          </div>
                          <p className="text-slate-300 text-[11.5px] mb-2">"{report.rawText}"</p>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 flex items-center gap-1">
                              <Users className="w-2.5 h-2.5" /> {report.reporterName}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setExpandedFlaggedId(isExpanded ? null : report.id)}
                                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer flex items-center gap-1"
                              >
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                {isExpanded ? 'Show less' : 'Show details'}
                              </button>
                              <button
                                onClick={() => onConfirmReport(report.id)}
                                className="px-2 py-1 bg-teal-900/70 hover:bg-teal-800 border border-teal-700 text-teal-300 font-bold rounded flex items-center gap-1 cursor-pointer transition-colors text-[10px]"
                              >
                                <Check className="w-3 h-3" /> Confirm & Remove Flag
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 ml-7 pl-4 border-l-2 border-red-500/30">
                          <div className="grid grid-cols-2 gap-3 text-[11px]">
                            <div className="bg-slate-900/60 rounded-lg p-3">
                              <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mb-2">Full Report</p>
                              <p className="text-slate-300 italic">"{report.rawText}"</p>
                            </div>
                            <div className="space-y-2">
                              <div className="bg-slate-900/60 rounded-lg p-3">
                                <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                                  <Bot className="w-2.5 h-2.5" /> AI Analysis
                                </p>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-slate-500">Confidence:</span>
                                    <span className="text-slate-300 font-semibold">{Math.round(report.confidence * 100)}%</span>
                                  </div>
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-slate-500">Est. Affected:</span>
                                    <span className="text-slate-300 font-semibold">{report.populationEstimate.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-slate-500">Road Status:</span>
                                    <span className="text-slate-300 font-semibold">{report.roadStatus}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* History Section - Confirmed Reports */}
        {showHistory && (
          <div className="bg-slate-900/10">
            <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm px-6 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-teal-400" />
                <h3 className="font-bold text-sm uppercase tracking-wider text-teal-400">Confirmed Reports History</h3>
                <span className="bg-teal-950 text-teal-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {filteredConfirmed.length}
                </span>
              </div>
            </div>

            {filteredConfirmed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-600">
                <Archive className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm italic">No confirmed reports found.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/40">
                {filteredConfirmed.map(report => {
                  const isExpanded = expandedHistoryId === report.id;
                  const ago = Math.round((Date.now() - new Date(report.createdAt).getTime()) / 60000);
                  const agoStr = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
                  const SeverityIcon = SEVERITY_ICONS[report.needsSeverity];
                  const SourceIcon = SOURCE_ICONS[report.source];

                  return (
                    <div key={report.id} className="bg-slate-900/5 hover:bg-slate-900/20 transition-colors opacity-75 hover:opacity-100">
                      <div className="px-6 py-2.5">
                        <div className="flex items-start gap-3">
                          <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-[10px] font-mono text-slate-500">#{report.id}</span>
                              <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                                <MapPin className="w-2.5 h-2.5" /> {report.barangayName}
                              </span>
                              <span className="text-[10px] text-slate-600 flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" /> {agoStr}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase flex items-center gap-1 ${SEVERITY_STYLES[report.needsSeverity]}`}>
                                <SeverityIcon className="w-2.5 h-2.5" />
                                {report.needsSeverity}
                              </span>
                            </div>
                            <p className="text-slate-400 text-[11px]">"{report.rawText}"</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[9px] text-slate-600 flex items-center gap-1">
                                <Users className="w-2 h-2" /> {report.reporterName} • {SOURCE_LABEL[report.source]}
                              </span>
                              <button
                                onClick={() => setExpandedHistoryId(isExpanded ? null : report.id)}
                                className="text-[9px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer flex items-center gap-1"
                              >
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                {isExpanded ? 'Show less' : 'Show details'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-2 ml-7 pl-4 border-l-2 border-teal-500/20">
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              <div className="bg-slate-900/40 rounded p-2">
                                <p className="text-slate-500 font-semibold mb-1">Est. Affected</p>
                                <p className="text-slate-300">{report.populationEstimate.toLocaleString()} people</p>
                              </div>
                              <div className="bg-slate-900/40 rounded p-2">
                                <p className="text-slate-500 font-semibold mb-1">Road Status</p>
                                <p className="text-slate-300">{report.roadStatus}</p>
                              </div>
                              <div className="bg-slate-900/40 rounded p-2">
                                <p className="text-slate-500 font-semibold mb-1">Coordinates</p>
                                <p className="text-slate-300 text-[9px]">{report.latitude.toFixed(4)}, {report.longitude.toFixed(4)}</p>
                              </div>
                              <div className="bg-slate-900/40 rounded p-2">
                                <p className="text-slate-500 font-semibold mb-1">Confirmed At</p>
                                <p className="text-slate-300">{new Date(report.createdAt).toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}