import { randomUUID } from "node:crypto";

export type SessionContextOptions = {
  actorUserID: string;
  threadID: string;
  liveSessionID: string;
};

export type TurnContext = SessionContextOptions & {
  turnID: string;
  clientMessageID: string;
  transcript: string;
};

export type SessionEvent = {
  type: string;
  mode: "live";
  thread_id: string;
  live_session_id: string;
  turn_id: string;
  client_message_id: string;
  sequence: number;
  occurred_at: string;
  payload: Record<string, unknown>;
};

export class SessionContext {
  readonly actorUserID: string;
  readonly threadID: string;
  readonly liveSessionID: string;

  #sequence = 0;
  #currentTurn: TurnContext | undefined;
  #latestTurn: TurnContext | undefined;
  #finalizedTurns: TurnContext[] = [];
  #speechTurns: TurnContext[] = [];
  #speech: AbortController | undefined;
  #state = "listening";

  constructor(options: SessionContextOptions) {
    this.actorUserID = options.actorUserID;
    this.threadID = options.threadID;
    this.liveSessionID = options.liveSessionID;
  }

  beginTurn(ids: { turnID?: string; clientMessageID?: string } = {}): TurnContext {
    this.#currentTurn = {
      actorUserID: this.actorUserID,
      threadID: this.threadID,
      liveSessionID: this.liveSessionID,
      turnID: ids.turnID ?? randomUUID(),
      clientMessageID: ids.clientMessageID ?? randomUUID(),
      transcript: "",
    };
    this.#latestTurn = this.#currentTurn;
    return this.#currentTurn;
  }

  get currentTurn(): TurnContext | undefined {
    return this.#currentTurn;
  }

  get latestTurn(): TurnContext | undefined {
    return this.#latestTurn;
  }

  requireTurn(): TurnContext {
    return this.#currentTurn ?? this.beginTurn();
  }

  finalizeTranscript(transcript: string): TurnContext {
    const normalized = transcript.trim();
    if (normalized.length === 0) {
      throw new Error("final transcript must not be empty");
    }
    const turn = this.requireTurn();
    turn.transcript = normalized;
    this.#finalizedTurns.push(turn);
    this.#currentTurn = undefined;
    return turn;
  }

  takeFinalizedTurn(): TurnContext | undefined {
    return this.#finalizedTurns.shift();
  }

  completeTurn(turnID: string): void {
    if (this.#currentTurn?.turnID === turnID) {
      this.#currentTurn = undefined;
    }
  }

  queueSpeechTurn(turn: TurnContext): void {
    if (!this.#speechTurns.some((queued) => queued.turnID === turn.turnID)) {
      this.#speechTurns.push(turn);
    }
  }

  claimSpeechTurn(): TurnContext | undefined {
    return this.#speechTurns.shift();
  }

  event(turn: TurnContext, type: string, payload: Record<string, unknown>): SessionEvent {
    this.#sequence += 1;
    return {
      type,
      mode: "live",
      thread_id: this.threadID,
      live_session_id: this.liveSessionID,
      turn_id: turn.turnID,
      client_message_id: turn.clientMessageID,
      sequence: this.#sequence,
      occurred_at: new Date().toISOString(),
      payload,
    };
  }

  latencyEvent(turn: TurnContext, stage: string): SessionEvent {
    const event = this.event(turn, "latency.point", {});
    event.payload.latency = {
      thread_id: turn.threadID,
      live_session_id: turn.liveSessionID,
      turn_id: turn.turnID,
      client_message_id: turn.clientMessageID,
      mode: "live",
      stage,
      source: "worker",
      occurred_at: event.occurred_at,
      sequence: event.sequence,
    };
    return event;
  }

  startSpeech(): AbortController {
    this.#speech?.abort(new Error("speech superseded"));
    this.#speech = new AbortController();
    this.#state = "speaking";
    return this.#speech;
  }

  interruptSpeech(): boolean {
    if (!this.#speech || this.#speech.signal.aborted) return false;
    this.#speech.abort(new Error("speech interrupted"));
    this.#state = "interrupted";
    return true;
  }

  recoverFalseInterruption(): string {
    this.#state = "listening";
    return this.#state;
  }
}
