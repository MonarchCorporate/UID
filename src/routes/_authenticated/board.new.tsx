import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/board/new")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/new", search: { mode: "instant" } });
  },
});
