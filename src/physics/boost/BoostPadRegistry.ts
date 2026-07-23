import type { BoostPadDefinition, BoostPadId, BoostPadRuntimeState } from "@/physics/boost/BoostPadTypes";

/** Returns pads in stable BoostPadId (insertion) order — physics spec section 21.3. */
export class BoostPadRegistry {
  private readonly definitions = new Map<BoostPadId, BoostPadDefinition>();
  private readonly runtimeStates = new Map<BoostPadId, BoostPadRuntimeState>();
  private readonly insertionOrder: BoostPadId[] = [];

  public add(definition: BoostPadDefinition): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Duplicate BoostPadId "${definition.id}" rejected.`);
    }

    this.definitions.set(definition.id, definition);
    this.runtimeStates.set(definition.id, {
      id: definition.id,
      type: definition.type,
      active: true,
      collectedAtTick: null,
      respawnAtTick: null,
      respawnTicksRemaining: 0,
      lastCollectedByCarId: null
    });
    this.insertionOrder.push(definition.id);
  }

  public get(id: BoostPadId): BoostPadRuntimeState {
    const state = this.runtimeStates.get(id);
    if (!state) {
      throw new Error(`Unknown BoostPadId "${id}".`);
    }
    return state;
  }

  public getDefinition(id: BoostPadId): BoostPadDefinition {
    const definition = this.definitions.get(id);
    if (!definition) {
      throw new Error(`Unknown BoostPadId "${id}".`);
    }
    return definition;
  }

  public getAllStable(): readonly BoostPadRuntimeState[] {
    return this.insertionOrder.map((id) => this.get(id));
  }

  public getAllDefinitionsStable(): readonly BoostPadDefinition[] {
    return this.insertionOrder.map((id) => this.getDefinition(id));
  }

  public resetAllActive(): void {
    for (const state of this.runtimeStates.values()) {
      state.active = true;
      state.collectedAtTick = null;
      state.respawnAtTick = null;
      state.respawnTicksRemaining = 0;
      state.lastCollectedByCarId = null;
    }
  }

  public clear(): void {
    this.definitions.clear();
    this.runtimeStates.clear();
    this.insertionOrder.length = 0;
  }

  public get size(): number {
    return this.definitions.size;
  }
}
