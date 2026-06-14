/** Gap above which a submission is considered to have waited in the offline queue. */
const OFFLINE_SYNC_THRESHOLD_MS = 60_000;

// The coordinator-visible "arrived via Background Sync" flag (DevPlan 3.2):
// true when the server receives the report well after the device captured it.
export function isOfflineSynced(capturedAtIso: string, now: Date): boolean {
  return now.getTime() - Date.parse(capturedAtIso) > OFFLINE_SYNC_THRESHOLD_MS;
}
