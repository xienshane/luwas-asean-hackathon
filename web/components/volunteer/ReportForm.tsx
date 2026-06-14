'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CloudOff,
  LocateFixed,
  Loader2,
  MapPin,
  Route,
  Send,
  Users,
} from 'lucide-react';
import type { NeedsSeverity, RoadStatus } from '@/lib/types/parse';
import BarangayPicker, { type BarangayOption } from './BarangayPicker';

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

// ── Shared token-based classes (mirror the coordinator command-center) ──────
const control =
  'w-full rounded-control bg-raised border border-line px-3 py-2.5 text-base text-fg ' +
  'placeholder:text-muted/50 focus:outline-none focus:border-teal-500 ' +
  'focus:ring-1 focus:ring-teal-500/30 transition-colors';

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon?: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.15em] text-muted">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </span>
      {children}
    </label>
  );
}

// Native <select> keeps the OS picker on mobile (best touch UX); we hide the OS
// arrow and draw our own chevron so the closed control stays on-theme.
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={`${control} cursor-pointer appearance-none pr-9`} />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
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

  const sending = state.kind === 'sending';

  return (
    <form
      onSubmit={submit}
      className="flex flex-col overflow-hidden rounded-card border border-line bg-surface"
    >
      {/* Panel header */}
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Send className="h-4 w-4 text-teal-400" />
        <h2 className="text-[13px] font-mono font-semibold uppercase tracking-[0.15em] text-fg">
          Field Report
        </h2>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 p-4">
        <Field icon={MapPin} label="Barangay">
          <BarangayPicker options={barangays} value={barangayId} onChange={setBarangayId} />
        </Field>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field icon={AlertTriangle} label="Severity">
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as NeedsSeverity)}>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
          </Field>
          <Field icon={Route} label="Road">
            <Select value={roadStatus} onChange={(e) => setRoadStatus(e.target.value as RoadStatus)}>
              <option value="unknown">Unknown</option>
              <option value="passable">Passable</option>
              <option value="impassable">Impassable</option>
            </Select>
          </Field>
          <Field icon={Users} label="People affected">
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={population}
              onChange={(e) => setPopulation(e.target.value)}
              className={`${control} tabular-nums`}
              placeholder="e.g. 120"
            />
          </Field>
        </div>

        <Field label="What is happening?">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            className={`${control} resize-none`}
            placeholder="Flooding near the chapel, families on roofs…"
          />
        </Field>

        {/* GPS capture */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={captureGps}
            className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-control border border-line bg-raised px-3 text-[13px] font-medium text-fg transition-colors hover:border-teal-600/50 hover:text-teal-300"
          >
            <LocateFixed className="h-4 w-4" />
            {gps ? 'Update GPS' : 'Attach GPS'}
          </button>
          <span className="min-w-0 truncate font-mono text-[12px] tabular-nums text-muted">
            {gps
              ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}`
              : gpsError ?? 'optional — centroid used otherwise'}
          </span>
        </div>
      </div>

      {/* Footer / action zone */}
      <div className="flex flex-col gap-3 border-t border-line p-4">
        <button
          type="submit"
          disabled={sending}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-control bg-teal-700 px-4 text-[13px] font-semibold uppercase tracking-[0.1em] text-teal-50 transition-colors hover:bg-teal-600 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? 'Submitting…' : 'Submit report'}
        </button>

        {state.kind === 'sent' && (
          <p className="flex items-center gap-2 text-[13px] text-active">
            <CheckCircle2 className="h-4 w-4" /> Report submitted.
          </p>
        )}
        {state.kind === 'queued' && (
          <p className="flex items-center gap-2 text-[13px] text-warning">
            <CloudOff className="h-4 w-4" /> Saved offline — syncs automatically on reconnect.
          </p>
        )}
        {state.kind === 'error' && (
          <p className="flex items-center gap-2 text-[13px] text-critical">
            <AlertTriangle className="h-4 w-4" /> {state.message}
          </p>
        )}
        {queued > 0 && (
          <p className="font-mono text-[12px] tabular-nums text-muted">
            {queued} report{queued > 1 ? 's' : ''} waiting to sync.
          </p>
        )}
      </div>
    </form>
  );
}
