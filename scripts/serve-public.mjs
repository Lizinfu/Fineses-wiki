import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const root = path.join(process.cwd(), "public");
const port = Number(process.env.PORT ?? 4173);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function fileForRequest(urlPath) {
  const decoded = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const candidate = path.resolve(root, decoded || "index.html");
  if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== root) return null;

  try {
    const details = await stat(candidate);
    return details.isDirectory() ? path.join(candidate, "index.html") : candidate;
  } catch {
    return path.join(candidate, "index.html");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const filePath = await fileForRequest(url.pathname);
  if (!filePath) {
    response.writeHead(400).end("Invalid path");
    return;
  }

  try {
    await access(filePath);
  } catch {
    response.writeHead(404).end("Not found");
    return;
  }

  response.setHeader("Content-Type", contentTypes[path.extname(filePath)] ?? "application/octet-stream");
  createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving public/ at http://127.0.0.1:${port}`);
});