'use client';

import React, { useState, useEffect } from 'react';
import type { Team, Route, Barangay, Volunteer } from '@/lib/types/coordinator';
import { fetchVolunteerRoster } from '@/lib/supabase/coordinator';
import {
  DetailPanel,
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

interface TeamsViewProps {
  teams: Team[];
  routes: Route[];
  barangays: Barangay[];
  onDispatchTeam: (teamId: string, barangayId: string) => void;
}

const TEAM_STATUS: Record<string, { tone: Tone; label: string }> = {
  active: { tone: 'active', label: 'Active' },
  dispatched: { tone: 'active', label: 'Dispatched' },
  idle: { tone: 'neutral', label: 'Idle' },
  maintenance: { tone: 'warning', label: 'Maintenance' },
};

const ROUTE_STATUS: Record<string, { tone: Tone; label: string }> = {
  active: { tone: 'active', label: 'Active' },
  planned: { tone: 'neutral', label: 'Planned' },
  completed: { tone: 'neutral', label: 'Completed' },
};

const AVG_SPEED_KMH = 25;
const eta = (m: number) => {
  const min = Math.round((m / 1000 / AVG_SPEED_KMH) * 60);
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;
};

export default function TeamsView({ teams, routes, barangays, onDispatchTeam }: TeamsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dest, setDest] = useState('');

  // Live volunteer roster (coordinator_volunteers view, RLS coordinator-only).
  const [roster, setRoster] = useState<Volunteer[]>([]);
  useEffect(() => { fetchVolunteerRoster().then(setRoster).catch(() => setRoster([])); }, []);

  const selected = selectedId ? teams.find((t) => t.id === selectedId) ?? null : null;
  const routeFor = (teamId: string) => routes.find((r) => r.teamId === teamId);
  const selectedRoute = selected ? routeFor(selected.id) : undefined;
  const crew = selected ? roster.filter((v) => v.teamId === selected.id) : [];

  const summary = (['active', 'dispatched', 'idle', 'maintenance'] as const)
    .map((s) => ({ s, n: teams.filter((t) => t.status === s).length }))
    .filter((x) => x.n > 0);

  return (
    <div className="flex-1 flex h-full bg-bg overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <Toolbar>
          <span className="text-[15px] font-medium text-fg">Teams &amp; Dispatch</span>
          <div className="ml-auto flex items-center gap-3 text-[13px] text-muted">
            {summary.map(({ s, n }) => (
              <span key={s} className="flex items-center gap-1.5 capitalize">
                <StatusDot tone={TEAM_STATUS[s].tone} />
                {n} {s}
              </span>
            ))}
          </div>
        </Toolbar>

        <div className="flex-1 overflow-y-auto">
          {/* Fleet table */}
          <section>
            <div className="px-4 py-2 border-b border-line">
              <h3 className="text-[13px] font-medium text-fg">Response fleet</h3>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Unit</TH>
                  <TH>Type</TH>
                  <TH>Current assignment</TH>
                  <TH align="right">ETA</TH>
                  <TH align="right">Capacity</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {teams.map((team) => {
                  const r = routeFor(team.id);
                  const st = TEAM_STATUS[team.status];
                  return (
                    <TR key={team.id} onClick={() => setSelectedId(team.id)} selected={selectedId === team.id}>
                      <TD>{team.name}</TD>
                      <TD muted className="capitalize">{team.type}</TD>
                      <TD muted>{team.currentAssignment ?? '—'}</TD>
                      <TD align="right" mono>{r && team.status !== 'idle' ? eta(r.totalDistanceM) : '—'}</TD>
                      <TD align="right" mono>{team.capacityKg.toLocaleString()} kg</TD>
                      <TD>
                        <span className="flex items-center gap-1.5">
                          <StatusDot tone={st.tone} />
                          {st.label}
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </section>

          {/* Routes table */}
          <section className="mt-2">
            <div className="px-4 py-2 border-b border-line">
              <h3 className="text-[13px] font-medium text-fg">Routes</h3>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Unit</TH>
                  <TH>Origin</TH>
                  <TH>Destination</TH>
                  <TH align="right">Distance</TH>
                  <TH align="right">ETA</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {routes.map((route) => {
                  const st = ROUTE_STATUS[route.status];
                  const origin = route.stops[0]?.barangayName ?? '—';
                  const destination = route.stops[route.stops.length - 1]?.barangayName ?? '—';
                  return (
                    <TR key={route.id} onClick={() => setSelectedId(route.teamId)} selected={selectedId === route.teamId}>
                      <TD>{route.teamName}</TD>
                      <TD muted>{origin}</TD>
                      <TD muted>{destination}</TD>
                      <TD align="right" mono>{(route.totalDistanceM / 1000).toFixed(1)} km</TD>
                      <TD align="right" mono>{eta(route.totalDistanceM)}</TD>
                      <TD>
                        <span className="flex items-center gap-1.5">
                          <StatusDot tone={st.tone} />
                          {st.label}
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </section>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <DetailPanel
          className="w-[340px]"
          eyebrow={`${selected.type.toUpperCase()} · ${selected.capacityKg.toLocaleString()} kg`}
          title={selected.name}
          subtitle={
            <span className="flex items-center gap-1.5">
              <StatusDot tone={TEAM_STATUS[selected.status].tone} />
              {TEAM_STATUS[selected.status].label}
            </span>
          }
          onClose={() => setSelectedId(null)}
        >
          <div className="p-4 space-y-4 text-[13px]">
            {/* Cargo */}
            <div>
              <div className="text-[12px] text-muted mb-1">Cargo capacity</div>
              <div className="text-fg">
                <span className="font-mono tabular-nums">{selected.capacityKg.toLocaleString()}</span> kg ·{' '}
                <span className="capitalize">{selected.type}</span>
              </div>
            </div>

            {/* Crew */}
            <div className="border-t border-line pt-3">
              <div className="text-[12px] text-muted mb-2">Crew ({crew.length})</div>
              {crew.length === 0 ? (
                <div className="text-muted">No crew assigned.</div>
              ) : (
                <div className="space-y-1.5">
                  {crew.map((v) => (
                    <div key={v.id} className="flex items-center justify-between">
                      <span className="text-fg">{v.name}</span>
                      <span className="flex items-center gap-1.5 text-[12px] text-muted capitalize">
                        <StatusDot tone={v.availability === 'available' ? 'active' : v.availability === 'busy' ? 'warning' : 'neutral'} />
                        {v.availability}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Route + stops */}
            <div className="border-t border-line pt-3">
              <div className="text-[12px] text-muted mb-2">Route</div>
              {selectedRoute ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[12px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <StatusDot tone={ROUTE_STATUS[selectedRoute.status].tone} />
                      {ROUTE_STATUS[selectedRoute.status].label}
                    </span>
                    <span className="font-mono tabular-nums">
                      {(selectedRoute.totalDistanceM / 1000).toFixed(1)} km · {eta(selectedRoute.totalDistanceM)}
                    </span>
                  </div>
                  <ol className="space-y-1.5">
                    {selectedRoute.stops.map((stop) => (
                      <li key={stop.sequence} className="flex gap-2.5">
                        <span className="font-mono tabular-nums text-muted shrink-0">{stop.sequence}.</span>
                        <span>
                          <span className="text-fg">{stop.barangayName}</span>
                          <span className="block text-[12px] text-muted">{stop.action}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                <div className="text-muted">No active route.</div>
              )}
            </div>

            {/* Dispatch */}
            {(selected.status === 'idle' || selected.status === 'active') && (
              <div className="border-t border-line pt-3 space-y-2">
                <div className="text-[12px] text-muted">Dispatch to</div>
                <div className="flex items-center gap-2">
                  <select
                    value={dest}
                    onChange={(e) => setDest(e.target.value)}
                    className="flex-1 bg-bg border border-line rounded-control px-2.5 py-1.5 text-[13px] text-fg focus:outline-none focus:border-muted cursor-pointer"
                  >
                    <option value="" disabled>
                      Select destination…
                    </option>
                    {barangays.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} — {b.cityMunicipality}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (!dest) return;
                      onDispatchTeam(selected.id, dest);
                      setDest('');
                    }}
                    disabled={!dest}
                    className={`px-3 py-1.5 rounded-control text-[13px] font-medium border transition-colors duration-100 ${
                      dest
                        ? 'border-line text-fg hover:bg-raised cursor-pointer'
                        : 'border-line text-muted cursor-not-allowed'
                    }`}
                  >
                    Dispatch
                  </button>
                </div>
              </div>
            )}
          </div>
        </DetailPanel>
      )}
    </div>
  );
}
