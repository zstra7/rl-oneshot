import * as THREE from "three";

import { assertThreeRevision } from "@/core/BuildInfo";
import type {
  GameModule,
  RenderFrameContext,
  RenderFrameModule
} from "@/core/GameModule";

/**
 * Minimal renderer module owned by GameRuntime so there is exactly one
 * Three.js renderer/scene/camera for the application. Replaced by the real
 * SceneRenderer/stadium/PSX pipeline in later phases (2, 13, 14) — this
 * placeholder only clears the canvas and reports THREE.REVISION for the
 * Phase 0 boot smoke test.
 */
export class PlaceholderSceneRenderer
  implements GameModule, RenderFrameModule
{
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;

  public constructor(private readonly canvas: HTMLCanvasElement) {}

  public initialise(): void {
    assertThreeRevision();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false
    });
    this.renderer.setClearColor(0x05010a, 1);
    this.renderer.setSize(
      this.canvas.clientWidth || 1,
      this.canvas.clientHeight || 1,
      false
    );

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    this.camera.position.set(0, 0, 5);

    document.documentElement.dataset["threeRevision"] = THREE.REVISION;
  }

  public updateRenderFrame(_context: RenderFrameContext): void {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public handleResize(width: number, height: number): void {
    if (!this.renderer || !this.camera) {
      return;
    }

    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  public getDiagnostics(): {
    drawCalls: number;
    triangles: number;
    textures: number;
    geometries: number;
  } {
    const info = this.renderer?.info;

    return {
      drawCalls: info?.render.calls ?? 0,
      triangles: info?.render.triangles ?? 0,
      textures: info?.memory.textures ?? 0,
      geometries: info?.memory.geometries ?? 0
    };
  }

  public dispose(): void {
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }
}
