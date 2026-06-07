'use client';

import React from 'react';
import {
  Truck,
  Anchor,
  Ambulance,
  Car,
  MapPin,
  CheckCircle2,
  Clock,
  Wrench,
  Navigation
} from 'lucide-react';
import { Team, Route, Barangay } from '@/lib/mockData';

interface TeamsViewProps {
  teams: Team[];
  routes: Route[];
  barangays: Barangay[];
  onDispatchTeam: (teamId: string, barangayId: string) => void;
}

const STATUS_STYLES: Record<string, { badge: string; dot: string; label: string }> = {
  active:      { badge: 'bg-teal-950 border-teal-800 text-teal-300',    dot: 'bg-teal-400',   label: 'Active'       },
  dispatched:  { badge: 'bg-blue-950 border-blue-800 text-blue-300',    dot: 'bg-blue-400',   label: 'Dispatched'   },
  idle:        { badge: 'bg-slate-800 border-slate-700 text-slate-400', dot: 'bg-slate-500',  label: 'Idle'         },
  maintenance: { badge: 'bg-amber-950 border-amber-800 text-amber-300', dot: 'bg-amber-400',  label: 'Maintenance'  },
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  truck:     <Truck      className="w-5 h-5 text-slate-400" />,
  '4x4':     <Car        className="w-5 h-5 text-slate-400" />,
  boat:      <Anchor     className="w-5 h-5 text-slate-400" />,
  ambulance: <Ambulance  className="w-5 h-5 text-slate-400" />,
};

export default function TeamsView({ teams, routes, barangays, onDispatchTeam }: TeamsViewProps) {
  const availableBarangays = barangays;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center gap-2">
        <Truck className="w-4 h-4 text-teal-400" />
        <h2 className="font-bold text-sm uppercase tracking-wider text-slate-300">Teams & Dispatch</h2>
        <span className="text-[10px] text-slate-500 font-mono ml-2">
          {teams.filter(t => t.status === 'active' || t.status === 'dispatched').length} / {teams.length} deployed
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Fleet Status Cards */}
        <div>
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-3">Response Fleet</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {teams.map(team => {
              const s = STATUS_STYLES[team.status] ?? STATUS_STYLES.idle;
              const activeRoute = routes.find(r => r.teamId === team.id && r.status === 'active');

              return (
                <div key={team.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
                  {/* Team header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-800 border border-slate-700 p-2 rounded-lg">
                        {TYPE_ICON[team.type] ?? <Truck className="w-5 h-5 text-slate-400" />}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-200 text-sm">{team.name}</h3>
                        <p className="text-[11px] text-slate-500 font-mono">Cap: {team.capacityKg.toLocaleString()} kg</p>
                      </div>
                    </div>
                    <span className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full border ${s.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      {s.label}
                    </span>
                  </div>

                  {/* Current assignment */}
                  {team.currentAssignment && (
                    <div className="bg-slate-950/60 border border-slate-800/60 rounded-lg px-3 py-2 flex items-center gap-2 text-[11px] text-slate-400">
                      <Navigation className="w-3 h-3 text-teal-500 shrink-0" />
                      <span className="truncate">{team.currentAssignment}</span>
                    </div>
                  )}

                  {/* Active route stops */}
                  {activeRoute && (
                    <div className="text-[10px] space-y-1">
                      <p className="text-slate-600 font-semibold uppercase tracking-wider">Active Route Stops</p>
                      {activeRoute.stops.map(stop => (
                        <div key={stop.sequence} className="flex items-center gap-1.5 text-slate-400">
                          <span className="w-4 h-4 rounded-full bg-teal-900 border border-teal-700 text-teal-300 text-[9px] font-bold flex items-center justify-center shrink-0">
                            {stop.sequence}
                          </span>
                          <span className="font-semibold text-slate-300">{stop.barangayName}</span>
                          <span className="text-slate-600">—</span>
                          <span className="truncate">{stop.action}</span>
                        </div>
                      ))}
                      <p className="text-slate-600 font-mono pt-0.5">
                        Total: {(activeRoute.totalDistanceM / 1000).toFixed(1)} km
                      </p>
                    </div>
                  )}

                  {/* Dispatch control */}
                  {(team.status === 'idle' || team.status === 'active') && (
                    <div className="border-t border-slate-800 pt-3 flex items-center gap-2">
                      <select
                        id={`dispatch-select-${team.id}`}
                        className="flex-1 bg-slate-950 border border-slate-700 text-slate-300 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:border-teal-600 cursor-pointer"
                        defaultValue=""
                      >
                        <option value="" disabled>Select destination barangay...</option>
                        {availableBarangays.map(b => (
                          <option key={b.id} value={b.id}>{b.name} — {b.cityMunicipality}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          const sel = document.getElementById(`dispatch-select-${team.id}`) as HTMLSelectElement;
                          if (sel?.value) onDispatchTeam(team.id, sel.value);
                        }}
                        className="px-3 py-1.5 bg-teal-900/80 hover:bg-teal-800 border border-teal-700 text-teal-200 font-bold rounded-lg text-[11px] cursor-pointer transition-colors whitespace-nowrap"
                      >
                        Dispatch
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Routes Table */}
        <div>
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-3">All Routes</p>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_160px_120px_100px] text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-900/80 border-b border-slate-800 px-4 py-2">
              <span>Team</span>
              <span>Stops</span>
              <span>Distance</span>
              <span>Status</span>
            </div>
            {routes.length === 0 && (
              <div className="text-slate-600 italic text-sm text-center py-6">No routes planned.</div>
            )}
            {routes.map(route => (
              <div
                key={route.id}
                className="grid grid-cols-[1fr_160px_120px_100px] px-4 py-3 border-b border-slate-800/40 hover:bg-slate-900/40 transition-colors items-center text-xs"
              >
                <span className="text-slate-300 font-semibold">{route.teamName}</span>
                <span className="text-slate-400">
                  {route.stops.map(s => s.barangayName).join(' → ')}
                </span>
                <span className="text-slate-400 font-mono">{(route.totalDistanceM / 1000).toFixed(1)} km</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border w-fit uppercase ${
                  route.status === 'active'    ? 'bg-teal-950 border-teal-800 text-teal-300' :
                  route.status === 'completed' ? 'bg-slate-800 border-slate-700 text-slate-500' :
                                                 'bg-slate-900 border-slate-700 text-slate-400'
                }`}>
                  {route.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
