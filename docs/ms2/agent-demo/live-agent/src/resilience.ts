export type TimeoutScheduler = {
  setTimeout: (callback: () => void, delayMS: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const systemScheduler: TimeoutScheduler = {
  setTimeout: (callback, delayMS) => setTimeout(callback, delayMS),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createDeadline(
  parent: AbortSignal | undefined,
  timeoutMS: number,
  label: string,
  scheduler: TimeoutScheduler | undefined = systemScheduler,
): { signal: AbortSignal; cleanup: () => void } {
  const activeScheduler = scheduler ?? systemScheduler;
  const controller = new AbortController();
  const onParentAbort = () =>
    controller.abort(parent?.reason ?? new Error(`${label} aborted`));
  if (parent?.aborted) onParentAbort();
  else parent?.addEventListener("abort", onParentAbort, { once: true });
  const handle = activeScheduler.setTimeout(() => {
    controller.abort(new Error(`${label} timed out after ${timeoutMS}ms`));
  }, timeoutMS);
  return {
    signal: controller.signal,
    cleanup: () => {
      activeScheduler.clearTimeout(handle);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

export function createIdleDeadline(
  parent: AbortSignal | undefined,
  timeoutMS: number,
  label: string,
  scheduler: TimeoutScheduler | undefined = systemScheduler,
): { signal: AbortSignal; touch: () => void; cleanup: () => void } {
  const activeScheduler = scheduler ?? systemScheduler;
  const controller = new AbortController();
  let handle: unknown;
  const arm = () => {
    if (handle !== undefined) activeScheduler.clearTimeout(handle);
    handle = activeScheduler.setTimeout(() => {
      controller.abort(new Error(`${label} idle for ${timeoutMS}ms`));
    }, timeoutMS);
  };
  const onParentAbort = () =>
    controller.abort(parent?.reason ?? new Error(`${label} aborted`));
  if (parent?.aborted) onParentAbort();
  else parent?.addEventListener("abort", onParentAbort, { once: true });
  arm();
  return {
    signal: controller.signal,
    touch: () => {
      if (!controller.signal.aborted) arm();
    },
    cleanup: () => {
      if (handle !== undefined) activeScheduler.clearTimeout(handle);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

export function configuredTimeoutMS(
  value: string | undefined,
  fallback = 30_000,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 120_000
    ? Math.trunc(parsed)
    : fallback;
}

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 500);
}
