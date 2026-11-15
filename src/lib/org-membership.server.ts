import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns the set of user ids who share at least one org with `userId`,
 * INCLUDING the user themself. Used to scope `visibility = 'org'` reads
 * across user-owned tables (blueprints, inventory_items, inventory_locations)
 * when querying via `supabaseAdmin` (RLS bypassed).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function coOrgMemberIds(admin: SupabaseClient<any>, userId: string): Promise<string[]> {
  const { data: myOrgs, error: orgsErr } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId);
  if (orgsErr) throw new Error(orgsErr.message);
  const orgIds = (myOrgs ?? []).map((r) => r.org_id as string);
  if (orgIds.length === 0) return [userId];
  const { data: peers, error: peersErr } = await admin
    .from("org_members")
    .select("user_id")
    .in("org_id", orgIds);
  if (peersErr) throw new Error(peersErr.message);
  const set = new Set<string>([userId, ...(peers ?? []).map((r) => r.user_id as string)]);
  return Array.from(set);
}