import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  listNotifications,
  markNotificationsRead,
  type NotificationRow,
} from "@/lib/notifications.functions";

function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}d`;
}

export function NotificationBell({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useServerFn(listNotifications);
  const markRead = useServerFn(markNotificationsRead);

  const q = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => list({ data: { limit: 30 } }),
    refetchOnWindowFocus: true,
  });
  const items = q.data?.items ?? [];
  const unread = useMemo(
    () => items.filter((i) => !i.read_at).length,
    [items],
  );

  const markMut = useMutation({
    mutationFn: (ids?: string[]) => markRead({ data: { ids } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["notifications", "list"] }),
  });

  // Realtime: refetch when a row arrives or is updated for this user.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications", "list"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  const onOpenItem = (n: NotificationRow) => {
    if (!n.read_at) markMut.mutate([n.id]);
    if (n.link) navigate({ to: n.link });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="focus-ring relative flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 bg-card/40 text-muted-foreground transition hover:bg-card/70 hover:text-foreground"
          aria-label="Benachrichtigungen"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(22rem,90vw)] p-0"
      >
        <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            // benachrichtigungen
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markMut.mutate(undefined)}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <Check className="h-3 w-3" />
              Alle gelesen
            </button>
          )}
        </div>
        <ul className="max-h-96 divide-y divide-white/5 overflow-auto">
          {items.length === 0 && (
            <li className="px-3 py-8 text-center text-xs text-muted-foreground">
              Keine Benachrichtigungen.
            </li>
          )}
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onOpenItem(n)}
                className={`flex w-full flex-col items-start gap-1 px-3 py-2 text-left hover:bg-white/5 ${
                  n.read_at ? "opacity-60" : ""
                }`}
              >
                <div className="flex w-full items-center gap-2">
                  {!n.read_at && (
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                  )}
                  <span className="flex-1 truncate text-sm text-foreground">
                    {n.title}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {relTime(n.created_at)}
                  </span>
                </div>
                {n.body && (
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {n.body}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}