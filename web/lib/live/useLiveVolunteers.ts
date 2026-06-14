'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Volunteer } from '@/lib/types/coordinator';
import { timeAgo } from './adapters';

interface PositionRow {
  volunteer_id: string;
  lat: number;
  lng: number;
  recorded_at: string;
}

interface RosterEntry {
  full_name: string | null;
  team_id: string | null;
  status: string;
}

// Streams volunteer_positions (latest-only, PII-minimized) onto the coordinator
// map: initial fetch + realtime INSERT/UPDATE. Names come from a one-shot roster
// query (coordinator RLS allows it); the realtime payload itself carries no PII.
export function useLiveVolunteers(): Volunteer[] {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);

  useEffect(() => {
    const supabase = createClient();
    const roster = new Map<string, RosterEntry>();
    let cancelled = false;

    const toUi = (row: PositionRow): Volunteer => {
      const entry = roster.get(row.volunteer_id);
      return {
        id: row.volunteer_id,
        name: entry?.full_name ?? 'Volunteer',
        phone: '', // intentionally not fetched — data minimization
        teamId: entry?.team_id ?? null,
        teamName: null,
        availability: entry?.status === 'active' ? 'available' : 'offline',
        lastCheckIn: timeAgo(row.recorded_at),
        latitude: row.lat,
        longitude: row.lng,
      };
    };

    const apply = (row: PositionRow) =>
      setVolunteers((prev) => {
        const ui = toUi(row);
        const i = prev.findIndex((v) => v.id === ui.id);
        if (i === -1) return [ui, ...prev];
        const next = prev.slice();
        next[i] = ui;
        return next;
      });

    (async () => {
      const { data: rosterRows } = await supabase
        .from('volunteers')
        .select('id, full_name, team_id, status');
      if (cancelled) return;
      (rosterRows ?? []).forEach((r) =>
        roster.set(r.id, { full_name: r.full_name, team_id: r.team_id, status: r.status }),
      );

      const { data: positions } = await supabase
        .from('volunteer_positions')
        .select('volunteer_id, lat, lng, recorded_at');
      if (cancelled) return;
      (positions ?? []).forEach((p) => apply(p as PositionRow));
    })();

    const channel = supabase
      .channel('live-volunteer-positions')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'volunteer_positions' },
        (payload) => apply(payload.new as PositionRow),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'volunteer_positions' },
        (payload) => apply(payload.new as PositionRow),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return volunteers;
}
