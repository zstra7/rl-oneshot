import type { EventDispatcher } from "@/core/EventDispatcher";
import type { RuntimeErrorRecord } from "@/core/EventTypes";
import type { TypedEventMap } from "@/core/EventTypes";

const MAX_RECORDS = 50;

export interface ErrorReporter {
  reportVueError(error: unknown, info: string): void;
  reportRuntimeError(error: unknown, fatal: boolean): void;
  getRecentErrors(): readonly RuntimeErrorRecord[];
}

export class DefaultErrorReporter implements ErrorReporter {
  private readonly records: RuntimeErrorRecord[] = [];

  public constructor(
    private readonly dispatcher?: EventDispatcher<TypedEventMap>
  ) {}

  public reportVueError(error: unknown, info: string): void {
    this.record(error, false, `vue:${info}`);
  }

  public reportRuntimeError(error: unknown, fatal: boolean): void {
    this.record(error, fatal);
  }

  public getRecentErrors(): readonly RuntimeErrorRecord[] {
    return [...this.records];
  }

  private record(error: unknown, fatal: boolean, context?: string): void {
    const stack = error instanceof Error ? error.stack : undefined;

    const record: RuntimeErrorRecord = {
      message: error instanceof Error ? error.message : String(error),
      timestampMs: Date.now(),
      fatal,
      ...(stack !== undefined ? { stack } : {})
    };

    this.records.push(record);

    if (this.records.length > MAX_RECORDS) {
      this.records.shift();
    }

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error("[runtime-error]", context ?? "", error);
    }

    this.dispatcher?.emit("runtime:error", { record });
  }
}
