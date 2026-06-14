import ServiceWorkerRegistrar from '@/components/volunteer/ServiceWorkerRegistrar';

export default function VolunteerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      {children}
      <ServiceWorkerRegistrar />
    </div>
  );
}
