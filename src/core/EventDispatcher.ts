export type Unsubscribe = () => void;

export interface TypedEventDispatcher<Events extends object> {
  on<K extends keyof Events>(
    type: K,
    listener: (event: Events[K]) => void
  ): Unsubscribe;

  emit<K extends keyof Events>(type: K, event: Events[K]): void;
}

type AnyListener = (event: unknown) => void;

export class EventDispatcher<Events extends object>
  implements TypedEventDispatcher<Events>
{
  private readonly listenersByType = new Map<keyof Events, Set<AnyListener>>();

  public on<K extends keyof Events>(
    type: K,
    listener: (event: Events[K]) => void
  ): Unsubscribe {
    let listeners = this.listenersByType.get(type);

    if (!listeners) {
      listeners = new Set();
      this.listenersByType.set(type, listeners);
    }

    const anyListener = listener as AnyListener;
    listeners.add(anyListener);

    return () => {
      listeners.delete(anyListener);
    };
  }

  public emit<K extends keyof Events>(type: K, event: Events[K]): void {
    const listeners = this.listenersByType.get(type);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  }

  public listenerCount(type: keyof Events): number {
    return this.listenersByType.get(type)?.size ?? 0;
  }

  public getSubscriptionCounts(): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const [type, listeners] of this.listenersByType) {
      counts[String(type)] = listeners.size;
    }

    return counts;
  }

  public dispose(): void {
    this.listenersByType.clear();
  }
}
