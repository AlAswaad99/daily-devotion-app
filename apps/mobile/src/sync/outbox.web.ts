/**
 * Web writes go straight through `sync_outbox` when they happen (see
 * `data/repository.web`), so there is never anything queued. Kept only so
 * `profile.tsx`'s `pendingCount` import resolves the same way on every platform.
 */
export async function pendingCount(): Promise<number> {
  return 0
}
