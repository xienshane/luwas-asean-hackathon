'use client';

import React, { useState } from 'react';
import {
  Truck,
  Anchor,
  Ambulance,
  Car,
  CheckCircle2,
  Clock,
  Wrench,
  Navigation,
  MapPin,
  ChevronRight,
  Radio,
  Zap,
  Route as RouteIcon,
} from 'lucide-react';
import { Team, Route, Barangay } from '@/lib/mockData';

interface TeamsViewProps {
  teams: Team[];
  routes: Route[];
  barangays: Barangay[];
  onDispatchTeam: (teamId: string, barangayId: string) => void;
}

const STATUS_CONFIG: Record<string, {
  badge: string; dot: string; label: string; cardRing: string; iconBg: string;
}> = {
  active:      { badge: 'bg-teal-950 border-teal-800 text-teal-300',    dot: 'bg-teal-400 shadow-[0_0_6px_#2dd4bf]', label: 'Active',      cardRing: 'border-teal-800/40 ring-1 ring-teal-800/20', iconBg: 'bg-teal-950 border-teal-800' },
  dispatched:  { badge: 'bg-blue-950 border-blue-800 text-blue-300',    dot: 'bg-blue-400 shadow-[0_0_6px_#60a5fa]',  label: 'Dispatched',  cardRing: 'border-blue-800/40 ring-1 ring-blue-800/20',  iconBg: 'bg-blue-950 border-blue-800' },
  idle:        { badge: 'bg-slate-800 border-slate-700 text-slate-400', dot: 'bg-slate-500',                           label: 'Idle',        cardRing: 'border-slate-800',                            iconBg: 'bg-slate-800 border-slate-700' },
  maintenance: { badge: 'bg-amber-950 border-amber-800 text-amber-300', dot: 'bg-amber-400',                           label: 'Maint.',      cardRing: 'border-amber-900/40',                         iconBg: 'bg-amber-950 border-amber-800' },
};

const TYPE_ICON: Record<string, (cls: string) => React.ReactNode> = {
  truck:     cls => <Truck     className={cls} />,
  '4x4':    cls => <Car       className={cls} />,
  boat:      cls => <Anchor    className={cls} />,
  ambulance: cls => <Ambulance className={cls} />,
};

const ROUTE_STATUS_STYLE: Record<string, string> = {
  active:    'bg-teal-950 border-teal-800 text-teal-300',
  completed: 'bg-slate-800 border-slate-700 text-slate-500',
  planned:   'bg-slate-900 border-slate-700 text-slate-400',
};

export default function TeamsView({ teams, routes, barangays, onDispatchTeam }: TeamsViewProps) {
  // Per-team selected destination
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [dispatchedTeam, setDispatchedTeam] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);

  const setDest = (teamId: string, barangayId: string) =>
    setDestinations(d => ({ ...d, [teamId]: barangayId }));

  const handleDispatch = (teamId: string) => {
    const dest = destinations[teamId];
    if (!dest) return;
    onDispatchTeam(teamId, dest);
    setDispatchedTeam(teamId);
    setDestinations(d => { const n = { ...d }; delete n[teamId]; return n; });
    setTimeout(() => setDispatchedTeam(null), 2000);
  };

  // Fleet summary
  const active      = teams.filter(t => t.status === 'active').length;
  const dispatched  = teams.filter(t => t.status === 'dispatched').length;
  const idle        = teams.filter(t => t.status === 'idle').length;
  const maintenance = teams.filter(t => t.status === 'maintenance').length;

  const activeRoutes    = routes.filter(r => r.status === 'active');
  const completedRoutes = routes.filter(r => r.status === 'completed');

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">

      {/* ── Top bar ── */}
      <div className="shrink-0 bg-slate-900 border-b border-slate-800 px-5 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="bg-teal-900/50 p-1.5 rounded-lg">
            <Radio className="w-4 h-4 text-teal-400" />
          </div>
          <div>
            <h2 className="font-mono font-bold text-[13px] uppercase tracking-[0.12em] text-slate-200">Teams & Dispatch</h2>
            <p className="text-[9px] text-slate-600 font-mono">Field response coordination</p>
          </div>
        </div>

        {/* Fleet pills */}
        <div className="flex items-center gap-2 ml-4">
          {[
            { count: active,      label: 'Active',     color: 'bg-teal-950/60 border-teal-900/60 text-teal-400',   dot: 'bg-teal-400' },
            { count: dispatched,  label: 'Dispatched', color: 'bg-blue-950/60 border-blue-900/60 text-blue-400',   dot: 'bg-blue-400' },
            { count: idle,        label: 'Idle',       color: 'bg-slate-800/60 border-slate-700/60 text-slate-400', dot: 'bg-slate-500' },
            { count: maintenance, label: 'Maint.',     color: 'bg-amber-950/60 border-amber-900/60 text-amber-400', dot: 'bg-amber-400' },
          ].filter(p => p.count > 0).map(p => (
            <div key={p.label} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${p.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.dot}`} />
              <span className="font-mono text-[11px] font-bold">{p.count} {p.label}</span>
            </div>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3 text-[10px] font-mono text-slate-600">
          <span><span className="text-slate-400 font-bold">{activeRoutes.length}</span> active routes</span>
          <span><span className="text-slate-400 font-bold">{completedRoutes.length}</span> completed</span>
        </div>
      </div>

      {/* ── Body: split pane ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── Left: Team cards ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 border-r border-slate-800 min-w-0">
          <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-600 px-1 mb-2">
            Response Fleet — {teams.length} units
          </p>

          {teams.map(team => {
            const cfg = STATUS_CONFIG[team.status] ?? STATUS_CONFIG.idle;
            const activeRoute = routes.find(r => r.teamId === team.id && r.status === 'active');
            const isDispatchable = team.status === 'idle' || team.status === 'active';
            const selectedDest = destinations[team.id];
            const justDispatched = dispatchedTeam === team.id;
            const IconFn = TYPE_ICON[team.type] ?? TYPE_ICON.truck;

            return (
              <div
                key={team.id}
                className={`bg-slate-900 border rounded-xl overflow-hidden transition-all ${cfg.cardRing}`}
              >
                {/* Card header */}
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg border ${cfg.iconBg}`}>
                      {IconFn('w-4 h-4 text-slate-300')}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-[13px] text-slate-100">{team.name}</h3>
                        {justDispatched && (
                          <span className="text-[9px] font-mono font-bold bg-teal-950 border border-teal-700 text-teal-400 px-1.5 py-0.5 rounded-full animate-pulse">
                            Dispatched!
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-slate-500">
                        {team.type.toUpperCase()} · {team.capacityKg.toLocaleString()} kg capacity
                      </p>
                    </div>
                  </div>
                  <span className={`flex items-center gap-1.5 text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border ${cfg.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                </div>

                {/* Current assignment */}
                {team.currentAssignment && (
                  <div className="mx-4 mb-3 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 flex items-center gap-2">
                    <Navigation className="w-3 h-3 text-teal-500 shrink-0" />
                    <span className="text-[11px] text-slate-400 truncate font-mono">{team.currentAssignment}</span>
                  </div>
                )}

                {/* Active route stops */}
                {activeRoute && activeRoute.stops.length > 0 && (
                  <div className="mx-4 mb-3 bg-slate-950/40 border border-slate-800/60 rounded-lg p-3">
                    <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-2">Route Stops</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {activeRoute.stops.map((stop, idx) => (
                        <React.Fragment key={stop.sequence}>
                          <div className="flex items-center gap-1">
                            <span className="w-4 h-4 rounded-full bg-teal-900 border border-teal-700 text-teal-300 text-[8px] font-bold flex items-center justify-center shrink-0">
                              {stop.sequence}
                            </span>
                            <span className="text-[10px] font-mono text-slate-300">{stop.barangayName}</span>
                          </div>
                          {idx < activeRoute.stops.length - 1 && (
                            <ChevronRight className="w-3 h-3 text-slate-700 shrink-0" />
                          )}
                        </React.Fragment>
                      ))}
                      <span className="ml-auto text-[9px] font-mono text-slate-600">
                        {(activeRoute.totalDistanceM / 1000).toFixed(1)} km
                      </span>
                    </div>
                  </div>
                )}

                {/* Dispatch control */}
                {isDispatchable && (
                  <div className="border-t border-slate-800/60 px-4 py-3 flex items-center gap-2 bg-slate-950/20">
                    <MapPin className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <select
                      value={selectedDest ?? ''}
                      onChange={e => setDest(team.id, e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-300 rounded-lg px-2.5 py-1.5 text-[11px] font-mono focus:outline-none focus:border-teal-600 cursor-pointer transition-colors"
                    >
                      <option value="" disabled>Select destination…</option>
                      {barangays.map(b => (
                        <option key={b.id} value={b.id}>{b.name} — {b.cityMunicipality}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleDispatch(team.id)}
                      disabled={!selectedDest}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider border transition-colors whitespace-nowrap ${
                        selectedDest
                          ? 'bg-teal-700 hover:bg-teal-600 border-teal-600 text-teal-50 cursor-pointer'
                          : 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed'
                      }`}
                    >
                      <Zap className="w-3 h-3" />
                      Dispatch
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Right: Routes ── */}
        <div className="w-80 shrink-0 flex flex-col overflow-hidden bg-slate-950">
          <div className="shrink-0 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RouteIcon className="w-3.5 h-3.5 text-teal-500" />
              <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">Routes</p>
            </div>
            <span className="text-[9px] font-mono text-slate-600">{routes.length} total</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {routes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-700">
                <RouteIcon className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-[11px] font-mono">No routes planned</p>
              </div>
            ) : routes.map(route => {
              const isSelected = selectedRoute === route.id;
              return (
                <button
                  key={route.id}
                  onClick={() => setSelectedRoute(isSelected ? null : route.id)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    isSelected ? 'bg-slate-800/60' : 'hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[12px] font-bold text-slate-200 leading-tight">{route.teamName}</span>
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase shrink-0 ${
                      ROUTE_STATUS_STYLE[route.status] ?? ROUTE_STATUS_STYLE.planned
                    }`}>
                      {route.status}
                    </span>
                  </div>

                  {/* Stop chain */}
                  <div className="flex items-center gap-1 flex-wrap mb-2">
                    {route.stops.map((stop, idx) => (
                      <React.Fragment key={stop.sequence}>
                        <span className="text-[10px] font-mono text-slate-400">{stop.barangayName}</span>
                        {idx < route.stops.length - 1 && (
                          <ChevronRight className="w-2.5 h-2.5 text-slate-700 shrink-0" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 text-[10px] font-mono text-slate-600">
                    <span>{(route.totalDistanceM / 1000).toFixed(1)} km</span>
                    <span>{route.stops.length} stop{route.stops.length !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Expanded stop detail */}
                  {isSelected && route.stops.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-slate-700/50 pt-3">
                      {route.stops.map(stop => (
                        <div key={stop.sequence} className="flex items-start gap-2 text-[10px]">
                          <span className="w-4 h-4 rounded-full bg-teal-950 border border-teal-800 text-teal-400 text-[8px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {stop.sequence}
                          </span>
                          <div>
                            <p className="font-bold text-slate-300">{stop.barangayName}</p>
                            <p className="text-slate-600 font-mono">{stop.action}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}