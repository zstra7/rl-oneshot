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
 * SceneRenderer/PSX pipeline in later phases (13, 14) — Phase 2 extends it
 * just enough to host the procedural placeholder world (basic key +
 * hemisphere lighting per threejs-lighting; scene content ownership stays
 * with GameRuntime via addToScene/removeFromScene, per the dependency
 * direction rule that assets/visual-language must not import each other).
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

    // Positioned inside the stadium blockout looking toward the ball/cars.
    // A real chase/menu camera arrives in Phase 8; this is only enough for
    // Phase 2's "development menu can show placeholder world" criterion.
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
    this.camera.position.set(16, 10, 24);
    this.camera.lookAt(0, 2, 0);

    const hemisphereLight = new THREE.HemisphereLight(0x445577, 0x0a0510, 0.8);
    this.scene.add(hemisphereLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    keyLight.position.set(30, 50, 20);
    this.scene.add(keyLight);

    document.documentElement.dataset["threeRevision"] = THREE.REVISION;
  }

  public addToScene(object: THREE.Object3D): void {
    this.scene?.add(object);
  }

  /**
   * The single Three.js camera (core architecture spec: exactly one
   * renderer/scene/camera). Phase 8's `ChaseCameraController` drives this
   * camera's transform/fov every render frame; nothing else should create
   * a second `THREE.Camera`.
   */
  public getCamera(): THREE.PerspectiveCamera | null {
    return this.camera;
  }

  public removeFromScene(object: THREE.Object3D): void {
    this.scene?.remove(object);
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
