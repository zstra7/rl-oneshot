import type * as THREE from "three";

/** Shared-by-default material factory — see asset pipeline spec section 31. */
export class MaterialRegistry {
  private readonly materials = new Map<string, THREE.Material>();

  public getOrCreate<T extends THREE.Material>(key: string, factory: () => T): T {
    let material = this.materials.get(key) as T | undefined;

    if (!material) {
      material = factory();
      this.materials.set(key, material);
    }

    return material;
  }

  public createInstanceMaterial<T extends THREE.Material>(
    sourceKey: string,
    instanceKey: string,
    mutate: (material: T) => void
  ): T {
    const existing = this.materials.get(instanceKey) as T | undefined;
    if (existing) {
      return existing;
    }

    const source = this.materials.get(sourceKey) as T | undefined;

    if (!source) {
      throw new Error(
        `MaterialRegistry.createInstanceMaterial: source key "${sourceKey}" does not exist.`
      );
    }

    const instance = source.clone() as T;
    mutate(instance);
    this.materials.set(instanceKey, instance);

    return instance;
  }

  public disposeAll(): void {
    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.materials.clear();
  }

  public get size(): number {
    return this.materials.size;
  }
}
