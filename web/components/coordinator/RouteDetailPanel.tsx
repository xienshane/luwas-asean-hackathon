'use client';

import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Route, Team } from '@/lib/types/coordinator';
import { DetailPanel, Stat, Chip, Section, Timeline, type ChipTone, type TimelineItem } from './ui';

const STATUS_TONE: Record<Route['status'], ChipTone> = {
  active: 'active',
  planned: 'warning',
  completed: 'muted',
};

// In-rail route / convoy detail (Part B6). Opens on a map route-click instead of teleporting to
// the Teams view — the map stays put, spatial context is preserved. "View in Teams" keeps the
// old jump as a secondary link (capability preserved).
export default function RouteDetailPanel({
  route,
  team,
  onMarkReached,
  onViewInTeams,
  onClose,
}: {
  route: Route;
  team?: Team;
  onMarkReached: (routeId: string) => void;
  onViewInTeams: () => void;
  onClose: () => void;
}) {
  const km = (route.totalDistanceM / 1000).toFixed(1);
  const stops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
  const lastIdx = stops.length - 1;

  // HQ → ordered stops → destination. The destination (last stop) tracks the red pin tone.
  const items: TimelineItem[] = [
    { id: 'hq', time: 'HQ', tone: 'active', label: team?.name ?? route.teamName, text: 'Depart base' },
    ...stops.map((s, i) => ({
      id: s.barangayId || `stop-${s.sequence}`,
      time: `#${s.sequence}`,
      tone: i === lastIdx ? ('critical' as const) : ('neutral' as const),
      label: s.barangayName,
      text: i === lastIdx ? `Destination · ${s.action}` : s.action,
    })),
  ];

  return (
    <DetailPanel
      className="luwas-rail-swap w-[25%] min-w-[340px] max-w-[360px] shrink-0"
      eyebrow="Route"
      title={route.teamName}
      subtitle={
        <span className="flex items-center gap-1.5">
          <Chip tone={STATUS_TONE[route.status]}>{route.status[0].toUpperCase() + route.status.slice(1)}</Chip>
        </span>
      }
      onClose={onClose}
      footer={
        <div className="p-3 space-y-2">
          {route.status === 'active' && (
            <button
              onClick={() => onMarkReached(route.id)}
              className="w-full min-h-[38px] py-2 bg-active text-bg hover:brightness-110 rounded-control font-medium transition-[filter] duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-active/50"
            >
              Mark area reached
            </button>
          )}
          <button
            onClick={onViewInTeams}
            className="w-full flex items-center justify-center gap-1.5 min-h-[36px] py-2 text-muted hover:text-fg rounded-control text-[13px] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
          >
            View in Teams <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      }
    >
      <Section title="Route" divider={false}>
        <Stat
          label="Total distance"
          value={km}
          unit="km · real road"
          sub={<span><span className="font-mono tabular-nums">{stops.length}</span> stop{stops.length === 1 ? '' : 's'} · sim convoy is decorative (parks short of destination)</span>}
        />
      </Section>

      <Section title="Itinerary">
        <div className="-mx-4">
          <Timeline items={items} />
        </div>
      </Section>
    </DetailPanel>
  );
}
