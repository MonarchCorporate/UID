import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/orga/flotte")({
  beforeLoad: () => {
    throw redirect({ to: "/orga/einstellungen" });
  },
});
