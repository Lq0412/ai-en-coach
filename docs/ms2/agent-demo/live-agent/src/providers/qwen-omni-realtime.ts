import { llm } from "@livekit/agents";
import { AudioFrame, AudioResampler } from "@livekit/rtc-node";
import { randomUUID } from "node:crypto";
import { ReadableStream, type ReadableStreamDefaultController } from "node:stream/web";
import WebSocket, { type RawData } from "ws";

export const QWEN_OMNI_REALTIME_MODEL = "qwen3.5-omni-flash-realtime";
const INPUT_SAMPLE_RATE = 16_000;
const OUTPUT_SAMPLE_RATE = 24_000;
const OUTPUT_FRAME_SAMPLES = 480;

type JSONValue = Record<string, unknown>;

export type QwenOmniCallbacks = {
  onInputPartial?: (transcript: string) => void | Promise<void>;
  onInputFinal?: (transcript: string) => void | Promise<void>;
  onAssistantDelta?: (delta: string) => void | Promise<void>;
  onAssistantAudioStarted?: () => void | Promise<void>;
  onAssistantDone?: (transcript: string) => void | Promise<void>;
};

export type QwenOmniRealtimeOptions = {
  apiKey: string;
  websocketURL?: string;
  voice?: string;
  instructions?: string;
  callbacks?: QwenOmniCallbacks;
};

type OutputItem = {
  id: string;
  transcript: string;
  textController: ReadableStreamDefaultController<string>;
  audioController: ReadableStreamDefaultController<AudioFrame>;
  textClosed: boolean;
  audioClosed: boolean;
  audioStarted: boolean;
  pendingAudio: Buffer;
};

type ResponseState = {
  id: string;
  messageController: ReadableStreamDefaultController<llm.MessageGeneration>;
  functionController: ReadableStreamDefaultController<llm.FunctionCall>;
  item?: OutputItem;
};

const normalizedRealtimeURL = (baseURL: string): string => {
  const url = new URL(baseURL);
  url.searchParams.set("model", QWEN_OMNI_REALTIME_MODEL);
  return url.toString();
};

export class QwenOmniRealtimeModel extends llm.RealtimeModel {
  readonly options: QwenOmniRealtimeOptions;
  #sessions = new Set<QwenOmniRealtimeSession>();

  constructor(options: QwenOmniRealtimeOptions) {
    if (!options.apiKey.trim()) throw new Error("DASHSCOPE_API_KEY is required");
    super({
      messageTruncation: false,
      turnDetection: true,
      userTranscription: true,
      autoToolReplyGeneration: false,
      audioOutput: true,
      manualFunctionCalls: false,
      midSessionChatCtxUpdate: false,
      midSessionInstructionsUpdate: true,
      midSessionToolsUpdate: false,
      perResponseToolChoice: false,
    });
    this.options = options;
  }

  override get model(): string {
    return QWEN_OMNI_REALTIME_MODEL;
  }

  override get provider(): string {
    return "dashscope";
  }

  override label(): string {
    return `dashscope.${QWEN_OMNI_REALTIME_MODEL}`;
  }

  override session(): llm.RealtimeSession {
    const session = new QwenOmniRealtimeSession(this, this.options, () => {
      this.#sessions.delete(session);
    });
    this.#sessions.add(session);
    return session;
  }

  override async close(): Promise<void> {
    await Promise.all([...this.#sessions].map((session) => session.close()));
    this.#sessions.clear();
  }
}

export class QwenOmniRealtimeSession extends llm.RealtimeSession {
  #options: QwenOmniRealtimeOptions;
  #socket: WebSocket;
  #chatCtx = llm.ChatContext.empty();
  #tools = llm.ToolContext.empty();
  #instructions: string;
  #resampler?: AudioResampler;
  #queuedMessages: string[] = [];
  #responses = new Map<string, ResponseState>();
  #manualGenerations: Array<{
    resolve: (event: llm.GenerationCreatedEvent) => void;
    reject: (error: Error) => void;
  }> = [];
  #closed = false;
  #onClosed: () => void;

  constructor(
    model: QwenOmniRealtimeModel,
    options: QwenOmniRealtimeOptions,
    onClosed: () => void,
  ) {
    super(model);
    this.#options = options;
    this.#instructions = options.instructions ?? "";
    this.#onClosed = onClosed;
    const endpoint = normalizedRealtimeURL(
      options.websocketURL ?? "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
    );
    this.#socket = new WebSocket(endpoint, {
      headers: { Authorization: `Bearer ${options.apiKey}` },
    });
    this.#socket.on("open", () => {
      this.#sendSessionUpdate();
      for (const message of this.#queuedMessages.splice(0)) this.#socket.send(message);
    });
    this.#socket.on("message", (data) => this.#handleMessage(data));
    this.#socket.on("error", (error) => this.#emitError(error, true));
    this.#socket.on("close", () => {
      if (!this.#closed) this.#emitError(new Error("DashScope realtime connection closed"), true);
      this.#rejectManualGenerations(new Error("DashScope realtime connection closed"));
    });
  }

  override get chatCtx(): llm.ChatContext {
    return this.#chatCtx;
  }

  override get tools(): llm.ToolContext {
    return this.#tools;
  }

  override async updateInstructions(instructions: string): Promise<void> {
    this.#instructions = instructions;
    this.#sendSessionUpdate();
  }

  override async updateChatCtx(chatCtx: llm.ChatContext): Promise<void> {
    this.#chatCtx = chatCtx.copy();
  }

  override async updateTools(tools: llm.ToolContext): Promise<void> {
    this.#tools = tools.copy();
  }

  override updateOptions(_options: { toolChoice?: llm.ToolChoice | null }): void {}

  override pushAudio(frame: AudioFrame): void {
    if (frame.channels !== 1) {
      this.#emitError(new Error(`Qwen Omni requires mono audio; received ${frame.channels} channels`), false);
      return;
    }
    const frames =
      frame.sampleRate === INPUT_SAMPLE_RATE
        ? [frame]
        : (this.#resampler ??= new AudioResampler(frame.sampleRate, INPUT_SAMPLE_RATE, 1)).push(frame);
    for (const output of frames) {
      const bytes = Buffer.from(output.data.buffer, output.data.byteOffset, output.data.byteLength);
      this.#send({
        event_id: randomUUID(),
        type: "input_audio_buffer.append",
        audio: bytes.toString("base64"),
      });
    }
  }

  override generateReply(
    instructions?: string,
    options?: { signal?: AbortSignal },
  ): Promise<llm.GenerationCreatedEvent> {
    return new Promise((resolve, reject) => {
      const pending = { resolve, reject };
      this.#manualGenerations.push(pending);
      const abort = () => {
        const index = this.#manualGenerations.indexOf(pending);
        if (index >= 0) this.#manualGenerations.splice(index, 1);
        reject(options?.signal?.reason ?? new Error("generation aborted"));
      };
      if (options?.signal?.aborted) return abort();
      options?.signal?.addEventListener("abort", abort, { once: true });
      this.#send({
        event_id: randomUUID(),
        type: "response.create",
        response: instructions ? { instructions } : {},
      });
    });
  }

  override async commitAudio(): Promise<void> {
    this.#send({ event_id: randomUUID(), type: "input_audio_buffer.commit" });
    this.#send({ event_id: randomUUID(), type: "response.create", response: {} });
  }

  override async clearAudio(): Promise<void> {
    this.#send({ event_id: randomUUID(), type: "input_audio_buffer.clear" });
  }

  override async interrupt(): Promise<void> {
    this.#send({ event_id: randomUUID(), type: "response.cancel" });
  }

  override async truncate(): Promise<void> {
    // Qwen Omni currently handles interruption server-side through interrupt_response.
  }

  override async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#resampler?.close();
    this.#rejectManualGenerations(new Error("Qwen Omni realtime session closed"));
    for (const response of this.#responses.values()) this.#closeResponse(response);
    this.#responses.clear();
    if (
      this.#socket.readyState === WebSocket.OPEN ||
      this.#socket.readyState === WebSocket.CONNECTING
    ) {
      this.#socket.close();
    }
    await super.close();
    this.#onClosed();
  }

  #sendSessionUpdate(): void {
    this.#send({
      event_id: randomUUID(),
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions: this.#instructions,
        voice: this.#options.voice ?? "Tina",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: { model: "qwen3-asr-flash-realtime" },
        turn_detection: {
          type: "semantic_vad",
          create_response: true,
          interrupt_response: true,
        },
      },
    });
  }

  #send(payload: JSONValue): void {
    const serialized = JSON.stringify(payload);
    if (this.#socket.readyState === WebSocket.OPEN) {
      this.#socket.send(serialized);
    } else if (this.#socket.readyState === WebSocket.CONNECTING) {
      this.#queuedMessages.push(serialized);
    } else {
      this.#emitError(new Error("DashScope realtime connection is not open"), true);
    }
  }

  #handleMessage(raw: RawData): void {
    let event: JSONValue;
    try {
      event = JSON.parse(raw.toString()) as JSONValue;
    } catch {
      this.#emitError(new Error("DashScope realtime returned invalid JSON"), false);
      return;
    }
    const type = String(event.type ?? "");
    if (type === "input_audio_buffer.speech_started") {
      this.emit("input_speech_started", {});
      return;
    }
    if (type === "input_audio_buffer.speech_stopped") {
      this.emit("input_speech_stopped", { userTranscriptionEnabled: true });
      return;
    }
    if (type === "conversation.item.input_audio_transcription.delta") {
      const transcript = `${String(event.text ?? "")}${String(event.stash ?? "")}`;
      void this.#options.callbacks?.onInputPartial?.(transcript);
      return;
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      const transcript = String(event.transcript ?? "").trim();
      this.emit("input_audio_transcription_completed", {
        itemId: String(event.item_id ?? randomUUID()),
        transcript,
        isFinal: true,
      } satisfies llm.InputTranscriptionCompleted);
      void this.#options.callbacks?.onInputFinal?.(transcript);
      return;
    }
    if (type === "response.created") {
      this.#createResponse(event);
      return;
    }
    if (type === "response.output_item.added") {
      this.#createOutputItem(event);
      return;
    }
    if (type === "response.audio_transcript.delta") {
      this.#appendTranscript(event);
      return;
    }
    if (type === "response.audio.delta") {
      this.#appendAudio(event);
      return;
    }
    if (type === "response.audio_transcript.done") {
      const response = this.#responseFor(event);
      if (response?.item) {
        response.item.transcript = String(event.transcript ?? response.item.transcript);
        this.#closeText(response.item);
      }
      return;
    }
    if (type === "response.audio.done") {
      const item = this.#responseFor(event)?.item;
      if (item) this.#closeAudio(item);
      return;
    }
    if (type === "response.done") {
      this.#finishResponse(event);
      return;
    }
    if (type === "error") {
      const detail = event.error as JSONValue | undefined;
      this.#emitError(
        new Error(String(detail?.message ?? event.message ?? "DashScope realtime error")),
        false,
      );
    }
  }

  #createResponse(event: JSONValue): void {
    const responsePayload = event.response as JSONValue | undefined;
    const responseID = String(responsePayload?.id ?? event.response_id ?? randomUUID());
    let messageController!: ReadableStreamDefaultController<llm.MessageGeneration>;
    let functionController!: ReadableStreamDefaultController<llm.FunctionCall>;
    const generation: llm.GenerationCreatedEvent = {
      responseId: responseID,
      messageStream: new ReadableStream<llm.MessageGeneration>({
        start: (controller) => {
          messageController = controller;
        },
      }),
      functionStream: new ReadableStream<llm.FunctionCall>({
        start: (controller) => {
          functionController = controller;
        },
      }),
      userInitiated: false,
    };
    this.#responses.set(responseID, {
      id: responseID,
      messageController,
      functionController,
    });
    const pending = this.#manualGenerations.shift();
    if (pending) {
      generation.userInitiated = true;
      pending.resolve(generation);
    } else {
      this.emit("generation_created", generation);
    }
  }

  #createOutputItem(event: JSONValue): void {
    const response = this.#responseFor(event);
    if (!response || response.item) return;
    const payload = event.item as JSONValue | undefined;
    let textController!: ReadableStreamDefaultController<string>;
    let audioController!: ReadableStreamDefaultController<AudioFrame>;
    const item: OutputItem = {
      id: String(payload?.id ?? event.item_id ?? randomUUID()),
      transcript: "",
      textController: undefined as never,
      audioController: undefined as never,
      textClosed: false,
      audioClosed: false,
      audioStarted: false,
      pendingAudio: Buffer.alloc(0),
    };
    const generation: llm.MessageGeneration = {
      messageId: item.id,
      textStream: new ReadableStream<string>({
        start: (controller) => {
          textController = controller;
        },
      }),
      audioStream: new ReadableStream<AudioFrame>({
        start: (controller) => {
          audioController = controller;
        },
      }),
      modalities: Promise.resolve(["text", "audio"]),
    };
    item.textController = textController;
    item.audioController = audioController;
    response.item = item;
    response.messageController.enqueue(generation);
  }

  #appendTranscript(event: JSONValue): void {
    const item = this.#responseFor(event)?.item;
    if (!item || item.textClosed) return;
    const delta = String(event.delta ?? "");
    if (!delta) return;
    item.transcript += delta;
    item.textController.enqueue(delta);
    void this.#options.callbacks?.onAssistantDelta?.(delta);
  }

  #appendAudio(event: JSONValue): void {
    const item = this.#responseFor(event)?.item;
    if (!item || item.audioClosed) return;
    const delta = String(event.delta ?? "");
    if (!delta) return;
    if (!item.audioStarted) {
      item.audioStarted = true;
      void this.#options.callbacks?.onAssistantAudioStarted?.();
    }
    item.pendingAudio = Buffer.concat([item.pendingAudio, Buffer.from(delta, "base64")]);
    const frameBytes = OUTPUT_FRAME_SAMPLES * Int16Array.BYTES_PER_ELEMENT;
    while (item.pendingAudio.byteLength >= frameBytes) {
      const bytes = item.pendingAudio.subarray(0, frameBytes);
      item.pendingAudio = item.pendingAudio.subarray(frameBytes);
      const samples = new Int16Array(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
      item.audioController.enqueue(
        new AudioFrame(samples, OUTPUT_SAMPLE_RATE, 1, samples.length),
      );
    }
  }

  #finishResponse(event: JSONValue): void {
    const response = this.#responseFor(event);
    if (!response) return;
    if (response.item) {
      this.#closeText(response.item);
      this.#closeAudio(response.item);
      void this.#options.callbacks?.onAssistantDone?.(response.item.transcript.trim());
    }
    this.#closeResponse(response);
    this.#responses.delete(response.id);
  }

  #responseFor(event: JSONValue): ResponseState | undefined {
    const responsePayload = event.response as JSONValue | undefined;
    const responseID = String(event.response_id ?? responsePayload?.id ?? "");
    if (responseID) return this.#responses.get(responseID);
    return [...this.#responses.values()].at(-1);
  }

  #closeText(item: OutputItem): void {
    if (item.textClosed) return;
    item.textClosed = true;
    item.textController.close();
  }

  #closeAudio(item: OutputItem): void {
    if (item.audioClosed) return;
    if (item.pendingAudio.byteLength >= 2) {
      const evenLength = item.pendingAudio.byteLength - (item.pendingAudio.byteLength % 2);
      const bytes = item.pendingAudio.subarray(0, evenLength);
      const samples = new Int16Array(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
      item.audioController.enqueue(
        new AudioFrame(samples, OUTPUT_SAMPLE_RATE, 1, samples.length),
      );
    }
    item.pendingAudio = Buffer.alloc(0);
    item.audioClosed = true;
    item.audioController.close();
  }

  #closeResponse(response: ResponseState): void {
    if (response.item) {
      this.#closeText(response.item);
      this.#closeAudio(response.item);
    }
    try {
      response.messageController.close();
      response.functionController.close();
    } catch {
      // Streams may already have been closed by a terminal server event.
    }
  }

  #emitError(error: Error, recoverable: boolean): void {
    this.emit("error", {
      type: "realtime_model_error",
      timestamp: Date.now(),
      label: this.realtimeModel.label(),
      error,
      recoverable,
    } satisfies llm.RealtimeModelError);
  }

  #rejectManualGenerations(error: Error): void {
    for (const pending of this.#manualGenerations.splice(0)) pending.reject(error);
  }
}
