#!/usr/bin/env node
// Run from the isolated Focus Garden checkout: node scripts/focus-garden-preview.cjs
// /focus mounts the real Focus page. /grove-lab mounts its development-only gallery.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const root = path.resolve(__dirname, "..");
process.chdir(root);
const port = Number(process.argv[2] ?? 43181);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Expected a TCP port.");
const address = "127.0.0.1:" + port;

// Route framework imports to the fixture browser history. The real navigation,
// account-scoped controller and Focus UI stay mounted across client navigation.
function nextBrowserShims() {
  const router = JSON.stringify(path.join(root, "scripts/focus-garden-router.js"));
  const modules = {
    "next/link": "export { Link as default } from " + router,
    "next/dynamic": "export { dynamic as default } from " + router,
    "next/navigation": "export { usePathname, useRouter, useSearchParams } from " + router,
  };
  return {
    name: "focus-preview-router",
    enforce: "pre",
    resolveId(id) { if (Object.hasOwn(modules, id)) return "\0preview:" + id; },
    load(id) { if (id.startsWith("\0preview:")) return modules[id.slice(9)]; },
  };
}

function pageMarkup() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Focus Garden · fictional local preview</title>
  <link rel="stylesheet" href="/garden.css">
  <style>@font-face{font-family:GroveGeist;src:url(/GeistVF.woff) format("woff");font-weight:100 900;font-display:swap}body{font-family:GroveGeist,system-ui,sans-serif}</style>
</head>
<body class="bg-[#E0EFFE] dark:bg-[#0D1B2E] text-slate-900 dark:text-zinc-100 min-h-screen">
  <div id="root"></div>
  <script src="/garden.js" defer></script>
</body>
</html>`;
}

async function compile() {
  // Vite comes with this checkout's Vitest. Build in memory without loading a
  // deployment config, env files, public files or starting a hot-reload client.
  const { build } = await import("vite");
  const watched = new Set(["app/fonts/GeistVF.woff", "tailwind.config.ts"]);
  const tracking = {
    name: "focus-preview-source-list",
    generateBundle() {
      for (const id of this.getModuleIds()) {
        if (id.includes("@supabase/") || id.includes("@prisma/") || id.includes("/lib/supabase/") || id.endsWith("/app/auth/actions.ts")) {
          throw new Error("Unexpected backend dependency in browser preview");
        }
        if (id.startsWith(root + path.sep) && !id.includes("/node_modules/") && fs.existsSync(id)) {
          watched.add(id);
        }
      }
    },
  };

  const result = await build({
    root,
    configFile: false,
    envDir: false,
    publicDir: false,
    logLevel: "error",
    resolve: { alias: {
      "@/app/auth/actions": path.join(root, "scripts/focus-garden-auth.js"),
      "@": root,
    } },
    define: { "process.env.NODE_ENV": '"production"' },
    oxc: { jsx: { runtime: "automatic" } },
    plugins: [nextBrowserShims(), tracking],
    css: { postcss: { plugins: [require("tailwindcss")(path.join(root, "tailwind.config.ts"))] } },
    build: {
      write: false,
      reportCompressedSize: false,
      lib: { entry: path.join(root, "scripts/focus-garden-fixture.jsx"), name: "FocusPreview", formats: ["iife"] },
      rolldownOptions: { output: { codeSplitting: false } },
    },
  });
  const { output } = Array.isArray(result) ? result[0] : result;
  return {
    html: pageMarkup(),
    font: fs.readFileSync("app/fonts/GeistVF.woff"),
    js: output.find(entry => entry.type === "chunk" && entry.isEntry).code,
    css: output.find(entry => entry.type === "asset" && entry.fileName.endsWith(".css")).source,
    stamps: [...watched].map(file => [file, fs.statSync(file).mtimeMs]),
  };
}

let cached;
let pending;
async function assets() {
  const current = cached?.stamps.every(([file, stamp]) => fs.existsSync(file) && fs.statSync(file).mtimeMs === stamp);
  if (current) return cached;
  if (!pending) {
    pending = compile().then(result => { cached = result; }).finally(() => { pending = undefined; });
  }
  await pending;
  return cached;
}

const paths = new Map([
  ["/focus", ["html", "text/html; charset=utf-8"]],
  ["/grove-lab", ["html", "text/html; charset=utf-8"]],
  ["/daily", ["html", "text/html; charset=utf-8"]],
  ["/login", ["html", "text/html; charset=utf-8"]],
  ["/GeistVF.woff", ["font", "font/woff"]],
  ["/garden.js", ["js", "application/javascript"]],
  ["/garden.css", ["css", "text/css"]],
]);
const policy = [
  "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:", "font-src 'self'", "connect-src 'none'", "base-uri 'none'",
  "frame-ancestors 'none'", "form-action 'none'",
].join("; ");

const server = http.createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", policy);
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.headers.host !== address || !["GET", "HEAD"].includes(request.method)) {
    response.writeHead(403).end();
    return;
  }
  const pathname = new URL(request.url, "http://" + address).pathname;
  if (pathname === "/favicon.ico") {
    response.writeHead(204).end();
    return;
  }
  const route = paths.get(pathname);
  if (!route) {
    response.writeHead(404).end();
    return;
  }
  try {
    const compiled = await assets();
    const [kind, contentType] = route;
    response.writeHead(200, { "Content-Type": contentType });
    response.end(request.method === "HEAD" ? undefined : compiled[kind]);
  } catch (error) {
    console.error(error.message);
    response.writeHead(503).end("Could not compile the local preview. Check its terminal.");
  }
});

server.on("error", error => {
  console.error(error.message);
  process.exit(1);
});
assets().then(() => {
  server.listen(port, "127.0.0.1", () => console.log("Fictional Focus Garden: http://" + address + "/focus"));
}).catch(error => {
  console.error(error);
  process.exit(1);
});
