#!/usr/bin/env node

import path from "node:path";
import { spawnSync } from "node:child_process";

const targetCwd = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const isWin = process.platform === "win32";

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function which(binary) {
  if (isWin) {
    const result = run("where", [binary], { shell: true });
    if (!result.ok || !result.stdout) return null;
    return result.stdout.split(/\r?\n/)[0].trim();
  }

  const result = run("bash", ["-lc", `command -v ${binary}`]);
  if (!result.ok || !result.stdout) return null;
  return result.stdout.split("\n")[0].trim();
}

function previewHelp(commandPath) {
  if (!commandPath) return null;
  const result = run(commandPath, ["--help"], { shell: isWin });
  if (!result.ok) return null;
  return result.stdout.split(/\r?\n/).find(Boolean) ?? null;
}

const nodePath = which("node");
const npmPath = which("npm");
const agentBrowserPath = which("agent-browser");

const result = {
  cwd: targetCwd,
  node: {
    available: Boolean(nodePath),
    path: nodePath,
    version: nodePath ? run(nodePath, ["-v"]).stdout || null : null,
  },
  npm: {
    available: Boolean(npmPath),
    path: npmPath,
    version: npmPath ? run(npmPath, ["-v"]).stdout || null : null,
  },
  agentBrowser: {
    available: Boolean(agentBrowserPath),
    path: agentBrowserPath,
    helpPreview: previewHelp(agentBrowserPath),
  },
  playwrightMcp: {
    version: "cursor",
    note: "Playwright MCP is host-provided (Cursor/Claude). Check MCP tool list for browser_navigate and browser_evaluate.",
    detectViaScript: false,
  },
  agentBrowserVersion: {
    version: "codex",
    note: "Codex edition uses agent-browser CLI as the primary browser runtime.",
  },
  supportedEditions: ["cursor (playwright-mcp)", "codex (agent-browser)"],
  usableTools: [
    ...(agentBrowserPath ? ["agent-browser"] : []),
    "playwright-mcp (check MCP tool list at runtime)",
  ],
  recommendedEdition: agentBrowserPath
    ? "codex — agent-browser detected on PATH"
    : "cursor — use Playwright MCP if available; otherwise install agent-browser for Codex edition",
  shouldInstallAgentBrowser: !agentBrowserPath,
  installPlan: agentBrowserPath
    ? ["Codex edition ready. For Cursor edition, enable Playwright MCP plugin."]
    : [
        "Cursor edition: enable Playwright MCP (browser_navigate, browser_evaluate).",
        "Codex edition: install or expose agent-browser on PATH.",
        "Verify Codex with agent-browser --help; verify Cursor with a smoke browser_navigate.",
      ],
};

console.log(JSON.stringify(result, null, 2));
