import type { SupplyManifest } from '@/lib/types/coordinator';

type Reviewable = Pick<SupplyManifest, 'status'>;

/** Dispatch is open until a manifest exists; once one does, a human must have reviewed it. */
export function canDispatch(manifest?: Reviewable | null): boolean {
  if (!manifest) return true;
  return manifest.status === 'approved' || manifest.status === 'modified';
}

/** What blocks dispatch and what the coordinator does about it; null when dispatch is open. */
export function dispatchBlockedReason(manifest?: Reviewable | null): string | null {
  if (canDispatch(manifest)) return null;
  return manifest!.status === 'rejected'
    ? 'Manifest rejected — approve or modify it in Supplies before dispatching.'
    : 'Manifest awaiting approval — approve it in Supplies before dispatching.';
}
