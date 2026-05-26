import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const root = path.join(process.cwd(), "dist");
const port = Number(process.env.PORT ?? 5173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const requested = path.normalize(path.join(root, decoded));
  return requested.startsWith(root) ? requested : path.join(root, "index.html");
}

const server = http.createServer((request, response) => {
  const urlPath = request.url === "/" ? "/index.html" : request.url ?? "/index.html";
  let filePath = safePath(urlPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(root, "index.html");
  }
  const extension = path.extname(filePath);
  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Training dashboard running at http://127.0.0.1:${port}`);
});
