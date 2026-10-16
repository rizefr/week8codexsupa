import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import ts from "typescript";
import { generateIcons } from "./icons.mjs";

const root = process.cwd();
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");
const distSrcDir = path.join(distDir, "src");
const vendorDir = path.join(distDir, "vendor", "preact");

const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  jsx: ts.JsxEmit.ReactJSX,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
  importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
};

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(fullPath) : fullPath;
    }),
  );
  return files.flat();
}

function addJsExtensions(code) {
  return code
    .replace(/import\s+["'][^"']+\.css["'];?\n?/g, "")
    .replace(/(from\s+["'])(\.{1,2}\/[^"']+?)(["'])/g, (_match, before, specifier, after) => {
      if (/\.(js|mjs|css|json|svg|png|jpg|jpeg|webp)$/.test(specifier)) {
        return `${before}${specifier}${after}`;
      }
      return `${before}${specifier}.js${after}`;
    });
}

async function copyFile(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const contents = await fs.readFile(source);
  await fs.writeFile(destination, contents);
}

async function buildSource() {
  const files = await walk(srcDir);
  for (const file of files) {
    const relative = path.relative(srcDir, file);
    const extension = path.extname(file);
    if ([".css", ".png", ".svg", ".jpg", ".jpeg", ".webp"].includes(extension)) {
      await copyFile(file, path.join(distSrcDir, relative));
      continue;
    }
    if (extension !== ".ts" && extension !== ".tsx") continue;
    const source = await fs.readFile(file, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions,
      fileName: file,
      reportDiagnostics: true,
    });
    const diagnostics = output.diagnostics ?? [];
    const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    if (errors.length) {
      const message = ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (value) => value,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      });
      throw new Error(message);
    }
    const destination = path.join(distSrcDir, relative.replace(/\.(ts|tsx)$/, ".js"));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, addJsExtensions(output.outputText), "utf8");
  }
}

async function copyVendor() {
  const vendorFiles = [
    ["node_modules/preact/dist/preact.module.js", "preact.module.js"],
    ["node_modules/preact/hooks/dist/hooks.module.js", "hooks.module.js"],
    ["node_modules/preact/compat/dist/compat.module.js", "compat.module.js"],
    ["node_modules/preact/compat/client.mjs", "client.mjs"],
    ["node_modules/preact/jsx-runtime/dist/jsxRuntime.module.js", "jsxRuntime.module.js"],
  ];
  await fs.mkdir(vendorDir, { recursive: true });
  await Promise.all(vendorFiles.map(([source, destination]) => copyFile(path.join(root, source), path.join(vendorDir, destination))));
}

async function writeIndex() {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0b0c0f" />
    <meta name="color-scheme" content="dark" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Cycle" />
    <meta name="format-detection" content="telephone=no" />
    <meta name="description" content="Eli’s upper-priority hypertrophy tracker: workout logging, muscle volume map, PRs and body trends." />
    <title>Eli’s Cycle Tracker</title>
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="./icons/icon-192.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="./src/styles.css" />
    <script src="./config.js"></script>
    <script type="importmap">
      {
        "imports": {
          "react": "./vendor/preact/compat.module.js",
          "react-dom/client": "./vendor/preact/client.mjs",
          "react/jsx-runtime": "./vendor/preact/jsxRuntime.module.js",
          "preact": "./vendor/preact/preact.module.js",
          "preact/hooks": "./vendor/preact/hooks.module.js",
          "preact/compat": "./vendor/preact/compat.module.js"
        }
      }
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.js"></script>
  </body>
</html>
`;
  await fs.writeFile(path.join(distDir, "index.html"), html, "utf8");
}

async function writePwa() {
  const manifest = {
    name: "Eli’s Cycle Tracker",
    short_name: "Cycle",
    description: "Upper-priority hypertrophy tracker",
    start_url: "./#/dashboard",
    scope: "./",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0c0f",
    theme_color: "#0b0c0f",
    icons: [
      { src: "./icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "./icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "./icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  await fs.writeFile(path.join(distDir, "manifest.webmanifest"), JSON.stringify(manifest, null, 2), "utf8");
  await fs.mkdir(path.join(distDir, "icons"), { recursive: true });
  for (const [file, buffer] of Object.entries(generateIcons())) {
    await fs.writeFile(path.join(distDir, file), buffer);
  }

  // Precache every built file so the app opens offline; requests stay network-first.
  const files = (await walk(distDir))
    .map((file) => path.relative(distDir, file).split(path.sep).join("/"))
    .filter((file) => !file.endsWith(".map") && file !== "sw.js");
  const hash = crypto.createHash("sha256");
  for (const file of files.sort()) hash.update(file).update(await fs.readFile(path.join(distDir, file)));
  const version = hash.digest("hex").slice(0, 12);
  const sw = `// Generated by scripts/build.mjs. Network-first with an offline fallback so a
// weak gym connection still opens the app, and new deploys are picked up on reload.
const CACHE = "cycle-tracker-${version}";
const FONT_CACHE = "cycle-tracker-fonts";
const PRECACHE = ${JSON.stringify(["./", ...files.map((file) => `./${file}`)])};
const TIMEOUT_MS = 3500;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("cycle-tracker-") && key !== CACHE && key !== FONT_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function withTimeout(promise) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(caches.open(FONT_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok || response.type === "opaque") cache.put(request, response.clone());
      return response;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await withTimeout(fetch(request));
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === "navigate") {
        const shell = await cache.match("./index.html");
        if (shell) return shell;
      }
      throw error;
    }
  })());
});
`;
  await fs.writeFile(path.join(distDir, "sw.js"), sw, "utf8");
}

async function writeConfig() {
  const config = {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  };
  const isProductionContext = process.env.CONTEXT === "production";
  if (isProductionContext && (!config.supabaseUrl || !config.supabaseAnonKey)) {
    throw new Error(
      "Production build is missing SUPABASE_URL or SUPABASE_ANON_KEY. Run `npx netlify build --context production` so Netlify injects the live Cloud Sync config.",
    );
  }
  const body = `window.__TRAINING_APP_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`;
  await fs.writeFile(path.join(distDir, "config.js"), body, "utf8");
}

async function verifyBuildOutput() {
  const requiredFiles = [
    "index.html",
    "config.js",
    "src/main.js",
    "src/App.js",
    "src/styles.css",
    "vendor/preact/preact.module.js",
    "vendor/preact/hooks.module.js",
    "vendor/preact/compat.module.js",
    "vendor/preact/client.mjs",
    "vendor/preact/jsxRuntime.module.js",
    "manifest.webmanifest",
    "sw.js",
    "icons/apple-touch-icon.png",
  ];
  const missing = [];
  for (const relativePath of requiredFiles) {
    const filePath = path.join(distDir, relativePath);
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile() || stats.size === 0) missing.push(relativePath);
    } catch {
      missing.push(relativePath);
    }
  }
  if (missing.length) {
    throw new Error(`Build output is incomplete. Missing required app-shell files: ${missing.join(", ")}`);
  }

  const index = await fs.readFile(path.join(distDir, "index.html"), "utf8");
  if (!index.includes("./src/styles.css") || !index.includes("./src/main.js")) {
    throw new Error("Build output index.html does not link the app stylesheet and module entry.");
  }
}

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });
await buildSource();
await copyVendor();
await writeConfig();
await writeIndex();
await writePwa();
await verifyBuildOutput();
console.log("Built native ESM app to dist/");
