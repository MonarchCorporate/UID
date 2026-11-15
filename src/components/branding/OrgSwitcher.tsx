import { Check, ChevronsUpDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useBranding } from "@/components/branding/BrandingProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import logo from "@/assets/uid-logo.png.asset.json";
import { cn } from "@/lib/utils";

export function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
  const { org, orgs, setActiveOrgId, name, tag, logoUrl } = useBranding();
  const qc = useQueryClient();
  const brandLogoSrc = logoUrl || logo.url;
  const hasMultiple = orgs.length > 1;

  const handleSelect = (id: string) => {
    if (id === org?.id) return;
    setActiveOrgId(id);
    // Refresh anything that may be org-scoped.
    qc.invalidateQueries();
  };

  const trigger = (
    <button
      type="button"
      className={cn(
        "focus-ring flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5",
        !hasMultiple && "cursor-default hover:bg-transparent",
      )}
      disabled={!hasMultiple}
    >
      <img
        src={brandLogoSrc}
        alt={name}
        className="size-8 shrink-0 rounded-md object-contain"
        width={32}
        height={32}
      />
      {!collapsed && (
        <>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-sm leading-tight tracking-tight">
              {name}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {tag ?? "Backoffice"}
            </div>
          </div>
          {hasMultiple && (
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
        </>
      )}
    </button>
  );

  if (!hasMultiple) return trigger;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Orga wechseln</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((o) => {
          const active = o.id === org?.id;
          const src = o.branding?.logo_url || logo.url;
          return (
            <DropdownMenuItem
              key={o.id}
              onSelect={() => handleSelect(o.id)}
              className="gap-2"
            >
              <img
                src={src}
                alt=""
                className="size-6 shrink-0 rounded object-contain"
                width={24}
                height={24}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{o.name}</div>
                {o.tag && (
                  <div className="truncate text-[10px] text-muted-foreground">
                    {o.tag}
                  </div>
                )}
              </div>
              {active && <Check className="h-4 w-4 text-brand" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}