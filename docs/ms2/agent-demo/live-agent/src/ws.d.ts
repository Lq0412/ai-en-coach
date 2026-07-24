declare module "ws" {
  export type RawData = Buffer | ArrayBuffer | Buffer[];

  export default class WebSocket {
    static readonly CONNECTING: number;
    static readonly OPEN: number;
    readonly readyState: number;

    constructor(
      address: string,
      options?: { headers?: Record<string, string> },
    );

    on(event: "open", listener: () => void): this;
    on(event: "message", listener: (data: RawData) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "close", listener: () => void): this;
    send(data: string): void;
    close(): void;
  }
}
