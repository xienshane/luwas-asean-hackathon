'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Radio, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { shouldPublish, type Fix } from '@/lib/live/position';

const SHARE_KEY = 'luwas-share-location';

// Consent-gated live location sharing (DevPlan 3.4 + Phase 6.2 PII rules).
//
// Phase 6.2 makes consent EXPLICIT: enabling sharing opens an affirmative
// disclosure (what is collected, who sees it, how long it is kept) that the
// volunteer must accept before any position is streamed. Accepting records
// consent (volunteers.consent_at) and ensures the volunteer row exists; only
// then does the throttled stream start, via the update_volunteer_position RPC,
// readable only by coordinators. Precise GPS is auto-purged after 7 days
// (purge_stale_volunteer_gps). A volunteer who already consented before skips
// straight to streaming.
export default function LocationSharingCard() {
  const [enabled, setEnabled] = useState(false);
  const [consented, setConsented] = useState<boolean | null>(null); // null = loading
  const [showConsent, setShowConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastFixRef = useRef<Fix | null>(null);

  // Restore the device-local sharing preference and load prior consent state.
  useEffect(() => {
    setEnabled(window.localStorage.getItem(SHARE_KEY) === 'on');

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) {
        if (!cancelled) setConsented(false);
        return;
      }
      const { data } = await supabase
        .from('volunteers')
        .select('consent_at')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) setConsented(Boolean(data?.consent_at));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Stream throttled fixes while enabled. Consent is recorded separately (on
  // accept), so this effect only runs once sharing is actually on.
  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not available on this device.');
      return;
    }

    const supabase = createClient();
    let watchId: number | null = null;
    let cancelled = false;

    watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        if (cancelled) return;
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

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled]);

  const startSharing = () => {
    setEnabled(true);
    setError(null);
    window.localStorage.setItem(SHARE_KEY, 'on');
  };

  const stopSharing = () => {
    setEnabled(false);
    window.localStorage.setItem(SHARE_KEY, 'off');
  };

  const toggle = () => {
    if (enabled) {
      stopSharing();
      return;
    }
    // Turning ON: require an affirmative consent step the first time.
    if (consented) {
      startSharing();
    } else {
      setShowConsent(true);
    }
  };

  const acceptConsent = async () => {
    setRecording(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('You must be signed in to share your location.');
      setRecording(false);
      return;
    }
    // Record consent AND ensure the volunteer row exists (the position RPC only
    // updates an existing row), in one write.
    const { error: consentError } = await supabase
      .from('volunteers')
      .upsert({ id: user.id, consent_at: new Date().toISOString() }, { onConflict: 'id' });
    setRecording(false);
    if (consentError) {
      setError(`Could not record consent: ${consentError.message}`);
      return;
    }
    setConsented(true);
    setShowConsent(false);
    startSharing();
  };

  const declineConsent = () => {
    setShowConsent(false);
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
        {showConsent ? (
          /* Affirmative consent disclosure (Phase 6.2) */
          <div className="flex flex-col gap-3 rounded-control border border-active/30 bg-active/5 p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-active" />
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-fg">
                Consent to share your location
              </h3>
            </div>
            <ul className="flex flex-col gap-1.5 text-[12px] leading-relaxed text-muted">
              <li>• <span className="text-fg">What:</span> your device&apos;s precise GPS position while sharing is on.</li>
              <li>• <span className="text-fg">Who sees it:</span> only disaster coordinators (HQ). Not other volunteers.</li>
              <li>• <span className="text-fg">How long:</span> only your latest position is kept (no trail), and it is automatically deleted after 7 days of inactivity.</li>
              <li>• <span className="text-fg">Your control:</span> turn it off anytime; this consent is required under the Data Privacy Act (RA 10173).</li>
            </ul>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={acceptConsent}
                disabled={recording}
                className="min-h-[44px] flex-1 rounded-control border border-active/30 bg-active/15 px-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-active transition-colors hover:bg-active/25 disabled:opacity-60"
              >
                {recording ? 'Saving…' : 'I consent & share'}
              </button>
              <button
                type="button"
                onClick={declineConsent}
                disabled={recording}
                className="min-h-[44px] rounded-control border border-line bg-raised px-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted transition-colors hover:text-fg disabled:opacity-60"
              >
                Not now
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] leading-relaxed text-muted">
              Only coordinators can see it. Your latest position replaces the previous one — no
              history is kept, and it is purged after 7 days.
            </p>
            <button
              type="button"
              onClick={toggle}
              disabled={consented === null}
              aria-pressed={enabled}
              className={`min-h-[44px] shrink-0 rounded-control px-4 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors disabled:opacity-60 ${
                enabled
                  ? 'border border-active/30 bg-active/15 text-active'
                  : 'border border-line bg-raised text-muted hover:text-fg'
              }`}
            >
              {enabled ? 'On' : 'Off'}
            </button>
          </div>
        )}
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
