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

export function createStaticBasePathServer({
  buildDirectory = defaultBuildDirectory,
  crossOriginIsolated = false,
  additionalFiles = {}
} = {}) {
  if (typeof crossOriginIsolated !== "boolean") {
    throw new TypeError("crossOriginIsolated deve essere booleano");
  }
  if (additionalFiles === null || typeof additionalFiles !== "object" || Array.isArray(additionalFiles)) {
    throw new TypeError("additionalFiles deve mappare route assolute a percorsi di file");
  }
  const root = path.resolve(buildDirectory);
  const additionalFilePaths = new Map();
  for (const [route, filePath] of Object.entries(additionalFiles)) {
    let decodedRoute;
    try {
      decodedRoute = decodeURIComponent(route);
    } catch {
      throw new TypeError(`Route diagnostica non valida: ${route}`);
    }
    if (!decodedRoute.startsWith(`${BASE_PATH}/`) || decodedRoute.includes("\\") ||
      decodedRoute.includes("\0") || decodedRoute.split("/").some((part) => part === "..") ||
      decodedRoute.endsWith("/") || typeof filePath !== "string" || filePath.trim() === "") {
      throw new TypeError(`File diagnostico non valido: ${route}`);
    }
    additionalFilePaths.set(decodedRoute, path.resolve(filePath));
  }
  const isolationHeaders = crossOriginIsolated
    ? {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp"
      }
    : {};

  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendText(response, 405, "Method not allowed", { Allow: "GET, HEAD", ...isolationHeaders });
      return;
    }

    const rawPath = (request.url ?? "/").split("?", 1)[0];
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch {
      sendText(response, 400, "Bad request", isolationHeaders);
      return;
    }
    const additionalFile = additionalFilePaths.get(decodedPath);
    const mapped = additionalFile
      ? { kind: "file", filePath: additionalFile }
      : resolveBuildPath(rawPath, root);
    if (mapped.kind === "redirect") {
      response.writeHead(302, { Location: mapped.location, "Cache-Control": "no-store", ...isolationHeaders });
      response.end();
      return;
    }
    if (mapped.kind === "bad-request") {
      sendText(response, 400, "Bad request", isolationHeaders);
      return;
    }
    if (mapped.kind === "forbidden") {
      sendText(response, 403, "Forbidden", isolationHeaders);
      return;
    }
    if (mapped.kind === "not-found") {
      sendText(response, 404, "Not found", isolationHeaders);
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
        "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream",
        ...isolationHeaders
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }

      const stream = createReadStream(filePath);
      stream.on("error", (error) => {
        if (response.headersSent) response.destroy(error);
        else sendText(response, 500, "Unable to read file", isolationHeaders);
      });
      stream.pipe(response);
    } catch {
      sendText(response, 404, "Not found", isolationHeaders);
    }
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  const args = process.argv.slice(2);
  const unknownOptions = args.filter((arg) => arg.startsWith("--") && arg !== "--cross-origin-isolated");
  const portArgument = args.find((arg) => !arg.startsWith("--")) ?? "4173";
  const port = Number.parseInt(portArgument, 10);
  if (unknownOptions.length > 0) {
    process.stderr.write(`Unknown option: ${unknownOptions[0]}\n`);
    process.exitCode = 1;
  } else if (!Number.isInteger(port) || port < 1 || port > 65535) {
    process.stderr.write("Port must be an integer between 1 and 65535.\n");
    process.exitCode = 1;
  } else {
    const crossOriginIsolated = args.includes("--cross-origin-isolated");
    const server = createStaticBasePathServer({ crossOriginIsolated });
    server.listen(port, "127.0.0.1", () => {
      const isolationStatus = crossOriginIsolated ? " (cross-origin isolated)" : "";
      process.stdout.write(`Serving build/ at http://127.0.0.1:${port}${BASE_PATH}/${isolationStatus}\n`);
    });
  }
}
