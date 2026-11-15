import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import {
  listTreasuryCategories,
  upsertTreasuryCategory,
  deleteTreasuryCategory,
  type TreasuryCategory,
} from "@/lib/org-treasury.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const KIND_LABEL: Record<TreasuryCategory["kind"], string> = {
  both: "Ein- & Auszahlungen",
  deposit: "Nur Einnahmen",
  expense: "Nur Ausgaben",
};

const PRESET_COLORS = [
  "#22d3ee",
  "#34d399",
  "#f472b6",
  "#fbbf24",
  "#a78bfa",
  "#f87171",
  "#60a5fa",
  "#4ade80",
];

export function TreasuryCategorySettings({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listTreasuryCategories);
  const upsertFn = useServerFn(upsertTreasuryCategory);
  const delFn = useServerFn(deleteTreasuryCategory);

  const q = useQuery({
    queryKey: ["treasury-categories", orgId],
    queryFn: () => listFn({ data: { org_id: orgId } }),
    enabled: !!orgId,
  });

  const canManage = q.data?.canManage ?? false;
  const categories = q.data?.categories ?? [];

  const [name, setName] = useState("");
  const [kind, setKind] = useState<TreasuryCategory["kind"]>("both");
  const [color, setColor] = useState(PRESET_COLORS[0]!);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editKind, setEditKind] = useState<TreasuryCategory["kind"]>("both");
  const [editColor, setEditColor] = useState(PRESET_COLORS[0]!);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["treasury-categories", orgId] });
    qc.invalidateQueries({ queryKey: ["org-treasury"] });
  };

  const saveM = useMutation({
    mutationFn: (v: {
      id?: string;
      name: string;
      kind: TreasuryCategory["kind"];
      color: string;
      sort_order?: number;
    }) => upsertFn({ data: { org_id: orgId, ...v } }),
    onSuccess: () => {
      toast.success("Kategorie gespeichert");
      setName("");
      setKind("both");
      setColor(PRESET_COLORS[0]!);
      setEditId(null);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Kategorie gelöscht");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const startEdit = (c: TreasuryCategory) => {
    setEditId(c.id);
    setEditName(c.name);
    setEditKind(c.kind);
    setEditColor(c.color);
  };

  return (
    <Card className="border-brand/10">
      <CardHeader>
        <CardTitle className="text-sm">Buchungs-Kategorien</CardTitle>
        <p className="text-xs text-muted-foreground">
          Diese Kategorien stehen bei „Neue Buchung" als Auswahl bereit und werden
          in den Diagrammen mit ihrer Farbe dargestellt.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <div className="grid gap-3 rounded-lg border border-brand/10 bg-muted/20 p-3 md:grid-cols-[1fr_200px_auto_auto] md:items-end">
            <div className="grid gap-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Mining"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Gültig für</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as TreasuryCategory["kind"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as Array<TreasuryCategory["kind"]>).map(
                    (k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABEL[k]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Farbe</Label>
              <ColorPicker value={color} onChange={setColor} />
            </div>
            <Button
              size="sm"
              disabled={!name.trim() || saveM.isPending}
              onClick={() =>
                saveM.mutate({
                  name: name.trim(),
                  kind,
                  color,
                  sort_order: categories.length,
                })
              }
            >
              <Plus className="mr-1 h-3 w-3" /> Hinzufügen
            </Button>
          </div>
        )}

        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Lade Kategorien…</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Kategorien angelegt.
          </p>
        ) : (
          <div className="divide-y divide-border/50 rounded-lg border border-brand/10">
            {categories.map((c) =>
              editId === c.id ? (
                <div
                  key={c.id}
                  className="grid gap-3 p-3 md:grid-cols-[1fr_200px_auto_auto_auto] md:items-end"
                >
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <Select
                    value={editKind}
                    onValueChange={(v) =>
                      setEditKind(v as TreasuryCategory["kind"])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.keys(KIND_LABEL) as Array<TreasuryCategory["kind"]>
                      ).map((k) => (
                        <SelectItem key={k} value={k}>
                          {KIND_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ColorPicker value={editColor} onChange={setEditColor} />
                  <Button
                    size="sm"
                    disabled={!editName.trim() || saveM.isPending}
                    onClick={() =>
                      saveM.mutate({
                        id: c.id,
                        name: editName.trim(),
                        kind: editKind,
                        color: editColor,
                      })
                    }
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditId(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="h-4 w-4 rounded-full border border-white/20"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {KIND_LABEL[c.kind]}
                    </span>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(c)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => delM.mutate(c.id)}
                        disabled={delM.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-300" />
                      </Button>
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent p-1"
        aria-label="Farbe wählen"
      />
      <div className="hidden gap-1 lg:flex">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className="h-4 w-4 rounded-full border border-white/20"
            style={{ backgroundColor: c }}
            aria-label={`Farbe ${c}`}
          />
        ))}
      </div>
    </div>
  );
}