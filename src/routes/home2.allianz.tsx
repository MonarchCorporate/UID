import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/home2/allianz")({
  beforeLoad: () => {
    throw redirect({ to: "/home2/community", replace: true });
  },
  component: () => null,
});
