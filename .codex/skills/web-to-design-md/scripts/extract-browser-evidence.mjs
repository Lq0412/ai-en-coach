#!/usr/bin/env node

// Codex-edition helper. Requires `agent-browser` on PATH.
// The Cursor edition does NOT use this script — it calls the Playwright MCP
// `browser_evaluate` tool directly with the snippets in references/.

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const url = process.argv[2];
const outPath = process.argv[3];

if (!url) {
  console.error("Usage: node scripts/extract-browser-evidence.mjs <url> [outPath]");
  process.exit(1);
}

const targetCwd = process.cwd();
const outFile = outPath
  ? path.resolve(targetCwd, outPath)
  : path.join(os.tmpdir(), `website-design-evidence-${Date.now()}.json`);

const styleProbe = `
  (() => {
    const clean = (value) => (value || "").replace(/\\s+/g, " ").trim();
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const truncate = (value, limit = 4000) => {
      const text = value || "";
      return text.length > limit ? text.slice(0, limit) + "\\n<!-- truncated -->" : text;
    };
    const attrsOf = (el) => {
      if (!el) return {};
      return Object.fromEntries(
        [...el.attributes]
          .slice(0, 24)
          .map((attr) => [attr.name, clean(attr.value).slice(0, 300)])
      );
    };
    const styleOf = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        text: clean(el.textContent).slice(0, 160),
        className: clean(el.className).slice(0, 200),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        color: s.color,
        backgroundColor: s.backgroundColor,
        borderColor: s.borderColor,
        borderRadius: s.borderRadius,
        boxShadow: s.boxShadow,
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        textTransform: s.textTransform,
        textDecoration: s.textDecorationLine,
        padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].join(" "),
        margin: [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft].join(" "),
        gap: s.gap,
        display: s.display,
        position: s.position,
        html: truncate(el.outerHTML, 2400),
        attrs: attrsOf(el),
      };
    };
    const collectCssVariables = (style) =>
      [...style]
        .filter((name) => name.startsWith("--"))
        .slice(0, 160)
        .reduce((acc, name) => {
          const value = clean(style.getPropertyValue(name));
          if (value) acc[name] = value;
          return acc;
        }, {});
    const readableCssRules = () => {
      const sheets = [];
      for (const sheet of [...document.styleSheets].slice(0, 40)) {
        const entry = {
          href: sheet.href || null,
          ownerNode: sheet.ownerNode?.tagName?.toLowerCase() || null,
          rules: [],
          inaccessible: false,
        };
        try {
          const rules = [...sheet.cssRules].slice(0, 80);
          entry.rules = rules.map((rule) => clean(rule.cssText).slice(0, 700));
        } catch {
          entry.inaccessible = true;
        }
        sheets.push(entry);
      }
      return sheets;
    };
    const sampleKeyNodes = (selector, limit = 8) =>
      [...document.querySelectorAll(selector)]
        .filter(isVisible)
        .slice(0, limit)
        .map((el) => ({
          selector,
          ...styleOf(el),
        }));
    const sampleVisible = (selector, limit = 12) =>
      [...document.querySelectorAll(selector)]
        .filter(isVisible)
        .slice(0, limit)
        .map(styleOf);
    const nav = [...document.querySelectorAll("header, nav")].find(isVisible);
    const footer = [...document.querySelectorAll("footer")].find(isVisible);
    const heroHeading = [...document.querySelectorAll("h1")].find(isVisible);
    const heroText = heroHeading?.closest("section, div");
    const cards = [...document.querySelectorAll("section div, li, article")]
      .filter((el) => isVisible(el) && /border|shadow|rounded|card/i.test(el.className || ""))
      .slice(0, 8)
      .map(styleOf);
    const headings = sampleVisible("h1, h2, h3", 16);
    const buttons = sampleVisible("button, a", 20).filter((item) => item.text && item.text.length < 80);
    const sections = [...document.querySelectorAll("main > *, section")]
      .filter(isVisible)
      .slice(0, 16)
      .map((el) => {
        const s = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          text: clean(el.textContent).slice(0, 120),
          backgroundColor: s.backgroundColor,
          borderColor: s.borderColor,
          minHeight: s.minHeight,
          paddingTop: s.paddingTop,
          paddingBottom: s.paddingBottom,
          html: truncate(el.outerHTML, 2600),
        };
      });
    const dom = {
      htmlLang: document.documentElement.lang || null,
      bodyClass: clean(document.body.className),
      bodyAttributes: attrsOf(document.body),
      rootVariables: collectCssVariables(getComputedStyle(document.documentElement)),
      bodyVariables: collectCssVariables(getComputedStyle(document.body)),
      inlineStyles: [...document.querySelectorAll("style")]
        .slice(0, 24)
        .map((node) => truncate(node.textContent, 2400)),
      styleSheets: readableCssRules(),
      headHtml: truncate(document.head.innerHTML, 10000),
      bodyHtmlStart: truncate(document.body.innerHTML, 12000),
      mainHtml: truncate(document.querySelector("main")?.outerHTML || "", 16000),
      keyNodes: {
        header: sampleKeyNodes("header, nav", 4),
        headings: sampleKeyNodes("h1, h2, h3", 12),
        buttons: sampleKeyNodes("button, a", 16),
        cards: sampleKeyNodes("article, [class*='card'], [class*='panel']", 12),
      },
    };
    const fonts = [...new Set(
      [...document.querySelectorAll("body, body *")]
        .slice(0, 600)
        .map((el) => getComputedStyle(el).fontFamily)
        .filter(Boolean)
    )];
    const colors = [...new Set(
      [...document.querySelectorAll("body, body *")]
        .slice(0, 400)
        .flatMap((el) => {
          const s = getComputedStyle(el);
          return [s.color, s.backgroundColor, s.borderColor];
        })
        .filter((value) => value && value !== "rgba(0, 0, 0, 0)" && value !== "transparent")
    )].slice(0, 60);
    const textSnippets = [...document.querySelectorAll("h1, h2, h3, p, a, button, span")]
      .filter(isVisible)
      .map((el) => clean(el.textContent))
      .filter(Boolean)
      .slice(0, 80);

    return {
      title: document.title,
      url: location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      root: styleOf(document.documentElement),
      body: styleOf(document.body),
      nav: styleOf(nav),
      footer: styleOf(footer),
      heroHeading: styleOf(heroHeading),
      heroContainer: styleOf(heroText),
      headings,
      buttons,
      cards,
      sections,
      fonts,
      colors,
      textSnippets,
      dom,
      documentHeight: document.documentElement.scrollHeight,
      imageCount: document.querySelectorAll("img, picture, svg").length,
    };
  })()
`;

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
  const result = run("bash", ["-lc", `command -v ${binary}`]);
  if (!result.ok || !result.stdout) {
    return null;
  }
  return result.stdout.split("\n")[0].trim();
}

function detectTooling() {
  return { agentBrowserPath: which("agent-browser") };
}

async function ensureDir(filePath) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
}

function lastNonEmptyLine(value) {
  return `${value ?? ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .pop() ?? "";
}

function parseJsonOutput(stdout, label = "JSON output") {
  const text = `${stdout ?? ""}`.trim();
  if (!text) {
    throw new Error(`${label} was empty`);
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // keep scanning upward in case the CLI printed extra lines
    }
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} was not valid JSON:\n${text.slice(-800)}`);
  }
}

function runAgentBrowser(agentBrowserPath, sessionId, args, options = {}) {
  const result = run(agentBrowserPath, ["--session", sessionId, ...args], {
    input: options.input,
  });

  if (!options.allowFailure && !result.ok) {
    const detail = result.stderr || result.stdout || `agent-browser ${args.join(" ")} failed`;
    throw new Error(detail);
  }

  return result;
}

async function evaluateAgentBrowserJson(agentBrowserPath, sessionId, expression) {
  const result = runAgentBrowser(agentBrowserPath, sessionId, ["eval", "--stdin"], {
    input: `${expression}\n`,
  });
  return parseJsonOutput(result.stdout, "agent-browser eval output");
}

async function evaluateAgentBrowserText(agentBrowserPath, sessionId, expression, options = {}) {
  const result = runAgentBrowser(agentBrowserPath, sessionId, ["eval", "--stdin"], {
    input: `${expression}\n`,
    allowFailure: options.allowFailure ?? false,
  });
  return lastNonEmptyLine(result.stdout);
}

async function scrollSweepAgentBrowser(agentBrowserPath, sessionId) {
  await evaluateAgentBrowserText(agentBrowserPath, sessionId, "window.scrollTo(0, 0); 'ok';", { allowFailure: true });
  runAgentBrowser(agentBrowserPath, sessionId, ["wait", "200"], { allowFailure: true });
  runAgentBrowser(agentBrowserPath, sessionId, ["scroll", "down", "1400"], { allowFailure: true });
  runAgentBrowser(agentBrowserPath, sessionId, ["wait", "300"], { allowFailure: true });
  runAgentBrowser(agentBrowserPath, sessionId, ["scroll", "down", "2200"], { allowFailure: true });
  runAgentBrowser(agentBrowserPath, sessionId, ["wait", "300"], { allowFailure: true });
  await evaluateAgentBrowserText(agentBrowserPath, sessionId, "window.scrollTo(0, 0); 'ok';", { allowFailure: true });
  runAgentBrowser(agentBrowserPath, sessionId, ["wait", "300"], { allowFailure: true });
}

async function extractWithAgentBrowser(urlToRead, agentBrowserPath) {
  const sessionId = `website-design-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    runAgentBrowser(agentBrowserPath, sessionId, ["open", urlToRead]);
    runAgentBrowser(agentBrowserPath, sessionId, ["wait", "--load", "networkidle"], { allowFailure: true });
    runAgentBrowser(agentBrowserPath, sessionId, ["wait", "1500"], { allowFailure: true });
    await scrollSweepAgentBrowser(agentBrowserPath, sessionId);

    const desktop = await evaluateAgentBrowserJson(agentBrowserPath, sessionId, `JSON.stringify(${styleProbe})`);
    const finalUrl =
      (await evaluateAgentBrowserText(agentBrowserPath, sessionId, "location.href", { allowFailure: true })) || urlToRead;
    const title =
      (await evaluateAgentBrowserText(agentBrowserPath, sessionId, "document.title", { allowFailure: true })) ||
      desktop.title ||
      "";

    desktop.title = title;
    desktop.meta = {
      finalUrl,
      contentLength: desktop.dom?.bodyHtmlStart?.length ?? null,
    };

    return {
      extractedAt: new Date().toISOString(),
      url: urlToRead,
      pages: {
        desktop,
      },
      interactions: {},
      tooling: {
        selectedTool: "agent-browser-eval",
        browserPath: agentBrowserPath,
        sessionId,
      },
    };
  } finally {
    runAgentBrowser(agentBrowserPath, sessionId, ["close"], { allowFailure: true });
  }
}

async function main() {
  const tooling = detectTooling(targetCwd);
  if (!tooling.agentBrowserPath) {
    throw new Error(
      "`agent-browser` is not available in PATH. This Codex-edition extractor requires agent-browser."
    );
  }

  const results = await extractWithAgentBrowser(url, tooling.agentBrowserPath);
  results.tooling = {
    ...(results.tooling ?? {}),
    preferredOrder: ["agent-browser-eval"],
    agentBrowserPath: tooling.agentBrowserPath,
    fallbackNotes: [],
  };

  await ensureDir(outFile);
  await fsp.writeFile(outFile, JSON.stringify(results, null, 2));
  console.log(outFile);
}

await main();
