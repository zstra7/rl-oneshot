import { describe, expect, it } from "vitest";

import { EventDispatcher } from "@/core/EventDispatcher";
import type { TypedEventMap } from "@/core/EventTypes";

describe("EventDispatcher", () => {
  it("calls subscribed listeners with the emitted payload", () => {
    const dispatcher = new EventDispatcher<TypedEventMap>();
    let received: TypedEventMap["runtime:fixed-tick"] | null = null;

    dispatcher.on("runtime:fixed-tick", (event) => {
      received = event;
    });

    dispatcher.emit("runtime:fixed-tick", { tick: 42, fixedDeltaSeconds: 1 / 120 });

    expect(received).toEqual({ tick: 42, fixedDeltaSeconds: 1 / 120 });
  });

  it("unsubscribe() stops further delivery and decrements the listener count", () => {
    const dispatcher = new EventDispatcher<TypedEventMap>();
    let callCount = 0;

    const unsubscribe = dispatcher.on("runtime:fixed-tick", () => {
      callCount += 1;
    });

    expect(dispatcher.listenerCount("runtime:fixed-tick")).toBe(1);

    dispatcher.emit("runtime:fixed-tick", { tick: 0, fixedDeltaSeconds: 0 });
    unsubscribe();
    dispatcher.emit("runtime:fixed-tick", { tick: 1, fixedDeltaSeconds: 0 });

    expect(callCount).toBe(1);
    expect(dispatcher.listenerCount("runtime:fixed-tick")).toBe(0);
  });

  it("dispose() clears all listeners across all event types", () => {
    const dispatcher = new EventDispatcher<TypedEventMap>();

    dispatcher.on("runtime:fixed-tick", () => {});
    dispatcher.on("runtime:app-state-changed", () => {});

    dispatcher.dispose();

    expect(dispatcher.getSubscriptionCounts()).toEqual({});
  });

  it("getSubscriptionCounts() reports counts per event type for leak tests", () => {
    const dispatcher = new EventDispatcher<TypedEventMap>();

    dispatcher.on("runtime:fixed-tick", () => {});
    dispatcher.on("runtime:fixed-tick", () => {});
    dispatcher.on("runtime:app-state-changed", () => {});

    expect(dispatcher.getSubscriptionCounts()).toEqual({
      "runtime:fixed-tick": 2,
      "runtime:app-state-changed": 1
    });
  });
});
