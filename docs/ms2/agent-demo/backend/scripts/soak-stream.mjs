const turns = Number.parseInt(process.argv[2] || "50", 10);
const apiBase = process.env.AGENT_API_BASE || "http://localhost:8080";
const actorUserID = "demo-user";
const threadID = "thread-demo-001";

if (!Number.isInteger(turns) || turns < 1) {
  throw new Error("turn count must be a positive integer");
}

const results = [];

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

async function runTurn(index) {
  const startedAt = performance.now();
  const response = await fetch(
    `${apiBase}/v1/assistant/threads/${threadID}/tasks/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        actor_user_id: actorUserID,
        user_message: `这是第 ${index}/${turns} 轮稳定性测试。请只回复“第 ${index} 轮正常”。`,
        idempotency_key: `soak-${Date.now()}-${index}`,
      }),
    },
  );
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let firstDeltaMS = null;
  let deltaCount = 0;
  let completed = false;
  let streamedText = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    buffer = buffer.replaceAll("\r\n", "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = block
        .split("\n")
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim();
      const dataText = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (dataText) {
        const data = JSON.parse(dataText);
        if (event === "assistant.delta") {
          firstDeltaMS ??= performance.now() - startedAt;
          deltaCount += 1;
          streamedText += data.delta || "";
        } else if (event === "task.completed") {
          completed = true;
        } else if (event === "task.failed") {
          throw new Error(data.error || "task.failed");
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }

  if (!completed || firstDeltaMS === null || streamedText.trim() === "") {
    throw new Error(
      `incomplete stream: completed=${completed} deltas=${deltaCount}`,
    );
  }
  return {
    index,
    firstDeltaMS,
    totalMS: performance.now() - startedAt,
    deltaCount,
    streamedText,
  };
}

for (let index = 1; index <= turns; index += 1) {
  try {
    const result = await runTurn(index);
    results.push({ ...result, ok: true });
    console.log(
      `${String(index).padStart(2, "0")}/${turns} OK first=${result.firstDeltaMS.toFixed(0)}ms total=${result.totalMS.toFixed(0)}ms chunks=${result.deltaCount}`,
    );
  } catch (error) {
    results.push({
      index,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(
      `${String(index).padStart(2, "0")}/${turns} FAIL ${results.at(-1).error}`,
    );
  }
}

const successes = results.filter((result) => result.ok);
const failures = results.filter((result) => !result.ok);
if (successes.length) {
  const firstValues = successes.map((result) => result.firstDeltaMS);
  const totalValues = successes.map((result) => result.totalMS);
  const average = (values) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  console.log("\nSUMMARY");
  console.log(`success=${successes.length}/${turns}`);
  console.log(`failure=${failures.length}/${turns}`);
  console.log(
    `first_delta avg=${average(firstValues).toFixed(0)}ms p50=${percentile(firstValues, 0.5).toFixed(0)}ms p95=${percentile(firstValues, 0.95).toFixed(0)}ms max=${Math.max(...firstValues).toFixed(0)}ms`,
  );
  console.log(
    `total avg=${average(totalValues).toFixed(0)}ms p50=${percentile(totalValues, 0.5).toFixed(0)}ms p95=${percentile(totalValues, 0.95).toFixed(0)}ms max=${Math.max(...totalValues).toFixed(0)}ms`,
  );
}
if (failures.length) {
  console.log(
    `failed_turns=${failures.map((result) => result.index).join(",")}`,
  );
  process.exitCode = 1;
}
