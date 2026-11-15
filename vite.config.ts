// Standalone build config (no Lovable dependency).
// Builds the TanStack Start app with Nitro for a plain Node.js server,
// as used by Hostinger's Node.js hosting: `npm run build` → `node .output/server/index.mjs`.
import { defineConfig, loadEnv, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Server-only modules (MySQL driver, auth, scheduler) can be referenced by
// files that are shared with the browser (e.g. *.functions.ts, whose server
// function bodies are stripped from the client build). In the client build
// they are replaced by a stub that throws if anything ever calls it.
const SERVER_ONLY = [/\/src\/lib\/db\//, /\/src\/lib\/scheduler\.server/, /^mysql2(\/|$)/, /^bcryptjs$/];
function serverOnlyStub(): Plugin {
  const STUB = "\0server-only-stub";
  return {
    name: "uid:server-only-stub",
    enforce: "pre",
    applyToEnvironment: (env) => env.name === "client",
    async resolveId(id, importer, opts) {
      if (id === STUB) return STUB;
      if (SERVER_ONLY.some((re) => re.test(id))) return STUB;
      const r = await this.resolve(id, importer, { ...opts, skipSelf: true });
      if (r && SERVER_ONLY.some((re) => re.test(r.id))) return STUB;
      return null;
    },
    load(id) {
      if (id !== STUB) return null;
      return {
        code: `const fail = () => { throw new Error("server-only module called in the browser"); };
export const __stub = new Proxy(fail, { get: (_t, p) => (p === "then" ? undefined : __stub), apply: fail });
export default __stub;`,
        syntheticNamedExports: "__stub",
      };
    },
  };
}

// Hostinger runs Node.js behind LiteSpeed without a usable stdin. An ESM
// import of "node:process" builds a facade that reads process.stdin and
// crashes there ("open EEXIST"), so server builds use the global instead.
function processGlobalShim(): Plugin {
  const ID = "\0process-global";
  return {
    name: "uid:process-global",
    enforce: "pre",
    applyToEnvironment: (env) => env.name !== "client",
    resolveId(id) {
      return id === "process" || id === "node:process" || id === "process/" ? ID : null;
    },
    load(id) {
      if (id !== ID) return null;
      return `const p = globalThis.process;
export default p;
export const env = p.env, argv = p.argv, platform = p.platform, versions = p.versions, version = p.version, pid = p.pid, arch = p.arch, execArgv = p.execArgv;
export const nextTick = (...a) => p.nextTick(...a), cwd = () => p.cwd(), hrtime = Object.assign((...a) => p.hrtime(...a), { bigint: () => p.hrtime.bigint() }), emitWarning = (...a) => p.emitWarning(...a), memoryUsage = () => p.memoryUsage(), uptime = () => p.uptime(), exit = (c) => p.exit(c), on = (...a) => p.on(...a), once = (...a) => p.once(...a), off = (...a) => p.off(...a);`;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine = Object.fromEntries(
    Object.entries(env).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)]),
  );

  return {
    define: envDefine,
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins: [
      serverOnlyStub(),
      processGlobalShim(),
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      // Redirect TanStack Start's server entry to src/server.ts (SSR error wrapper).
      tanstackStart({
        server: { entry: "server" },
        // Same import-protection rules the app was developed with on Lovable.
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
      }),
      nitro({ preset: "node-server" }),
      viteReact(),
    ],
  };
});
