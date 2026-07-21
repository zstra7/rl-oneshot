import type * as THREE from "three";

interface GeometryEntry {
  geometry: THREE.BufferGeometry;
  refCount: number;
}

/** Repeated shapes share geometry — see asset pipeline spec section 30. */
export class GeometryRegistry {
  private readonly entries = new Map<string, GeometryEntry>();

  public getOrCreate(
    key: string,
    factory: () => THREE.BufferGeometry
  ): THREE.BufferGeometry {
    let entry = this.entries.get(key);

    if (!entry) {
      entry = { geometry: factory(), refCount: 0 };
      this.entries.set(key, entry);
    }

    return entry.geometry;
  }

  public retain(key: string): void {
    const entry = this.entries.get(key);
    if (entry) {
      entry.refCount += 1;
    }
  }

  public release(key: string): void {
    const entry = this.entries.get(key);
    if (entry) {
      entry.refCount = Math.max(0, entry.refCount - 1);
    }
  }

  public disposeUnused(): void {
    for (const [key, entry] of this.entries) {
      if (entry.refCount <= 0) {
        entry.geometry.dispose();
        this.entries.delete(key);
      }
    }
  }

  public disposeAll(): void {
    for (const entry of this.entries.values()) {
      entry.geometry.dispose();
    }
    this.entries.clear();
  }

  public get size(): number {
    return this.entries.size;
  }
}
