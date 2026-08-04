'use client';

import { useEffect, useState } from 'react';
import type { SitRep } from '@/lib/sitrep/build';

const SOURCE_LABEL: Record<SitRep['areas'][number]['affectedSource'], string> = {
  override: 'coordinator override', reported: 'confirmed field report',
  predicted: 'model prediction', none: 'no estimate',
};

const kg = (n: number) => `${Math.round(n).toLocaleString()} kg`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

export default function SitRepView() {
  const [sitrep, setSitrep] = useState<SitRep | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/sitrep', { cache: 'no-store' });
        const out = await res.json();
        if (!res.ok) throw new Error(out?.error ?? `sitrep ${res.status}`);
        setSitrep(out as SitRep);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'situation report unreachable');
      }
    })();
  }, []);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="rounded-control border border-critical/40 bg-critical/10 px-3 py-2 text-[13px] text-critical">
          Situation report could not be built — {error}. Check you are signed in as a
          coordinator, then reload.
        </p>
      </main>
    );
  }

  if (!sitrep) {
    return <main className="mx-auto max-w-3xl p-8 text-[13px] text-muted">Building situation report…</main>;
  }

  const s = sitrep.summary;

  return (
    <main className="sitrep mx-auto max-w-3xl p-8 print:max-w-none print:p-0">
      {/* The dashboard palette is a dark operations console; paper is white. */}
      <style>{`
        @media print {
          .sitrep, .sitrep * { background: #fff !important; color: #111 !important; }
          .sitrep { font-size: 11pt; }
          .sitrep__noprint { display: none !important; }
          .sitrep__section { break-inside: avoid; }
        }
      `}</style>

      <header className="mb-6 flex items-start justify-between gap-6 border-b border-line pb-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-fg">LUWAS situation report</h1>
          <p className="text-[12px] text-muted">
            Operation window {when(sitrep.window.from)} → {when(sitrep.window.to)}
          </p>
          <p className="text-[11px] text-muted">
            Field shape follows an ADINet situation update. Not transmitted; export only.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="sitrep__noprint rounded-control border border-line-strong px-3 py-1.5 text-[12px] text-fg transition-colors duration-150 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
        >
          Print
        </button>
      </header>

      <section className="sitrep__section mb-6 grid grid-cols-3 gap-3">
        {[
          ['Areas in operation', s.areasInOperation.toLocaleString()],
          ['People affected', s.peopleAffected.toLocaleString()],
          ['Areas delivered', `${s.areasDelivered} of ${s.areasInOperation}`],
          ['Cargo planned', kg(s.totalCargoKg)],
          ['Areas unrouted', s.unroutedAreas.toLocaleString()],
          ['Silent > 24h', s.silentOver24h.toLocaleString()],
        ].map(([label, value]) => (
          <div key={label} className="rounded-card border border-line bg-surface px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
            <p className="text-[16px] text-fg">{value}</p>
          </div>
        ))}
      </section>

      <section className="sitrep__section mb-6">
        <h2 className="mb-2 text-[13px] font-semibold text-fg">Affected areas</h2>
        <table className="w-full border-collapse text-left text-[12px]">
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th className="py-1.5 pr-3 font-normal">Barangay</th>
              <th className="py-1.5 pr-3 font-normal">Priority</th>
              <th className="py-1.5 pr-3 font-normal">Affected</th>
              <th className="py-1.5 pr-3 font-normal">Damage</th>
              <th className="py-1.5 pr-3 font-normal">Manifest</th>
              <th className="py-1.5 font-normal">Route</th>
            </tr>
          </thead>
          <tbody className="text-fg">
            {sitrep.areas.map((a) => (
              <tr key={a.barangayId} className="border-b border-line align-top">
                <td className="py-1.5 pr-3">
                  {a.name}
                  {a.city && <span className="text-muted"> · {a.city}</span>}
                </td>
                <td className="py-1.5 pr-3">{a.priorityScore?.toFixed(2) ?? '—'}</td>
                <td className="py-1.5 pr-3">
                  {a.affected?.toLocaleString() ?? '—'}
                  <span className="block text-[11px] text-muted">{SOURCE_LABEL[a.affectedSource]}</span>
                </td>
                <td className="py-1.5 pr-3">{a.damageSeverity ?? 'unknown'}</td>
                <td className="py-1.5 pr-3">
                  {a.manifest
                    ? <>
                        {kg(a.manifest.cargoKg)} · {a.manifest.days}d
                        <span className="block text-[11px] text-muted">
                          {a.manifest.waterL.toLocaleString()} L water · {a.manifest.foodPacks.toLocaleString()} food · review {a.manifest.review}
                        </span>
                      </>
                    : '—'}
                </td>
                <td className="py-1.5">{a.routeStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="sitrep__section mb-6">
        <h2 className="mb-2 text-[13px] font-semibold text-fg">Deliveries</h2>
        {sitrep.deliveries.length === 0 ? (
          <p className="text-[12px] text-muted">No route has been marked reached in this window.</p>
        ) : (
          <ul className="space-y-1 text-[12px] text-fg">
            {sitrep.deliveries.map((d) => (
              <li key={d.routeId}>
                {d.team} → {d.areas.join(', ')}
                <span className="text-muted"> · {when(d.completedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sitrep__section">
        <h2 className="mb-2 text-[13px] font-semibold text-fg">Gaps</h2>

        <h3 className="text-[12px] text-muted">Planned but not routed</h3>
        {sitrep.gaps.unrouted.length === 0 ? (
          <p className="mb-3 text-[12px] text-fg">Every area with a manifest is on a route.</p>
        ) : (
          <ul className="mb-3 space-y-1 text-[12px] text-fg">
            {sitrep.gaps.unrouted.map((g) => (
              <li key={g.barangayId}>{g.name} — {g.reason}</li>
            ))}
          </ul>
        )}

        <h3 className="text-[12px] text-muted">
          No confirmed contact in over 24h ({sitrep.gaps.silentCount.toLocaleString()} total
          {sitrep.gaps.silent.length < sitrep.gaps.silentCount && `, ${sitrep.gaps.silent.length} listed`})
        </h3>
        {sitrep.gaps.silent.length === 0 ? (
          <p className="text-[12px] text-fg">Every area has been contacted in the last 24 hours.</p>
        ) : (
          <ul className="space-y-1 text-[12px] text-fg">
            {sitrep.gaps.silent.map((g) => (
              <li key={g.barangayId}>
                {g.name} — {g.hoursSinceContact == null ? 'never contacted' : `${Math.round(g.hoursSinceContact)}h`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
