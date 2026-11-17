#!/usr/bin/env node
// A short-lived loopback bridge so the Tier Profile page can save the generated
// YAML directly to <project>/.t3-orca/tiers.yaml.
// Usage:
//   node <skill-dir>/scripts/tier-profile-bridge.mjs --project <dir> --page <built.html> [--ready-file <path>] [--idle-minutes 30]

import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { injectBridgeConfig } from "./build-tier-profile.mjs";
import { resolveProjectRoot, resolveTierProfileTarget, saveTierProfile } from "./save-tier-profile.mjs";

const USAGE =
  "Usage: node <skill-dir>/scripts/tier-profile-bridge.mjs --project <dir> --page <built.html> [--ready-file <path>] [--idle-minutes 30]";
const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_IDLE_MINUTES = 30;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-T3-Orca-Token",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...corsHeaders(),
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolveBody, reject) => {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > limit) {
      const error = new Error(`Request body is larger than ${limit} bytes.`);
      error.status = 413;
      req.resume();
      reject(error);
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error(`Request body is larger than ${limit} bytes.`);
        error.status = 413;
        req.removeAllListeners("data");
        req.resume();
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function tokenMatches(provided, expected) {
  if (typeof provided !== "string" || !provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function requestToken(req, url) {
  const header = req.headers["x-t3-orca-token"];
  if (typeof header === "string" && header) return header;
  return url.searchParams.get("token") || "";
}

export function startTierProfileBridge({
  project,
  page,
  idleMinutes = DEFAULT_IDLE_MINUTES,
  readyFile,
  host = "127.0.0.1",
} = {}) {
  if (!page) throw new Error("A built page path is required.");
  const projectRoot = project ? resolve(project) : resolveProjectRoot(process.cwd());
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    throw new Error(`Project directory does not exist: ${projectRoot}`);
  }
  const target = resolveTierProfileTarget({ project: projectRoot });
  const pageHtml = readFileSync(page, "utf8");
  const token = randomBytes(24).toString("base64url");
  const idleMs = Math.max(0, Number(idleMinutes) || 0) * 60 * 1000;
  let servedHtml = "";

  let lastActivity = Date.now();
  let closed = false;
  let timer;
  let outDir;
  let close;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${host}`);
      if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders());
        res.end();
        return;
      }
      if (url.pathname !== "/save" && url.pathname !== "/health" && url.pathname !== "/shutdown" && url.pathname !== "/page") {
        sendJson(res, 404, { ok: false, error: "Not found." });
        return;
      }
      if (!tokenMatches(requestToken(req, url), token)) {
        sendJson(res, 403, { ok: false, error: "Invalid bridge token." });
        return;
      }
      lastActivity = Date.now();

      if (url.pathname === "/health") {
        sendJson(res, 200, { ok: true, target });
        return;
      }
      if (url.pathname === "/page") {
        res.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": Buffer.byteLength(servedHtml),
          "X-Content-Type-Options": "nosniff",
        });
        res.end(servedHtml);
        return;
      }
      if (url.pathname === "/shutdown") {
        sendJson(res, 200, { ok: true });
        setTimeout(() => close?.(), 10);
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "Use POST." });
        return;
      }

      const body = await readBody(req, MAX_BODY_BYTES);
      const written = saveTierProfile({ project: projectRoot, text: body, cwd: projectRoot });
      sendJson(res, 200, { ok: true, path: written });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 400;
      sendJson(res, status, { ok: false, error: error.message });
    }
  });

  return new Promise((resolveBridge, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      try {
        const port = server.address().port;
        const baseUrl = `http://${host}:${port}`;
        const bridge = {
          url: `${baseUrl}/save`,
          healthUrl: `${baseUrl}/health`,
          shutdownUrl: `${baseUrl}/shutdown`,
          token,
          target,
        };
        const servedBridge = {
          url: "/save",
          healthUrl: "/health",
          shutdownUrl: "/shutdown",
          token,
          target,
        };
        servedHtml = injectBridgeConfig(pageHtml, servedBridge);

        outDir = mkdtempSync(join(tmpdir(), "t3-orca-bridge-"));
        const pagePath = join(outDir, "tier-profile.html");
        writeFileSync(pagePath, injectBridgeConfig(pageHtml, bridge), { mode: 0o600 });
        const pageRoute = `/page?token=${encodeURIComponent(token)}`;
        const pageUrl = `${baseUrl}${pageRoute}`;

        const info = {
          page: pagePath,
          pageUrl,
          pageRoute,
          port,
          healthUrl: bridge.healthUrl,
          target,
          pid: process.pid,
        };
        if (readyFile) {
          writeFileSync(readyFile, JSON.stringify(info), { mode: 0o600 });
        }

        close = () => {
          if (closed) return;
          closed = true;
          if (timer) clearInterval(timer);
          server.close();
          if (outDir) rmSync(outDir, { recursive: true, force: true });
        };

        if (idleMs > 0) {
          timer = setInterval(() => {
            if (Date.now() - lastActivity >= idleMs) close();
          }, Math.min(30_000, Math.max(1_000, Math.floor(idleMs / 4))));
          timer.unref?.();
        }

        resolveBridge({
          ...info,
          url: bridge.url,
          token,
          pagePath,
          pageUrl,
          pageRoute,
          port,
          close,
          server,
        });
      } catch (error) {
        server.close();
        reject(error);
      }
    });
  });
}

export function runCli(argv = process.argv.slice(2)) {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(USAGE);
    return 0;
  }

  let project;
  let page;
  let readyFile;
  let idleMinutes = DEFAULT_IDLE_MINUTES;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") {
      project = argv[++index];
      if (!project) {
        console.error("--project requires a directory.");
        console.error(USAGE);
        return 2;
      }
    } else if (arg.startsWith("--project=")) {
      project = arg.slice("--project=".length);
      if (!project) {
        console.error("--project requires a directory.");
        console.error(USAGE);
        return 2;
      }
    } else if (arg === "--page") {
      page = argv[++index];
      if (!page) {
        console.error("--page requires a file path.");
        console.error(USAGE);
        return 2;
      }
    } else if (arg.startsWith("--page=")) {
      page = arg.slice("--page=".length);
      if (!page) {
        console.error("--page requires a file path.");
        console.error(USAGE);
        return 2;
      }
    } else if (arg === "--ready-file") {
      readyFile = argv[++index];
      if (!readyFile) {
        console.error("--ready-file requires a file path.");
        console.error(USAGE);
        return 2;
      }
    } else if (arg.startsWith("--ready-file=")) {
      readyFile = arg.slice("--ready-file=".length);
      if (!readyFile) {
        console.error("--ready-file requires a file path.");
        console.error(USAGE);
        return 2;
      }
    } else if (arg === "--idle-minutes") {
      idleMinutes = Number(argv[++index]);
    } else if (arg.startsWith("--idle-minutes=")) {
      idleMinutes = Number(arg.slice("--idle-minutes=".length));
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      console.error(USAGE);
      return 2;
    } else {
      console.error(`Unexpected argument: ${arg}`);
      console.error(USAGE);
      return 2;
    }
  }

  if (!page) {
    console.error("--page is required.");
    console.error(USAGE);
    return 2;
  }
  if (!Number.isFinite(idleMinutes) || idleMinutes < 0) {
    console.error("--idle-minutes must be a non-negative number.");
    return 2;
  }

  try {
    startTierProfileBridge({ project, page, readyFile, idleMinutes })
      .then((bridge) => {
        console.log(JSON.stringify({
          page: bridge.page,
          pageUrl: bridge.pageUrl,
          pageRoute: bridge.pageRoute,
          port: bridge.port,
          healthUrl: bridge.healthUrl,
          target: bridge.target,
          pid: bridge.pid,
        }));
        const shutdown = () => bridge.close();
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
      })
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const code = runCli();
  if (code !== 0) process.exitCode = code;
}
