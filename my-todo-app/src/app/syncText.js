/** One sentence describing where the data is right now. */
export function syncSummary(status, signedIn) {
  if (!signedIn) return "Saved on this device only";
  switch (status.phase) {
    case "syncing":
      return "Syncing…";
    case "offline":
      return "Offline. Changes are saved here and will sync when you are back online.";
    case "error":
      return `Could not sync (${status.message}). Will retry.`;
    case "signed-out":
      return "Session ended. Sign in again to resume syncing.";
    default:
      return status.lastSyncedAt
        ? `Synced at ${new Date(status.lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : "Sync is on";
  }
}
