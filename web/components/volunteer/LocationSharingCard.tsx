'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Radio } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { shouldPublish, type Fix } from '@/lib/live/position';

const SHARE_KEY = 'luwas-share-location';

// Consent-gated live location sharing (DevPlan 3.4 + PII rules):
// enabling records consent (volunteers.consent_at) and streams throttled fixes
// through the update_volunteer_position RPC; only HQ (coordinator) can read them.
export default function LocationSharingCard() {
  const [enabled, setEnabled] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastFixRef = useRef<Fix | null>(null);

  useEffect(() => {
    setEnabled(window.localStorage.getItem(SHARE_KEY) === 'on');
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not available on this device.');
      return;
    }

    const supabase = createClient();
    let watchId: number | null = null;
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // Ensure the volunteer row exists and (re)record consent.
      const { error: consentError } = await supabase
        .from('volunteers')
        .upsert({ id: user.id, consent_at: new Date().toISOString() }, { onConflict: 'id' });
      if (consentError) {
        setError(`Could not record consent: ${consentError.message}`);
        return;
      }

      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const fix: Fix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            t: Date.now(),
          };
          if (!shouldPublish(lastFixRef.current, fix)) return;
          lastFixRef.current = fix;
          const { error: rpcError } = await supabase.rpc('update_volunteer_position', {
            p_lat: fix.lat,
            p_lng: fix.lng,
          });
          if (rpcError) setError(rpcError.message);
          else {
            setError(null);
            setLastSentAt(new Date().toLocaleTimeString());
          }
        },
        (geoError) => setError(geoError.message),
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
      );
    })();

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled]);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setError(null);
    window.localStorage.setItem(SHARE_KEY, next ? 'on' : 'off');
  };

  return (
    <section className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
      {/* Panel header — matches the Field Report panel */}
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="relative flex h-4 w-4 items-center justify-center">
          <Radio className={`h-4 w-4 ${enabled ? 'text-active' : 'text-muted'}`} />
          {enabled && (
            <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-active/70" />
          )}
        </span>
        <h2 className="text-[13px] font-mono font-semibold uppercase tracking-[0.15em] text-fg">
          Live Location
        </h2>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] leading-relaxed text-muted">
            Only coordinators can see it. Your latest position replaces the previous one — no
            history is kept.
          </p>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={enabled}
            className={`min-h-[44px] shrink-0 rounded-control px-4 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors ${
              enabled
                ? 'border border-active/30 bg-active/15 text-active'
                : 'border border-line bg-raised text-muted hover:text-fg'
            }`}
          >
            {enabled ? 'On' : 'Off'}
          </button>
        </div>
        {enabled && lastSentAt && (
          <p className="font-mono text-[12px] tabular-nums text-muted">
            Last position sent {lastSentAt}.
          </p>
        )}
        {error && (
          <p className="flex items-center gap-2 text-[12px] text-critical">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </p>
        )}
      </div>
    </section>
  );
}
