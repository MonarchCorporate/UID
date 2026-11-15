import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/home2/")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
