import ServiceWorkerRegistrar from '@/components/volunteer/ServiceWorkerRegistrar';

export default function VolunteerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh bg-zinc-50">
      {children}
      <ServiceWorkerRegistrar />
    </div>
  );
}
