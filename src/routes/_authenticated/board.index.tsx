import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/board/")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/mine" });
  },
});
