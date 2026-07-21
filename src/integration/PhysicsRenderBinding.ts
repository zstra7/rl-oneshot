import * as THREE from "three";

import type { RenderFrameContext, RenderFrameModule } from "@/core/GameModule";
import { CAR_HALF_EXTENTS, RL_CONSTANTS } from "@/physics/PhysicsConstants";
import type { PhysicsFacade } from "@/physics/PhysicsFacade";
import type { CarId } from "@/physics/PhysicsTypes";

/**
 * Development/debug visualisation binding physics render snapshots to
 * simple wireframe meshes (one box per spawned car, one sphere for the
 * ball). This is intentionally not the real CarVisual/BallVisual — those
 * come from the asset pipeline once match flow (Phase 7) creates actual
 * gameplay instances bound to physics IDs. This exists now purely to
 * satisfy Phase 3's "rendering follows snapshots" exit criterion and give
 * later phases something to look at.
 */
export class PhysicsRenderBinding implements RenderFrameModule {
  private readonly root = new THREE.Group();
  private readonly ballMesh: THREE.Mesh;
  private readonly ballGeometry: THREE.SphereGeometry;
  private readonly ballMaterial: THREE.MeshStandardMaterial;
  private readonly carGeometry: THREE.BoxGeometry;
  private readonly carMaterial: THREE.MeshStandardMaterial;
  private readonly carMeshes = new Map<CarId, THREE.Mesh>();

  public constructor(
    private readonly physics: PhysicsFacade,
    private readonly getAlpha: () => number
  ) {
    this.root.name = "DynamicGameplayRoot";

    this.ballGeometry = new THREE.SphereGeometry(RL_CONSTANTS.ballRadius, 16, 12);
    this.ballMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      wireframe: true
    });
    this.ballMesh = new THREE.Mesh(this.ballGeometry, this.ballMaterial);
    this.ballMesh.name = "PhysicsDebugBall";
    this.root.add(this.ballMesh);

    this.carGeometry = new THREE.BoxGeometry(
      CAR_HALF_EXTENTS.x * 2,
      CAR_HALF_EXTENTS.y * 2,
      CAR_HALF_EXTENTS.z * 2
    );
    this.carMaterial = new THREE.MeshStandardMaterial({
      color: 0x33ff88,
      wireframe: true
    });
  }

  public getRoot(): THREE.Object3D {
    return this.root;
  }

  public updateRenderFrame(_context: RenderFrameContext): void {
    const snapshot = this.physics.getRenderSnapshot(this.getAlpha());

    this.ballMesh.position.set(
      snapshot.ball.position.x,
      snapshot.ball.position.y,
      snapshot.ball.position.z
    );
    this.ballMesh.quaternion.set(
      snapshot.ball.rotation.x,
      snapshot.ball.rotation.y,
      snapshot.ball.rotation.z,
      snapshot.ball.rotation.w
    );

    const seenCarIds = new Set<CarId>();

    for (const [carId, transform] of snapshot.cars) {
      seenCarIds.add(carId);

      let mesh = this.carMeshes.get(carId);
      if (!mesh) {
        mesh = new THREE.Mesh(this.carGeometry, this.carMaterial);
        mesh.name = `PhysicsDebugCar_${carId}`;
        this.root.add(mesh);
        this.carMeshes.set(carId, mesh);
      }

      mesh.position.set(transform.position.x, transform.position.y, transform.position.z);
      mesh.quaternion.set(
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        transform.rotation.w
      );
    }

    for (const [carId, mesh] of this.carMeshes) {
      if (!seenCarIds.has(carId)) {
        this.root.remove(mesh);
        this.carMeshes.delete(carId);
      }
    }
  }

  public dispose(): void {
    this.ballGeometry.dispose();
    this.ballMaterial.dispose();
    this.carGeometry.dispose();
    this.carMaterial.dispose();
    this.root.clear();
    this.carMeshes.clear();
  }
}
