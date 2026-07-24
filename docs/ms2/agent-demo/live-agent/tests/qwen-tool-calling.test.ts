import assert from "node:assert/strict";
import test from "node:test";
import { llm } from "@livekit/agents";
import { z } from "zod";

import {
  qwenFunctionCall,
  qwenRealtimeTools,
} from "../src/providers/qwen-omni-realtime.js";

test("serializes LiveKit tools in the Qwen realtime session format", () => {
  const tool = llm.tool({
    name: "create_learning_scenario",
    description: "Create a scenario",
    parameters: z.object({ title: z.string() }),
    execute: async ({ title }) => ({ title }),
  });
  const context = new llm.ToolContext([tool]);

  assert.deepEqual(qwenRealtimeTools(context), [{
    type: "function",
    function: {
      name: "create_learning_scenario",
      description: "Create a scenario",
      parameters: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
        additionalProperties: false,
      },
    },
  }]);
});

test("maps Qwen completed arguments into a LiveKit function call", () => {
  const call = qwenFunctionCall({
    type: "response.function_call_arguments.done",
    item_id: "item-1",
    call_id: "call-1",
    name: "create_learning_scenario",
    arguments: "{\"title\":\"Backend interview\"}",
  });

  assert.equal(call?.id, "item-1");
  assert.equal(call?.callId, "call-1");
  assert.equal(call?.name, "create_learning_scenario");
  assert.equal(call?.args, "{\"title\":\"Backend interview\"}");
  assert.equal(qwenFunctionCall({ name: "missing-call-id" }), undefined);
});
