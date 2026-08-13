// PipeForge desktop (Electron) entry point.
// Serves the static Next.js export (out/) from a loopback HTTP server and
// opens it in a native window — avoids all file:// path issues.
import { app, BrowserWindow } from "electron";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
};

function serveStatic(outDir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let file = path.join(outDir, urlPath === "/" ? "index.html" : urlPath);
      if (!file.startsWith(outDir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(outDir, "404.html");
      }
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

let server;

app.whenReady().then(async () => {
  const outDir = path.join(__dirname, "..", "out");
  server = await serveStatic(outDir);
  const { port } = server.address();

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#0b0e12",
    autoHideMenuBar: true,
    title: "PipeForge",
  });
  win.loadURL(`http://127.0.0.1:${port}/`);
});

app.on("window-all-closed", () => {
  server?.close();
  app.quit();
});
