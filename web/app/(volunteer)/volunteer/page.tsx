import Image from 'next/image';
import { redirect } from 'next/navigation';
import { BookOpen, ListChecks, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/login/actions';
import ReportForm from '@/components/volunteer/ReportForm';
import LocationSharingCard from '@/components/volunteer/LocationSharingCard';
import ConnectionStatusCard from '@/components/volunteer/ConnectionStatusCard';

export const metadata = {
  title: 'LUWAS — Volunteer',
  description: 'Offline-first field reporting for disaster response volunteers.',
};

const SEVERITY_GUIDE = [
  { label: 'Critical', dot: 'bg-critical', note: 'Life-threatening — needs immediate response.' },
  { label: 'High', dot: 'bg-critical/70', note: 'Urgent needs, rapidly worsening.' },
  { label: 'Moderate', dot: 'bg-warning', note: 'Significant needs, situation stable.' },
  { label: 'Low', dot: 'bg-reached', note: 'Minor needs or precautionary.' },
];

const REPORTING_TIPS = [
  'Attach a GPS fix when you can — otherwise the barangay centroid is used.',
  'Flag impassable roads so dispatch reroutes around them.',
  'Estimate the number of people affected, even roughly.',
  'Offline is fine — reports queue on your device and sync on reconnect.',
];

export default async function VolunteerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirectedFrom=/volunteer');
  }

  // The directory has ~1,211 barangays but PostgREST caps a response at 1,000
  // rows, so page through it to offer the full list (not just the first page).
  const PAGE = 1000;
  const barangays: { id: string; name: string; city_municipality: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page } = await supabase
      .from('barangay_directory')
      .select('id, name, city_municipality')
      .order('name')
      .range(from, from + PAGE - 1);
    if (!page?.length) break;
    barangays.push(...page);
    if (page.length < PAGE) break;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col">
      {/* Sticky command header — stays in reach while content scrolls. */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-teal-500/50 to-transparent" />
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-3">
            <Image
              src="/LUWAS_logo.png"
              alt="LUWAS"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
              priority
            />
            <div className="min-w-0">
              <h1 className="font-mono text-[15px] font-bold leading-none tracking-[0.2em] text-fg">
                LUWAS
              </h1>
              <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.2em] text-teal-500/80">
                Field Reporter
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden max-w-[200px] truncate text-[12px] font-mono text-muted sm:flex sm:items-center sm:gap-1.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-active" />
              {user.email}
            </p>
            <form action={signOut}>
              <button
                type="submit"
                title="Sign out"
                className="flex min-h-[44px] items-center gap-2 rounded-control border border-line px-3 text-[12px] font-medium text-muted transition-colors hover:bg-raised hover:text-fg"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Bento — single column on mobile, 2/3 + 1/3 split on desktop. */}
      <div
        className="flex flex-1 flex-col gap-4 px-4 pt-4"
        style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}
      >
        <p className="flex items-center gap-1.5 truncate text-[12px] font-mono text-muted sm:hidden">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-active" />
          {user.email}
        </p>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* Hero tile — the report form */}
          <div className="lg:flex-[2]">
            <ReportForm barangays={barangays ?? []} />
          </div>

          {/* Side stack */}
          <div className="flex flex-col gap-4 lg:flex-1">
            <ConnectionStatusCard />
            <LocationSharingCard />
          </div>
        </div>

        {/* Field-guide band */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <section className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <BookOpen className="h-4 w-4 text-teal-400" />
              <h2 className="text-[13px] font-mono font-semibold uppercase tracking-[0.15em] text-fg">
                Severity Guide
              </h2>
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {SEVERITY_GUIDE.map((s) => (
                <li key={s.label} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
                  <span className="w-20 shrink-0 text-[13px] font-medium text-fg">{s.label}</span>
                  <span className="text-[12px] text-muted">{s.note}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <ListChecks className="h-4 w-4 text-teal-400" />
              <h2 className="text-[13px] font-mono font-semibold uppercase tracking-[0.15em] text-fg">
                Reporting Tips
              </h2>
            </div>
            <ul className="flex flex-col gap-2.5 p-4">
              {REPORTING_TIPS.map((tip) => (
                <li key={tip} className="flex items-start gap-2.5 text-[12px] leading-relaxed text-muted">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500/70" aria-hidden />
                  {tip}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
