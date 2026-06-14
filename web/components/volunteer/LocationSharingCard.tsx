'use client';

import { useEffect, useRef, useState } from 'react';
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
    <section className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Share my location with HQ</h2>
          <p className="text-xs text-zinc-500">
            Only coordinators can see it. Your latest position replaces the previous one — no
            history is kept.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={enabled}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            enabled ? 'bg-emerald-600 text-white' : 'bg-zinc-200 text-zinc-700'
          }`}
        >
          {enabled ? 'Sharing on' : 'Sharing off'}
        </button>
      </div>
      {enabled && lastSentAt && (
        <p className="text-xs text-zinc-500">Last position sent at {lastSentAt}.</p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </section>
  );
}
