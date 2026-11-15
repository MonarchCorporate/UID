import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid refetch-on-every-navigation jank. Routes can override.
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload route + loader data on link hover/focus so navigations feel instant.
    defaultPreload: "intent",
    // Let TanStack Query own freshness; router just primes the cache.
    defaultPreloadStaleTime: 0,
  });

  return router;
};
