import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import type {
  CarAssetDescriptor,
  CarAssetInspectionReport,
  LoadedCarSource,
  TeamVisualProfile
} from "@/assets/cars/CarModelTypes";
import { applyVertexJitter } from "@/visual-language/VertexJitter";

interface CachedSource {
  readonly gltf: GLTF;
  readonly report: CarAssetInspectionReport;
}

/**
 * Asset pipeline spec section 12: a cached `GLTFLoader`, cache-by-URL so
 * loading the same shared `car.glb` for both `player-car` and
 * `opponent-car` descriptors only ever touches the network/disk once.
 * `createInstance` builds the spec section 15 normalisation hierarchy
 * (CarPhysicsRoot -> CarVisualOffset -> CarTeamVisualRoot -> LoadedGlbScene)
 * from that shared source, cloning only the materials that need
 * instance-specific team-colour mutation (section 17.1) — geometry and
 * immutable textures stay shared with every other instance.
 */
export class CarAssetLoader {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<CachedSource>>();

  public async loadSource(descriptor: CarAssetDescriptor): Promise<LoadedCarSource> {
    const cached = await this.getOrLoad(descriptor);
    return {
      descriptor,
      scene: cached.gltf.scene,
      animations: cached.gltf.animations,
      report: cached.report
    };
  }

  public createInstance(source: LoadedCarSource, team: TeamVisualProfile): THREE.Group {
    const { descriptor } = source;

    const physicsRoot = new THREE.Group();
    physicsRoot.name = `CarPhysicsRoot_${descriptor.id}`;
    physicsRoot.userData["isFallbackVisual"] = false;
    physicsRoot.userData["carDescriptorId"] = descriptor.id;

    const visualOffset = new THREE.Group();
    visualOffset.name = "CarVisualOffset";
    visualOffset.scale.setScalar(descriptor.visualScale);
    visualOffset.position.set(
      descriptor.visualOffset.x,
      descriptor.visualOffset.y,
      descriptor.visualOffset.z
    );
    visualOffset.rotation.set(
      descriptor.visualRotationEuler.x,
      descriptor.visualRotationEuler.y,
      descriptor.visualRotationEuler.z
    );
    physicsRoot.add(visualOffset);

    const teamRoot = new THREE.Group();
    teamRoot.name = `CarTeamVisualRoot_${team.teamId}`;
    visualOffset.add(teamRoot);

    const loadedScene = source.scene.clone(true);
    loadedScene.name = "LoadedGlbScene";
    applyTeamMaterials(loadedScene, descriptor, team);
    applyShadowMode(loadedScene, descriptor.shadowMode);
    teamRoot.add(loadedScene);

    return physicsRoot;
  }

  private getOrLoad(descriptor: CarAssetDescriptor): Promise<CachedSource> {
    let pending = this.cache.get(descriptor.url);
    if (!pending) {
      pending = this.loadAndInspect(descriptor);
      this.cache.set(descriptor.url, pending);
    }
    return pending;
  }

  private async loadAndInspect(descriptor: CarAssetDescriptor): Promise<CachedSource> {
    let gltf: GLTF;
    try {
      gltf = await this.loader.loadAsync(descriptor.url);
    } catch (error) {
      throw new Error(
        `Car "${descriptor.id}": failed to load GLB at "${descriptor.url}": ${String(error)}`
      );
    }
    const report = buildInspectionReport(descriptor.url, gltf);
    return { gltf, report };
  }

  public dispose(): void {
    this.cache.clear();
  }
}

/** Clones and colour-mutates only the materials a team-tint rule targets. */
function applyTeamMaterials(
  scene: THREE.Object3D,
  descriptor: CarAssetDescriptor,
  team: TeamVisualProfile
): void {
  const cloneCache = new Map<THREE.Material, THREE.Material>();

  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const resolved = materials.map((material) => {
      const resolvedMaterial = resolveMaterial(material, node, descriptor, team, cloneCache);
      applyVertexJitter(resolvedMaterial, "cars");
      return resolvedMaterial;
    });
    node.material = Array.isArray(node.material) ? resolved : (resolved[0] as THREE.Material);
  });
}

function resolveMaterial(
  material: THREE.Material,
  node: THREE.Mesh,
  descriptor: CarAssetDescriptor,
  team: TeamVisualProfile,
  cloneCache: Map<THREE.Material, THREE.Material>
): THREE.Material {
  const rule = descriptor.teamTintTargets.find((target) => {
    const matchBy = target.matchBy;
    if ("materialName" in matchBy) {
      return material.name === matchBy.materialName;
    }
    if ("materialNamePattern" in matchBy) {
      return new RegExp(matchBy.materialNamePattern).test(material.name);
    }
    return node.name === matchBy.nodeName;
  });

  if (!rule || rule.role === "untouched" || rule.role === "neutral-body" || rule.role === "wheel" || rule.role === "glass") {
    return material;
  }

  const existing = cloneCache.get(material);
  if (existing) {
    return existing;
  }

  const clone = material.clone();
  const tintColor =
    rule.role === "team-secondary" ? team.secondary : rule.role === "emissive" ? team.emissive : team.primary;

  if ("color" in clone && clone.color instanceof THREE.Color) {
    clone.color.set(tintColor);
  }
  if (rule.role === "emissive" && "emissive" in clone && clone.emissive instanceof THREE.Color) {
    clone.emissive.set(tintColor);
  }

  cloneCache.set(material, clone);
  return clone;
}

function applyShadowMode(scene: THREE.Object3D, mode: CarAssetDescriptor["shadowMode"]): void {
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }
    node.castShadow = mode === "cast-receive";
    node.receiveShadow = mode === "receive" || mode === "cast-receive";
  });
}

function buildInspectionReport(url: string, gltf: GLTF): CarAssetInspectionReport {
  const nodeNames: string[] = [];
  const materialNames: string[] = [];
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let meshCount = 0;
  let skinnedMeshCount = 0;
  let triangleCount = 0;
  let vertexCount = 0;

  gltf.scene.traverse((node) => {
    nodeNames.push(node.name);

    if (node instanceof THREE.Mesh) {
      meshCount += 1;
      if ((node as THREE.SkinnedMesh).isSkinnedMesh) {
        skinnedMeshCount += 1;
      }

      const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of nodeMaterials) {
        materials.add(material);
        if (material.name && !materialNames.includes(material.name)) {
          materialNames.push(material.name);
        }
        for (const key of ["map", "emissiveMap", "normalMap", "roughnessMap", "metalnessMap", "aoMap"] as const) {
          const texture = (material as unknown as Record<string, THREE.Texture | null>)[key];
          if (texture) {
            textures.add(texture);
          }
        }
      }

      const geometry = node.geometry;
      const position = geometry.getAttribute("position");
      vertexCount += position?.count ?? 0;
      triangleCount += geometry.index ? geometry.index.count / 3 : (position?.count ?? 0) / 3;
    }
  });

  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(centre);

  const extensionsUsed = (gltf.parser.json?.extensionsUsed as string[] | undefined) ?? [];

  return {
    url,
    nodeCount: nodeNames.length,
    meshCount,
    skinnedMeshCount,
    materialCount: materials.size,
    textureCount: textures.size,
    triangleCount: Math.round(triangleCount),
    vertexCount,
    sourceBounds: {
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z },
      size: { x: size.x, y: size.y, z: size.z },
      centre: { x: centre.x, y: centre.y, z: centre.z }
    },
    animationClips: gltf.animations.map((clip) => ({
      name: clip.name,
      duration: clip.duration,
      trackCount: clip.tracks.length
    })),
    nodeNames,
    materialNames,
    extensionUsage: extensionsUsed,
    warnings: [],
    errors: []
  };
}
