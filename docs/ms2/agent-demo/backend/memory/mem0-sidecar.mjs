import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Memory } from "mem0ai/oss";

const BODY_LIMIT = 2 * 1024 * 1024;

function dashScopeBaseURL(env) {
  if (env.DASHSCOPE_COMPATIBLE_BASE_URL) {
    return env.DASHSCOPE_COMPATIBLE_BASE_URL.replace(/\/$/, "");
  }
  if (env.DASHSCOPE_WORKSPACE_ID) {
    return `https://${env.DASHSCOPE_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`;
  }
  return "https://dashscope.aliyuncs.com/compatible-mode/v1";
}

export function createMemoryFromEnv(env = process.env) {
  if (!env.DASHSCOPE_API_KEY) {
    throw new Error("DASHSCOPE_API_KEY is required");
  }
  const dataDir = path.resolve(env.MEM0_DATA_DIR || ".data/mem0");
  const baseURL = dashScopeBaseURL(env);
  const embeddingDims = Number(env.MEM0_EMBEDDING_DIMS || 1024);

  return Memory.fromConfig({
    version: "v1.1",
    llm: {
      provider: "openai",
      config: {
        apiKey: env.DASHSCOPE_API_KEY,
        baseURL,
        model: env.DASHSCOPE_CHAT_MODEL || "qwen3.5-flash",
        temperature: 0.1,
        maxTokens: 2000,
      },
    },
    embedder: {
      provider: "openai",
      config: {
        apiKey: env.DASHSCOPE_API_KEY,
        baseURL,
        model: env.DASHSCOPE_EMBEDDING_MODEL || "text-embedding-v4",
        embeddingDims,
      },
    },
    vectorStore: {
      provider: "memory",
      config: {
        collectionName: "speakup_memories",
        dimension: embeddingDims,
        dbPath: path.join(dataDir, "vectors.db"),
      },
    },
    historyStore: {
      provider: "sqlite",
      config: { historyDbPath: path.join(dataDir, "history.db") },
    },
    customInstructions: [
      "Prioritize durable user identity, career background, preferences, long-running goals, and repeated learning patterns.",
      "Do not turn a question into a factual memory. For example, 'What is my name?' does not state the user's name.",
      "Preserve Chinese names and user-provided wording accurately.",
    ].join(" "),
  });
}

async function readJSON(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJSON(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function memoryOptions(body) {
  return {
    userId: body.user_id,
    agentId: body.agent_id,
    runId: body.run_id,
    metadata: body.metadata,
    infer: body.infer !== false,
    expirationDate: body.expiration_date,
  };
}

async function importMemories(memory, body) {
  if (!body.user_id || !Array.isArray(body.items)) {
    throw new Error("user_id and items are required");
  }
  const current = await memory.getAll({ filters: { user_id: body.user_id }, topK: 10000 });
  const importedIDs = new Set(
    (current.results || []).map((item) => item.metadata?.legacy_fact_id).filter(Boolean),
  );
  const results = [];
  for (const item of body.items) {
    if (!item?.id || !item?.memory || importedIDs.has(item.id)) continue;
    const added = await memory.add(item.memory, {
      userId: body.user_id,
      infer: false,
      metadata: {
        ...(item.metadata || {}),
        legacy_fact_id: item.id,
        migrated_from: "speakup_sqlite",
      },
    });
    results.push(...(added.results || []));
    importedIDs.add(item.id);
  }
  return { results };
}

export function createMem0Server(memory) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const match = url.pathname.match(/^\/memories\/([^/]+)(?:\/(history))?$/);

      if (request.method === "GET" && url.pathname === "/health") {
        writeJSON(response, 200, { status: "ok", engine: "mem0" });
        return;
      }
      if (request.method === "POST" && url.pathname === "/memories") {
        const body = await readJSON(request);
        if (!body.user_id || !body.messages) throw new Error("user_id and messages are required");
        writeJSON(response, 200, await memory.add(body.messages, memoryOptions(body)));
        return;
      }
      if (request.method === "POST" && url.pathname === "/imports") {
        writeJSON(response, 200, await importMemories(memory, await readJSON(request)));
        return;
      }
      if (request.method === "POST" && url.pathname === "/search") {
        const body = await readJSON(request);
        if (!body.query || !body.filters) throw new Error("query and filters are required");
        writeJSON(response, 200, await memory.search(body.query, {
          filters: body.filters,
          topK: body.top_k || 5,
          threshold: body.threshold ?? 0.1,
          rerank: body.rerank === true,
          explain: body.explain === true,
        }));
        return;
      }
      if (request.method === "GET" && url.pathname === "/memories") {
        const userID = url.searchParams.get("user_id");
        if (!userID) throw new Error("user_id is required");
        writeJSON(response, 200, await memory.getAll({
          filters: { user_id: userID },
          topK: Number(url.searchParams.get("top_k") || 1000),
        }));
        return;
      }
      if (match && request.method === "GET" && match[2] === "history") {
        const history = await memory.history(decodeURIComponent(match[1]));
        writeJSON(response, 200, { results: history.map((item) => ({
          id: item.id,
          memoryId: item.memoryId ?? item.memory_id,
          previousValue: item.previousValue ?? item.previous_value,
          newValue: item.newValue ?? item.new_value,
          action: item.action,
          createdAt: item.createdAt ?? item.created_at,
          updatedAt: item.updatedAt ?? item.updated_at,
        })) });
        return;
      }
      if (match && request.method === "GET") {
        const item = await memory.get(decodeURIComponent(match[1]));
        writeJSON(response, item ? 200 : 404, item || { error: "memory not found" });
        return;
      }
      if (match && request.method === "PUT") {
        const body = await readJSON(request);
        if (!body.text) throw new Error("text is required");
        await memory.update(decodeURIComponent(match[1]), { text: body.text, metadata: body.metadata });
        writeJSON(response, 200, await memory.get(decodeURIComponent(match[1])));
        return;
      }
      if (match && request.method === "DELETE") {
        writeJSON(response, 200, await memory.delete(decodeURIComponent(match[1])));
        return;
      }
      writeJSON(response, 404, { error: "not found" });
    } catch (error) {
      writeJSON(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

async function main() {
  const memory = createMemoryFromEnv();
  const server = createMem0Server(memory);
  const address = process.env.MEM0_ADDR || "127.0.0.1:8766";
  const separator = address.lastIndexOf(":");
  const host = address.slice(0, separator);
  const port = Number(address.slice(separator + 1));
  server.listen(port, host, () => {
    console.log(`Mem0 OSS sidecar started addr=${address}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
