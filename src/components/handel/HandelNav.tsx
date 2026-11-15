import { Coins, Route as RouteIcon, Store } from "lucide-react";
import { SegmentedNav } from "@/components/layout/PageShell";

export function HandelNav() {
  return (
    <SegmentedNav
      items={[
        { to: "/handel", label: "Rohstoffe", icon: Coins, exact: true },
        { to: "/handel/routenplaner", label: "Routenplaner", icon: RouteIcon },
        { to: "/handel/verkauf", label: "Verkaufsplaner", icon: Store },
      ]}
    />
  );
}