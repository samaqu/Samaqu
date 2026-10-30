/** Batas waktu pembayaran — helper murni (aman untuk client & server). */
export function isPastDeadline(deadline: string | null | undefined, now = Date.now()): boolean {
  if (!deadline) return false;
  return new Date(deadline).getTime() <= now;
}
