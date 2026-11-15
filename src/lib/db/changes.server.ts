// In-process change counters per table. They replace Supabase Realtime: the
// browser polls /api/public/realtime and refreshes data whenever the counter
// of a table it watches changes.
const versions = new Map<string, number>();
const boot = Date.now();

export function bumpTable(table: string) {
  versions.set(table, (versions.get(table) ?? 0) + 1);
}

export function tableVersions(tables: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of tables) out[t] = `${boot}:${versions.get(t) ?? 0}`;
  return out;
}
