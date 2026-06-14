import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/login/actions';
import ReportForm from '@/components/volunteer/ReportForm';
import LocationSharingCard from '@/components/volunteer/LocationSharingCard';

export const metadata = {
  title: 'LUWAS — Volunteer',
  description: 'Offline-first field reporting for disaster response volunteers.',
};

export default async function VolunteerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirectedFrom=/volunteer');
  }

  const { data: barangays } = await supabase
    .from('barangay_directory')
    .select('id, name, city_municipality')
    .order('name');

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-10">
      <header className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-semibold">LUWAS Volunteer</h1>
          <p className="text-sm text-zinc-500">{user.email}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100"
          >
            Sign out
          </button>
        </form>
      </header>

      <ReportForm barangays={barangays ?? []} />
      <LocationSharingCard />
    </main>
  );
}
