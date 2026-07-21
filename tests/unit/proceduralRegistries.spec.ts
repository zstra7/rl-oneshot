import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { GeometryRegistry } from "@/assets/procedural/GeometryRegistry";
import { MaterialRegistry } from "@/assets/procedural/MaterialRegistry";

describe("GeometryRegistry", () => {
  it("getOrCreate() only invokes the factory once per key", () => {
    const registry = new GeometryRegistry();
    const factory = vi.fn(() => new THREE.BoxGeometry(1, 1, 1));

    const first = registry.getOrCreate("box-v1", factory);
    const second = registry.getOrCreate("box-v1", factory);

    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("disposeUnused() only removes entries with zero refCount", () => {
    const registry = new GeometryRegistry();
    const disposeSpy = vi.fn();

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.dispose = disposeSpy;

    registry.getOrCreate("retained", () => geometry);
    registry.retain("retained");

    registry.getOrCreate("unused", () => new THREE.BoxGeometry(1, 1, 1));

    registry.disposeUnused();

    expect(disposeSpy).not.toHaveBeenCalled();
    expect(registry.size).toBe(1);
  });

  it("disposeAll() disposes and clears every entry", () => {
    const registry = new GeometryRegistry();
    registry.getOrCreate("a", () => new THREE.BoxGeometry(1, 1, 1));
    registry.getOrCreate("b", () => new THREE.SphereGeometry(1));

    registry.disposeAll();

    expect(registry.size).toBe(0);
  });
});

describe("MaterialRegistry", () => {
  it("getOrCreate() only invokes the factory once per key", () => {
    const registry = new MaterialRegistry();
    const factory = vi.fn(() => new THREE.MeshBasicMaterial({ color: 0xff0000 }));

    const first = registry.getOrCreate("red", factory);
    const second = registry.getOrCreate("red", factory);

    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("createInstanceMaterial() clones from the source and does not mutate it", () => {
    const registry = new MaterialRegistry();

    registry.getOrCreate(
      "team-base",
      () => new THREE.MeshStandardMaterial({ color: 0x3fa9ff })
    );

    const instance = registry.createInstanceMaterial<THREE.MeshStandardMaterial>(
      "team-base",
      "team-instance-a",
      (material) => material.color.set(0xff5a3f)
    );

    const base = registry.getOrCreate(
      "team-base",
      () => new THREE.MeshStandardMaterial()
    );

    expect(instance).not.toBe(base);
    expect(instance.color.getHex()).toBe(0xff5a3f);
    expect(base.color.getHex()).toBe(0x3fa9ff);
  });

  it("disposeAll() disposes and clears every material", () => {
    const registry = new MaterialRegistry();
    registry.getOrCreate("a", () => new THREE.MeshBasicMaterial());
    registry.getOrCreate("b", () => new THREE.MeshStandardMaterial());

    registry.disposeAll();

    expect(registry.size).toBe(0);
  });
});
