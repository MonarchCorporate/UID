import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Sprout } from "lucide-react";
import { createFarmList } from "@/lib/farm-lists.functions";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/farm-lists/new")({
  component: NewFarmListPage,
});

function NewFarmListPage() {
  const nav = useNavigate();
  const fn = useServerFn(createFarmList);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inv, setInv] = useState(true);
  const [wh, setWh] = useState(true);

  const m = useMutation({
    mutationFn: () =>
      fn({
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          include_personal_inventory: inv,
          include_org_warehouse: wh,
        },
      }),
    onSuccess: (r) => {
      toast.success("Liste erstellt");
      nav({ to: "/farm-lists/$id", params: { id: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageShell eyebrow="Farm Lists" title="Neue Farm-Liste" description="Lege eine neue Sammelliste an.">
      <form
        className="mx-auto max-w-xl space-y-6 border border-brand/10 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          m.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Großauftrag Q4" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="desc">Beschreibung (optional)</Label>
          <Textarea id="desc" maxLength={2000} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="space-y-3 border-t border-brand/10 pt-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">// Auto-Abzug vom Bedarf</div>
          <Row label="Privates Inventar berücksichtigen" hint="Vom Bedarf wird abgezogen, was du selbst eingelagert hast.">
            <Switch checked={inv} onCheckedChange={setInv} />
          </Row>
          <Row label="Orgalager berücksichtigen" hint="Nicht-gesperrte Bestände im Orgalager werden vom Bedarf abgezogen.">
            <Switch checked={wh} onCheckedChange={setWh} />
          </Row>
        </div>

        <div className="flex justify-end gap-2 border-t border-brand/10 pt-4">
          <Button type="submit" disabled={m.isPending || !name.trim()}>
            <Sprout className="mr-1 h-4 w-4" />
            {m.isPending ? "lege an…" : "Liste anlegen"}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}