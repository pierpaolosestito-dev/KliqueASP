import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BASE_PATH = "/KliqueASP";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultBuildDirectory = path.resolve(scriptDirectory, "../build");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff2", "font/woff2"]
]);

export function resolveBuildPath(requestPath, buildDirectory = defaultBuildDirectory) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return { kind: "bad-request" };
  }

  if (!decodedPath.startsWith("/") || decodedPath.includes("\0") || decodedPath.includes("\\")) {
    return { kind: "bad-request" };
  }
  if (decodedPath === "/" || decodedPath === BASE_PATH) {
    return { kind: "redirect", location: `${BASE_PATH}/` };
  }
  if (!decodedPath.startsWith(`${BASE_PATH}/`)) {
    return { kind: "not-found" };
  }

  const relativePath = decodedPath.slice(BASE_PATH.length + 1);
  const pathParts = relativePath.split("/").filter(Boolean);
  if (pathParts.some((part) => part === "..")) {
    return { kind: "forbidden" };
  }

  const root = path.resolve(buildDirectory);
  let filePath = path.resolve(root, ...pathParts);
  if (pathParts.length === 0) {
    filePath = path.join(root, "index.html");
  } else if (!path.extname(pathParts.at(-1))) {
    filePath = path.join(filePath, "index.html");
  }
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    return { kind: "forbidden" };
  }

  return { kind: "file", filePath };
}

function sendText(response, statusCode, message, headers = {}) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    ...headers
  });
  response.end(message);
}

export function createStaticBasePathServer({ buildDirectory = defaultBuildDirectory } = {}) {
  const root = path.resolve(buildDirectory);

  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendText(response, 405, "Method not allowed", { Allow: "GET, HEAD" });
      return;
    }

    const rawPath = (request.url ?? "/").split("?", 1)[0];
    const mapped = resolveBuildPath(rawPath, root);
    if (mapped.kind === "redirect") {
      response.writeHead(302, { Location: mapped.location, "Cache-Control": "no-store" });
      response.end();
      return;
    }
    if (mapped.kind === "bad-request") {
      sendText(response, 400, "Bad request");
      return;
    }
    if (mapped.kind === "forbidden") {
      sendText(response, 403, "Forbidden");
      return;
    }
    if (mapped.kind === "not-found") {
      sendText(response, 404, "Not found");
      return;
    }

    let filePath = mapped.filePath;
    try {
      if ((await stat(filePath)).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      const fileStats = await stat(filePath);
      if (!fileStats.isFile()) {
        sendText(response, 404, "Not found");
        return;
      }

      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": fileStats.size,
        "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream"
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }

      const stream = createReadStream(filePath);
      stream.on("error", (error) => {
        if (response.headersSent) response.destroy(error);
        else sendText(response, 500, "Unable to read file");
      });
      stream.pipe(response);
    } catch {
      sendText(response, 404, "Not found");
    }
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  const port = Number.parseInt(process.argv[2] ?? "4173", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    process.stderr.write("Port must be an integer between 1 and 65535.\n");
    process.exitCode = 1;
  } else {
    const server = createStaticBasePathServer();
    server.listen(port, "127.0.0.1", () => {
      process.stdout.write(`Serving build/ at http://127.0.0.1:${port}${BASE_PATH}/\n`);
    });
  }
}
