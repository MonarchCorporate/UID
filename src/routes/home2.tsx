import { createFileRoute, Outlet } from "@tanstack/react-router";
import { UidNav } from "@/components/uid/UidNav";
import { UidFooter } from "@/components/uid/UidFooter";

export const Route = createFileRoute("/home2")({
  component: UidLayout,
});

function UidLayout() {
  return (
    <div className="uid-theme min-h-screen">
      <UidNav />
      <main className="pt-18">
        <Outlet />
      </main>
      <UidFooter />
    </div>
  );
}