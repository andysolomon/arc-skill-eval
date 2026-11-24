import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  collectPiSdkRunnableCases,
  normalizeSkillEvalContract,
  runPiSdkCase,
} from "../dist/index.js";

const source = {
  kind: "local",
  input: ".",
  repositoryRoot: process.cwd(),
  displayName: "arc-skill-eval",
  resolvedRef: null,
  git: null,
};

const skillFiles = {
  skillName: "alpha",
  skillDir: path.join(process.cwd(), "tests/fixtures/valid-skill-repo/skills/alpha"),
  relativeSkillDir: "skills/alpha",
  skillDefinitionPath: path.join(process.cwd(), "tests/fixtures/valid-skill-repo/skills/alpha/SKILL.md"),
  evalDefinitionPath: path.join(process.cwd(), "tests/fixtures/valid-skill-repo/skills/alpha/skill.eval.ts"),
};

// A provider failure (e.g. quota exhaustion) does not reject session.prompt —
// it only leaves a terminal assistant message with stopReason "error". The
// runner must surface that as a case error instead of grading an empty
// response (which reads as an honest 0/N assertion failure).
function stubSessionFactory(messages) {
  return async (options) => ({
    model: options.requestedModel ?? null,
    session: {
      sessionId: "session-err",
      sessionFile: "/tmp/session-err.jsonl",
      messages,
      subscribe() { return () => {}; },
      async prompt() {},
      dispose() {},
    },
  });
}

function simpleAlphaCase() {
  const contract = normalizeSkillEvalContract({
    skill: "alpha",
    profile: "planning",
    targetTier: 1,
    routing: { explicit: [{ id: "routing-explicit-001", prompt: "Use alpha explicitly." }], implicitPositive: [], adjacentNegative: [] },
  });
  const [caseDefinition] = collectPiSdkRunnableCases(contract);
  return { skill: { files: skillFiles, contract }, caseDefinition };
}

test("runPiSdkCase does not flag a mid-session provider error the agent recovered from", async () => {
  const { skill, caseDefinition } = simpleAlphaCase();
  const result = await runPiSdkCase({
    source,
    skill,
    caseDefinition,
    workspaceDir: process.cwd(),
    createSession: stubSessionFactory([
      { role: "assistant", content: [], stopReason: "error", errorMessage: "overloaded, retrying" },
      { role: "assistant", content: "recovered and done" },
    ]),
  });
  assert.deepEqual(result.session.messages.at(-1), { role: "assistant", content: "recovered and done" });
});

// Failure modes for raw runtime-event capture (issue #237):
//   1. Each `message_update` keeps its cumulative `message`/`partial`
//      snapshot, so capture grows quadratically with streamed output.
//   2. Compaction drops what the stream actually says (deltas, the final
//      `toolcall_end.toolCall`, content indexes), so traces lose detail.
//   3. Compaction leaks into other events (`message_end` must stay whole).
//   4. Captured events alias live Pi objects that keep mutating.
//   5. With no ceiling, a runaway stream still OOMs the process; past the
//      ceiling capture must stop, say so, and keep the run going.
function streamingSessionFactory(emitEvents) {
  return async (options) => {
    const listeners = new Set();
    const messages = [];
    return {
      model: options.requestedModel ?? null,
      session: {
        sessionId: "session-stream",
        sessionFile: undefined,
        messages,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        async prompt() {
          emitEvents((event) => {
            for (const listener of listeners) listener(event);
          }, messages);
        },
        dispose() {},
      },
    };
  };
}

function emitLongToolCall({ deltas, deltaSize }) {
  return (emit, messages) => {
    const toolCall = { type: "toolCall", id: "call-1", name: "write", arguments: {} };
    const partial = { role: "assistant", content: [toolCall], stopReason: "toolUse" };
    let args = "";
    for (let index = 0; index < deltas; index += 1) {
      const delta = String(index % 10).repeat(deltaSize);
      args += delta;
      // Pi mutates one partial in place and sends it with every update.
      toolCall.partialArgs = args;
      emit({ type: "message_update", message: partial, assistantMessageEvent: { type: "toolcall_delta", contentIndex: 0, delta, partial } });
    }
    toolCall.arguments = { path: "index.html", content: args };
    delete toolCall.partialArgs;
    emit({ type: "message_update", message: partial, assistantMessageEvent: { type: "toolcall_end", contentIndex: 0, toolCall, partial } });
    emit({ type: "message_end", message: partial });
    messages.push(partial);
    return args;
  };
}

test("runPiSdkCase captures streamed message_update events in linear space", async () => {
  const { skill, caseDefinition } = simpleAlphaCase();
  const deltas = 2_000;
  const deltaSize = 50;
  const result = await runPiSdkCase({
    source,
    skill,
    caseDefinition,
    workspaceDir: process.cwd(),
    createSession: streamingSessionFactory(emitLongToolCall({ deltas, deltaSize })),
  });

  const events = result.session.events;
  const finalMessageBytes = JSON.stringify(result.session.messages.at(-1)).length;
  const capturedBytes = JSON.stringify(events).length;
  // Quadratic capture would be ~100 MB here. Linear capture is the deltas,
  // fixed framing per event, and the finished tool call / final message a
  // couple of times (toolcall_end, message_end).
  const linearBudget = 3 * finalMessageBytes + deltas * 128;
  assert.ok(
    capturedBytes < linearBudget,
    `captured ${capturedBytes} bytes of events for a ${finalMessageBytes}-byte message`,
  );
  assert.equal(result.session.eventsTruncated, false);

  const updates = events.filter((event) => event.type === "message_update");
  assert.equal(updates.length, deltas + 1);
  for (const update of updates) {
    assert.equal("message" in update, false);
    assert.equal("partial" in update.assistantMessageEvent, false);
  }
  assert.deepEqual(updates[1], {
    type: "message_update",
    assistantMessageEvent: { type: "toolcall_delta", contentIndex: 0, delta: "1".repeat(deltaSize) },
  });
  const reassembled = updates
    .filter((update) => update.assistantMessageEvent.type === "toolcall_delta")
    .map((update) => update.assistantMessageEvent.delta)
    .join("");
  const end = updates.at(-1).assistantMessageEvent;
  assert.equal(end.type, "toolcall_end");
  assert.equal(end.toolCall.arguments.content, reassembled);

  const messageEnd = events.find((event) => event.type === "message_end");
  assert.equal(messageEnd.message.content[0].arguments.content, reassembled);
});

test("runPiSdkCase still accumulates assistant text from compacted text deltas", async () => {
  const { skill, caseDefinition } = simpleAlphaCase();
  const result = await runPiSdkCase({
    source,
    skill,
    caseDefinition,
    workspaceDir: process.cwd(),
    createSession: streamingSessionFactory((emit, messages) => {
      const partial = { role: "assistant", content: [{ type: "text", text: "" }] };
      for (const delta of ["hel", "lo"]) {
        partial.content[0].text += delta;
        emit({ type: "message_update", message: partial, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta, partial } });
      }
      messages.push(partial);
    }),
  });
  assert.equal(result.session.assistantText, "hello");
  assert.deepEqual(
    result.session.events.map((event) => event.assistantMessageEvent.delta),
    ["hel", "lo"],
  );
});

test("runPiSdkCase stops recording raw events past the capture budget and flags it", async () => {
  const { skill, caseDefinition } = simpleAlphaCase();
  const previous = process.env.ARC_SKILL_EVAL_MAX_RUNTIME_EVENT_BYTES;
  process.env.ARC_SKILL_EVAL_MAX_RUNTIME_EVENT_BYTES = "20000";
  try {
    const result = await runPiSdkCase({
      source,
      skill,
      caseDefinition,
      workspaceDir: process.cwd(),
      createSession: streamingSessionFactory((emit, messages) => {
        const partial = { role: "assistant", content: [{ type: "text", text: "" }] };
        for (let index = 0; index < 500; index += 1) {
          // tool_execution_update is not compacted, so it exercises the cap.
          emit({ type: "tool_execution_update", toolCallId: "c", toolName: "bash", args: {}, partialResult: "x".repeat(1_000) });
        }
        partial.content[0].text = "done";
        emit({ type: "message_update", message: partial, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "done", partial } });
        messages.push(partial);
      }),
    });

    assert.equal(result.session.eventsTruncated, true);
    assert.ok(JSON.stringify(result.session.events).length <= 20_000);
    assert.ok(result.session.events.length > 0);
    // Assistant text does not depend on the raw event buffer.
    assert.equal(result.session.assistantText, "done");
  } finally {
    if (previous === undefined) delete process.env.ARC_SKILL_EVAL_MAX_RUNTIME_EVENT_BYTES;
    else process.env.ARC_SKILL_EVAL_MAX_RUNTIME_EVENT_BYTES = previous;
  }
});
