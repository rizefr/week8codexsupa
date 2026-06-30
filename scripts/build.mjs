import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

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
    <meta name="theme-color" content="#070b12" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="description" content="Eli’s 8-week hypertrophy cycle tracker with gamification, muscle progress maps, and cloud sync." />
    <title>Eli’s Cycle Tracker</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
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
await verifyBuildOutput();
console.log("Built native ESM app to dist/");
