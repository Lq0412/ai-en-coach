export const LIVE_BRIDGE_SOURCE = "speakup-agent-bridge";
export const LIVE_HOST_SOURCE = "speakup-livekit-host";
export const LIVE_BRIDGE_VERSION = 1;
export const MAX_BRIDGE_BYTES = 16_384;

export type LiveCallState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "reconnecting"
  | "failed";

export type LiveStatus = {
  state: LiveCallState;
  muted: boolean;
  live_session_id?: string;
  error?: string;
};

export type LiveSessionCredentials = {
  server_url: string;
  participant_token: string;
  live_session: { live_session_id: string; [key: string]: unknown };
};

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (
  value: RecordValue,
  required: string[],
  optional: string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key));
};

const boundedString = (value: unknown, max = 256): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

const isSerializedWithinLimit = (value: unknown): boolean => {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_BRIDGE_BYTES;
  } catch {
    return false;
  }
};

const LIVE_STATES = new Set<LiveCallState>([
  "idle",
  "connecting",
  "listening",
  "thinking",
  "speaking",
  "reconnecting",
  "failed",
]);

const LIVE_EVENT_TYPES = new Set([
  "transcript.partial",
  "turn.user_committed",
  "turn.assistant_committed",
  "turn.failed",
  "attachment.linked",
  "latency.point",
]);

export function isLiveEvent(value: unknown): value is RecordValue {
  if (!isRecord(value) || !isSerializedWithinLimit(value)) return false;
  if (!LIVE_EVENT_TYPES.has(String(value.type)) || value.mode !== "live") return false;
  if (
    !boundedString(value.thread_id) ||
    !boundedString(value.live_session_id) ||
    !boundedString(value.turn_id) ||
    !boundedString(value.client_message_id) ||
    !boundedString(value.occurred_at) ||
    !Number.isInteger(value.sequence) ||
    Number(value.sequence) < 1
  ) return false;
  if (value.type === "transcript.partial") {
    return boundedString(value.transcript, 4_000);
  }
  if (value.type === "turn.failed") {
    return boundedString(value.error, 500);
  }
  if (["turn.user_committed", "turn.assistant_committed", "attachment.linked"].includes(String(value.type))) {
    return isRecord(value.message) &&
      boundedString(value.message.ID) &&
      value.message.client_message_id === value.client_message_id;
  }
  return true;
}

export function decodeLiveDataEvent(data: Uint8Array): RecordValue | null {
  if (data.byteLength === 0 || data.byteLength > MAX_BRIDGE_BYTES) return null;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(data)) as unknown;
    if (!isRecord(decoded)) return null;
    const payload = isRecord(decoded.payload) ? decoded.payload : {};
    const normalized = { ...decoded, ...payload };
    delete normalized.payload;
    return isLiveEvent(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

function validIntentPayload(type: string, payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  if (type === "live.intent.start") {
    return hasExactKeys(payload, ["actor_user_id", "thread_id"]) &&
      boundedString(payload.actor_user_id) &&
      boundedString(payload.thread_id);
  }
  if (["live.intent.resume", "live.intent.end"].includes(type)) {
    return hasExactKeys(payload, ["actor_user_id", "live_session_id"]) &&
      boundedString(payload.actor_user_id) &&
      boundedString(payload.live_session_id);
  }
  if (type === "live.intent.mute") {
    return hasExactKeys(payload, ["muted"]) && typeof payload.muted === "boolean";
  }
  return type === "live.intent.recover" && hasExactKeys(payload, []);
}

export function isIframeBridgeMessage(value: unknown): boolean {
  if (!isRecord(value) || !isSerializedWithinLimit(value)) return false;
  if (
    !hasExactKeys(value, ["source", "version", "type", "payload"]) ||
    value.source !== LIVE_BRIDGE_SOURCE ||
    value.version !== LIVE_BRIDGE_VERSION ||
    typeof value.type !== "string"
  ) return false;
  return validIntentPayload(value.type, value.payload);
}

export function isHostBridgeMessage(value: unknown): boolean {
  if (!isRecord(value) || !isSerializedWithinLimit(value)) return false;
  if (
    !hasExactKeys(value, ["source", "version", "type", "payload"]) ||
    value.source !== LIVE_HOST_SOURCE ||
    value.version !== LIVE_BRIDGE_VERSION
  ) return false;
  if (value.type === "live.event") return isLiveEvent(value.payload);
  if (value.type !== "live.status" || !isRecord(value.payload)) return false;
  return hasExactKeys(
    value.payload,
    ["state", "muted"],
    ["live_session_id", "error"],
  ) &&
    LIVE_STATES.has(value.payload.state as LiveCallState) &&
    typeof value.payload.muted === "boolean" &&
    (value.payload.live_session_id === undefined ||
      boundedString(value.payload.live_session_id)) &&
    (value.payload.error === undefined ||
      boundedString(value.payload.error, 500));
}

export function isTrustedMessageEvent(
  event: { source: unknown; origin: string; data: unknown },
  expectedSource: unknown,
  expectedOrigin: string,
  validate: (value: unknown) => boolean,
): boolean {
  return event.source === expectedSource &&
    event.origin === expectedOrigin &&
    validate(event.data);
}

export type LiveSessionAPI = {
  start(input: { actor_user_id: string; thread_id: string }): Promise<LiveSessionCredentials>;
  resume(liveSessionID: string, actorUserID: string): Promise<LiveSessionCredentials>;
  end(liveSessionID: string, actorUserID: string): Promise<void>;
};

export type LiveRoomPort = {
  connect(credentials: LiveSessionCredentials): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  disconnect(): Promise<void>;
};

export function parseLiveSessionCredentials(value: unknown): LiveSessionCredentials {
  if (!isRecord(value) || !hasExactKeys(
    value,
    ["server_url", "participant_token", "live_session"],
    ["issued_at", "expires_at"],
  )) throw new Error("LiveKit 凭证响应格式无效");
  if (
    !boundedString(value.server_url, 2_048) ||
    !boundedString(value.participant_token, 8_192) ||
    !isRecord(value.live_session) ||
    !boundedString(value.live_session.live_session_id)
  ) throw new Error("LiveKit 凭证响应缺少必要字段");
  return value as LiveSessionCredentials;
}

export function createLiveSessionAPI(
  baseURL: string,
  request: typeof fetch = fetch,
): LiveSessionAPI {
  const root = baseURL.replace(/\/$/, "");
  const json = async (path: string, body: RecordValue) => {
    const response = await request(`${root}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      let message = `实时通话请求失败（${response.status}）`;
      try {
        const payload = await response.json() as RecordValue;
        if (typeof payload.error === "string") message = payload.error;
      } catch {}
      throw new Error(message);
    }
    return response.json() as Promise<unknown>;
  };
  return {
    start: async ({ actor_user_id, thread_id }) =>
      parseLiveSessionCredentials(await json(
        `/v1/assistant/threads/${encodeURIComponent(thread_id)}/live-sessions`,
        { actor_user_id, idempotency_key: crypto.randomUUID() },
      )),
    resume: async (liveSessionID, actorUserID) =>
      parseLiveSessionCredentials(await json(
        `/v1/assistant/live-sessions/${encodeURIComponent(liveSessionID)}/resume`,
        { actor_user_id: actorUserID },
      )),
    end: async (liveSessionID, actorUserID) => {
      await json(
        `/v1/assistant/live-sessions/${encodeURIComponent(liveSessionID)}/end`,
        { actor_user_id: actorUserID },
      );
    },
  };
}

type LiveCallFlowOptions = {
  api: LiveSessionAPI;
  createRoom: () => LiveRoomPort;
  onStatus: (status: LiveStatus) => void;
};

export class LiveCallFlow {
  #api: LiveSessionAPI;
  #createRoom: () => LiveRoomPort;
  #onStatus: (status: LiveStatus) => void;
  #room: LiveRoomPort | null = null;
  #actorUserID = "";
  #liveSessionID = "";
  #muted = false;
  #state: LiveCallState = "idle";

  constructor(options: LiveCallFlowOptions) {
    this.#api = options.api;
    this.#createRoom = options.createRoom;
    this.#onStatus = options.onStatus;
  }

  get liveSessionID(): string {
    return this.#liveSessionID;
  }

  get muted(): boolean {
    return this.#muted;
  }

  async start(input: { actor_user_id: string; thread_id: string }): Promise<void> {
    this.#actorUserID = input.actor_user_id;
    this.#emit("connecting");
    try {
      const credentials = await this.#api.start(input);
      this.#liveSessionID = credentials.live_session.live_session_id;
      await this.#connect(credentials);
    } catch (error) {
      await this.#cleanupRoom().catch(() => undefined);
      if (this.#liveSessionID && this.#actorUserID) {
        await this.#api.end(this.#liveSessionID, this.#actorUserID).catch(() => undefined);
      }
      this.#liveSessionID = "";
      const message = error instanceof DOMException && error.name === "NotAllowedError"
        ? "麦克风权限被拒绝，可返回普通模式或重新授权"
        : error instanceof Error ? error.message : "实时通话连接失败";
      this.#emit("failed", message);
      throw new Error(message);
    }
  }

  async resume(): Promise<void> {
    if (!this.#liveSessionID || !this.#actorUserID) {
      throw new Error("没有可恢复的实时通话");
    }
    this.#emit("connecting");
    await this.#cleanupRoom().catch(() => undefined);
    try {
      const credentials = await this.#api.resume(
        this.#liveSessionID,
        this.#actorUserID,
      );
      await this.#connect(credentials);
    } catch (error) {
      await this.#cleanupRoom().catch(() => undefined);
      const message = error instanceof Error ? error.message : "实时通话恢复失败";
      this.#emit("failed", message);
      throw error;
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    if (this.#room) await this.#room.setMicrophoneEnabled(!muted);
    this.#muted = muted;
    this.#emit(this.#state);
  }

  async end(): Promise<void> {
    const liveSessionID = this.#liveSessionID;
    const actorUserID = this.#actorUserID;
    let failure: unknown;
    try {
      await this.#cleanupRoom();
    } catch (error) {
      failure = error;
    }
    if (liveSessionID && actorUserID) {
      try {
        await this.#api.end(liveSessionID, actorUserID);
      } catch (error) {
        failure ??= error;
      }
    }
    try {
      this.#liveSessionID = "";
      this.#muted = false;
      this.#emit("idle");
    } finally {
      if (failure) throw failure;
    }
  }

  notifyState(state: LiveCallState, error?: string): void {
    this.#emit(state, error);
  }

  async #connect(credentials: LiveSessionCredentials): Promise<void> {
    const room = this.#createRoom();
    this.#room = room;
    await room.connect(credentials);
    await room.setMicrophoneEnabled(!this.#muted);
    this.#emit("listening");
  }

  async #cleanupRoom(): Promise<void> {
    const room = this.#room;
    this.#room = null;
    if (!room) return;
    try {
      await room.setMicrophoneEnabled(false);
    } catch {
      // Permission denial can also reject a disable call. Disconnect remains mandatory.
    }
    await room.disconnect();
  }

  #emit(state: LiveCallState, error?: string): void {
    this.#state = state;
    this.#onStatus({
      state,
      muted: this.#muted,
      ...(this.#liveSessionID ? { live_session_id: this.#liveSessionID } : {}),
      ...(error ? { error } : {}),
    });
  }
}
