import type { RenderFrameContext, RenderFrameModule } from "@/core/GameModule";

/**
 * Owns the ordered list of RenderFrameModule consumers called once per RAF
 * frame, after the fixed-step coordinator has advanced. Camera/VFX/HUD
 * modules register here as their phases land (core architecture spec
 * section 26); Phase 1 only registers the placeholder scene renderer.
 */
export class FrameCoordinator {
  private readonly renderFrameModules: RenderFrameModule[] = [];

  public register(module: RenderFrameModule): void {
    this.renderFrameModules.push(module);
  }

  public unregister(module: RenderFrameModule): void {
    const index = this.renderFrameModules.indexOf(module);

    if (index !== -1) {
      this.renderFrameModules.splice(index, 1);
    }
  }

  public updateFrame(context: RenderFrameContext): void {
    for (const module of this.renderFrameModules) {
      module.updateRenderFrame(context);
    }
  }

  public clear(): void {
    this.renderFrameModules.length = 0;
  }
}
