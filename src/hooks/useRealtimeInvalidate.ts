import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

type Sub = {
  /** Postgres table to subscribe to (public schema). */
  table: string;
  /** Query keys (prefixes) to invalidate on any change. */
  invalidate: (string | (string | number | undefined)[])[];
  /** Optional server-side filter, e.g. "org_id=eq.<uuid>". */
  filter?: string;
};

/**
 * Subscribe to postgres_changes on the given tables and invalidate the
 * matching react-query keys whenever a row changes. Channels are cleaned up
 * on unmount / dependency change.
 */
export function useRealtimeInvalidate(subs: Sub[], channelName: string) {
  const qc = useQueryClient();
  // Stable dep signature so the effect only re-subscribes when the shape changes.
  const sig = JSON.stringify(
    subs.map((s) => ({ t: s.table, f: s.filter ?? null })),
  );
  useEffect(() => {
    if (!subs.length) return;
    const channel = supabase.channel(channelName);
    for (const s of subs) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: s.table, filter: s.filter },
        () => {
          for (const key of s.invalidate) {
            const queryKey = Array.isArray(key) ? key : [key];
            qc.invalidateQueries({ queryKey });
          }
        },
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, channelName, qc]);
}