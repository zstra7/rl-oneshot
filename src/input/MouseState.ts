export type MousePressListener = (button: number, timestampMs: number) => void;
export type MouseReleaseListener = (button: number, timestampMs: number) => void;

/** Raw mouse button/position state (input spec section 23). */
export class MouseState {
  private readonly held = new Set<number>();
  private position = { x: 0, y: 0 };
  private moved = false;

  private readonly onMouseDown = (event: MouseEvent) => this.handleMouseDown(event);
  private readonly onMouseUp = (event: MouseEvent) => this.handleMouseUp(event);
  private readonly onMouseMove = (event: MouseEvent) => this.handleMouseMove(event);
  private readonly onContextMenu = (event: MouseEvent) => this.handleContextMenu(event);

  private pressListeners: MousePressListener[] = [];
  private releaseListeners: MouseReleaseListener[] = [];

  public constructor(
    private readonly target: HTMLElement,
    private readonly shouldSuppressDefaults: () => boolean
  ) {}

  public attach(): void {
    this.target.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    this.target.addEventListener("contextmenu", this.onContextMenu);
  }

  public detach(): void {
    this.target.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    this.target.removeEventListener("contextmenu", this.onContextMenu);
  }

  public onPress(listener: MousePressListener): void {
    this.pressListeners.push(listener);
  }

  public onRelease(listener: MouseReleaseListener): void {
    this.releaseListeners.push(listener);
  }

  private handleMouseDown(event: MouseEvent): void {
    if (this.shouldSuppressDefaults() && event.button === 1) {
      // Prevent middle-button autoscroll while gameplay owns the surface.
      event.preventDefault();
    }
    this.press(event.button, event.timeStamp);
  }

  private handleMouseUp(event: MouseEvent): void {
    this.release(event.button, event.timeStamp);
  }

  private handleMouseMove(event: MouseEvent): void {
    this.position = { x: event.clientX, y: event.clientY };
    this.moved = true;
  }

  private handleContextMenu(event: MouseEvent): void {
    if (this.shouldSuppressDefaults()) {
      event.preventDefault();
    }
  }

  public press(button: number, timestampMs: number): void {
    if (this.held.has(button)) {
      return;
    }
    this.held.add(button);
    for (const listener of this.pressListeners) {
      listener(button, timestampMs);
    }
  }

  public release(button: number, timestampMs: number): void {
    if (!this.held.has(button)) {
      return;
    }
    this.held.delete(button);
    for (const listener of this.releaseListeners) {
      listener(button, timestampMs);
    }
  }

  public isPressed(button: number): boolean {
    return this.held.has(button);
  }

  public getHeldButtons(): number[] {
    return [...this.held];
  }

  public getPosition(): { x: number; y: number } {
    return this.position;
  }

  public consumeMoved(): boolean {
    const wasMoved = this.moved;
    this.moved = false;
    return wasMoved;
  }

  /** Focus-loss safety (input spec section 37): clear all held buttons. */
  public clear(): void {
    this.held.clear();
  }
}
