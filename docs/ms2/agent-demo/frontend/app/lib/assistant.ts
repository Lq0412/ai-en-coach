export type ThreadStatus = "active" | "closed";
export type TaskRunStatus =
  | "pending"
  | "running"
  | "awaiting_confirmation"
  | "completed"
  | "failed";
export type ConfirmationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

// 这些 DTO 字段名与 XE3-ESL Go assistant scaffold 保持一致。
export interface AssistantThread {
  ID: string;
  UserID: string;
  Status: ThreadStatus;
  ContextSummary: string;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface TaskRun {
  ID: string;
  ThreadID: string;
  Intent: string;
  Status: TaskRunStatus;
  CurrentStep: string;
  Result: Record<string, unknown>;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface ToolCall {
  ID: string;
  TaskRunID: string;
  ToolName: string;
  Arguments: Record<string, unknown>;
  Result: Record<string, unknown>;
  IdempotencyKey: string;
  CreatedAt: string;
}

export interface ConfirmationRequest {
  ID: string;
  TaskRunID: string;
  Action: string;
  RiskLevel: string;
  Summary: string;
  Status: ConfirmationStatus;
  ExpiresAt: string;
}

export interface Plan {
  Intent: string;
  Steps: PlanStep[];
}

export interface PlanStep {
  ToolName: string;
  Arguments: Record<string, unknown>;
}

export interface ToolResult {
  Output: Record<string, unknown>;
}

export interface StartTaskCommand {
  ActorUserID: string;
  ThreadID: string;
  UserMessage: string;
  IdempotencyKey: string;
}

export interface ResumeTaskCommand {
  ActorUserID: string;
  TaskRunID: string;
}

export interface GetThreadQuery {
  ActorUserID: string;
  ThreadID: string;
}

export interface AssistantService {
  StartTask(command: StartTaskCommand): Promise<TaskRun>;
  ResumeTask(command: ResumeTaskCommand): Promise<TaskRun>;
  GetThread(query: GetThreadQuery): Promise<AssistantThread>;
}

export interface AssistantMessage {
  ID: string;
  Role: "user" | "assistant";
  Content: string;
  CreatedAt: string;
}

export interface DemoSnapshot {
  thread: AssistantThread;
  taskRuns: TaskRun[];
  plans: Record<string, Plan>;
  toolCalls: ToolCall[];
  confirmations: ConfirmationRequest[];
  messages: AssistantMessage[];
  activeQuestion?: string;
  completedQuestionCount: number;
}

interface ActionResponse {
  task_run: TaskRun;
  snapshot: DemoSnapshot;
}

const defaultBaseURL =
  process.env.NEXT_PUBLIC_AGENT_API_URL ?? "http://localhost:8080";

export class RemoteAssistantService implements AssistantService {
  private latestSnapshot?: DemoSnapshot;

  constructor(private readonly baseURL = defaultBaseURL) {}

  async StartTask(command: StartTaskCommand): Promise<TaskRun> {
    const response = await this.request<ActionResponse>(
      `/v1/assistant/threads/${command.ThreadID}/tasks`,
      {
        method: "POST",
        body: JSON.stringify({
          actor_user_id: command.ActorUserID,
          user_message: command.UserMessage,
          idempotency_key: command.IdempotencyKey,
        }),
      },
    );
    this.latestSnapshot = response.snapshot;
    return response.task_run;
  }

  async ResumeTask(command: ResumeTaskCommand): Promise<TaskRun> {
    const response = await this.request<ActionResponse>(
      `/v1/assistant/task-runs/${command.TaskRunID}/resume`,
      {
        method: "POST",
        body: JSON.stringify({ actor_user_id: command.ActorUserID }),
      },
    );
    this.latestSnapshot = response.snapshot;
    return response.task_run;
  }

  async RejectTask(actorUserID: string, taskRunID: string): Promise<TaskRun> {
    const response = await this.request<ActionResponse>(
      `/v1/assistant/task-runs/${taskRunID}/reject`,
      {
        method: "POST",
        body: JSON.stringify({ actor_user_id: actorUserID }),
      },
    );
    this.latestSnapshot = response.snapshot;
    return response.task_run;
  }

  async GetThread(query: GetThreadQuery): Promise<AssistantThread> {
    const snapshot = await this.LoadSnapshot(query);
    return snapshot.thread;
  }

  async LoadSnapshot(query: GetThreadQuery): Promise<DemoSnapshot> {
    const snapshot = await this.request<DemoSnapshot>(
      `/v1/assistant/threads/${query.ThreadID}?actor_user_id=${encodeURIComponent(
        query.ActorUserID,
      )}`,
    );
    this.latestSnapshot = snapshot;
    return snapshot;
  }

  async ResetDemo(): Promise<DemoSnapshot> {
    const snapshot = await this.request<DemoSnapshot>(
      "/v1/assistant/demo/reset",
      { method: "POST", body: "{}" },
    );
    this.latestSnapshot = snapshot;
    return snapshot;
  }

  async Transcribe(audio: Blob): Promise<string> {
    const form = new FormData();
    form.append("audio", audio, "answer.wav");
    const response = await this.request<{ text: string }>(
      "/v1/audio/transcriptions",
      { method: "POST", body: form },
    );
    return response.text;
  }

  async Synthesize(text: string, voice?: string): Promise<Blob> {
    const response = await fetch(`${this.baseURL}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...(voice ? { voice } : {}) }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Go assistant server returned ${response.status}`);
    }
    return response.blob();
  }

  Snapshot(): DemoSnapshot {
    if (!this.latestSnapshot) {
      throw new Error("Go assistant snapshot is not loaded");
    }
    return this.latestSnapshot;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const isFormData = init?.body instanceof FormData;
    const response = await fetch(`${this.baseURL}${path}`, {
      ...init,
      headers: isFormData
        ? init?.headers
        : { "Content-Type": "application/json", ...init?.headers },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Go assistant server returned ${response.status}`);
    }
    return response.json() as Promise<T>;
  }
}

export async function convertRecordingToWAV(recording: Blob): Promise<Blob> {
  const sourceContext = new AudioContext();
  try {
    const decoded = await sourceContext.decodeAudioData(
      await recording.arrayBuffer(),
    );
    const sampleRate = 16_000;
    const frameCount = Math.max(1, Math.ceil(decoded.duration * sampleRate));
    const offline = new OfflineAudioContext(1, frameCount, sampleRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWAV(rendered.getChannelData(0), sampleRate);
  } finally {
    await sourceContext.close();
  }
}

function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeASCII(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeASCII(view, 8, "WAVE");
  writeASCII(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeASCII(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(
      44 + index * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeASCII(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function emptySnapshot(): DemoSnapshot {
  const timestamp = new Date(0).toISOString();
  return {
    thread: {
      ID: "thread-demo-001",
      UserID: "demo-user",
      Status: "active",
      ContextSummary: "正在连接 Go assistant server…",
      CreatedAt: timestamp,
      UpdatedAt: timestamp,
    },
    taskRuns: [],
    plans: {},
    toolCalls: [],
    confirmations: [],
    messages: [],
    completedQuestionCount: 0,
  };
}
