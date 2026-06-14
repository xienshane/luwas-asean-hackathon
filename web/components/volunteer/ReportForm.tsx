'use client';

import { useEffect, useState } from 'react';
import type { NeedsSeverity, RoadStatus } from '@/lib/types/parse';

interface BarangayOption {
  id: string;
  name: string;
  city_municipality: string | null;
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'queued' }
  | { kind: 'error'; message: string };

const QUEUED_COUNT_KEY = 'luwas-queued-reports';

// Display hint only — the durable queue lives in the service worker's IndexedDB.
function readQueuedCount(): number {
  if (typeof window === 'undefined') return 0;
  return Number(window.localStorage.getItem(QUEUED_COUNT_KEY) ?? '0') || 0;
}

export default function ReportForm({ barangays }: { barangays: BarangayOption[] }) {
  const [barangayId, setBarangayId] = useState('');
  const [severity, setSeverity] = useState<NeedsSeverity>('moderate');
  const [roadStatus, setRoadStatus] = useState<RoadStatus>('unknown');
  const [population, setPopulation] = useState('');
  const [notes, setNotes] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    setQueued(readQueuedCount());
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'LUWAS_REPORTS_SYNCED') {
        window.localStorage.setItem(QUEUED_COUNT_KEY, '0');
        setQueued(0);
        setState({ kind: 'sent' });
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  const captureGps = () => {
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barangayId) {
      setState({ kind: 'error', message: 'Select a barangay.' });
      return;
    }
    setState({ kind: 'sending' });

    const payload = {
      id: crypto.randomUUID(),
      barangay_id: barangayId,
      raw_text: notes,
      population_estimate: population === '' ? null : Number(population),
      needs_severity: severity,
      road_status: roadStatus,
      lat: gps?.lat ?? null,
      lng: gps?.lng ?? null,
      captured_at: new Date().toISOString(),
    };

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      if (res.status === 201) {
        setState({ kind: 'sent' });
        setNotes('');
        setPopulation('');
      } else if (res.status === 202) {
        // Service worker queued it for Background Sync (we were offline).
        const next = readQueuedCount() + 1;
        window.localStorage.setItem(QUEUED_COUNT_KEY, String(next));
        setQueued(next);
        setState({ kind: 'queued' });
        setNotes('');
        setPopulation('');
      } else {
        const body = await res.json().catch(() => ({}));
        setState({ kind: 'error', message: body.error ?? `submit failed (${res.status})` });
      }
    } catch {
      setState({
        kind: 'error',
        message: 'Offline and the sync queue is unavailable (first visit must be online).',
      });
    }
  };

  const field = 'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm';

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="font-medium">Field report</h2>

      <label className="text-sm">
        <span className="mb-1 block text-zinc-600">Barangay</span>
        <select value={barangayId} onChange={(e) => setBarangayId(e.target.value)} className={field} required>
          <option value="">Select barangay…</option>
          {barangays.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {b.city_municipality ? ` — ${b.city_municipality}` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-zinc-600">Needs severity</span>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as NeedsSeverity)} className={field}>
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-600">Road status</span>
          <select value={roadStatus} onChange={(e) => setRoadStatus(e.target.value as RoadStatus)} className={field}>
            <option value="unknown">Unknown</option>
            <option value="passable">Passable</option>
            <option value="impassable">Impassable</option>
          </select>
        </label>
      </div>

      <label className="text-sm">
        <span className="mb-1 block text-zinc-600">People affected (estimate)</span>
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={population}
          onChange={(e) => setPopulation(e.target.value)}
          className={field}
          placeholder="e.g. 120"
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-zinc-600">What is happening?</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          className={field}
          placeholder="Flooding near the chapel, families on roofs…"
        />
      </label>

      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={captureGps}
          className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-100"
        >
          {gps ? 'Update GPS fix' : 'Attach GPS fix'}
        </button>
        <span className="text-zinc-500">
          {gps ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : gpsError ?? 'optional — barangay centroid used otherwise'}
        </span>
      </div>

      <button
        type="submit"
        disabled={state.kind === 'sending'}
        className="mt-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
      >
        {state.kind === 'sending' ? 'Submitting…' : 'Submit report'}
      </button>

      {state.kind === 'sent' && <p className="text-sm text-emerald-700">Report submitted.</p>}
      {state.kind === 'queued' && (
        <p className="text-sm text-amber-700">Saved offline — will sync automatically when you reconnect.</p>
      )}
      {state.kind === 'error' && <p className="text-sm text-red-700">{state.message}</p>}
      {queued > 0 && (
        <p className="text-xs text-zinc-500">
          {queued} report{queued > 1 ? 's' : ''} waiting to sync.
        </p>
      )}
    </form>
  );
}
