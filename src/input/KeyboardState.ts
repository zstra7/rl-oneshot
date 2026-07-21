export type KeyboardPressListener = (code: string, timestampMs: number) => void;
export type KeyboardReleaseListener = (code: string, timestampMs: number) => void;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

/**
 * Raw keyboard state (input spec section 22). Suppresses browser defaults
 * for gameplay-relevant keys only while `shouldSuppressDefaults()` returns
 * true and the event target is not an editable field (spec section 7.3).
 */
export class KeyboardState {
  private readonly held = new Set<string>();
  private readonly onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
  private readonly onKeyUp = (event: KeyboardEvent) => this.handleKeyUp(event);

  private pressListeners: KeyboardPressListener[] = [];
  private releaseListeners: KeyboardReleaseListener[] = [];

  public constructor(private readonly shouldSuppressDefaults: () => boolean) {}

  public attach(target: Window = window): void {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
  }

  public detach(target: Window = window): void {
    target.removeEventListener("keydown", this.onKeyDown);
    target.removeEventListener("keyup", this.onKeyUp);
  }

  public onPress(listener: KeyboardPressListener): void {
    this.pressListeners.push(listener);
  }

  public onRelease(listener: KeyboardReleaseListener): void {
    this.releaseListeners.push(listener);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat) {
      return;
    }

    if (this.shouldSuppressDefaults() && !isEditableTarget(event.target)) {
      const suppressedCodes = new Set([
        "Space",
        "Tab",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight"
      ]);
      if (suppressedCodes.has(event.code)) {
        event.preventDefault();
      }
    }

    this.press(event.code, event.timeStamp);
  }

  private handleKeyUp(event: KeyboardEvent): void {
    this.release(event.code, event.timeStamp);
  }

  public press(code: string, timestampMs: number): void {
    if (this.held.has(code)) {
      return;
    }
    this.held.add(code);
    for (const listener of this.pressListeners) {
      listener(code, timestampMs);
    }
  }

  public release(code: string, timestampMs: number): void {
    if (!this.held.has(code)) {
      return;
    }
    this.held.delete(code);
    for (const listener of this.releaseListeners) {
      listener(code, timestampMs);
    }
  }

  public isPressed(code: string): boolean {
    return this.held.has(code);
  }

  public getHeldCodes(): string[] {
    return [...this.held];
  }

  /** Focus-loss safety (input spec section 37): clear all held keys. */
  public clear(): void {
    this.held.clear();
  }
}
