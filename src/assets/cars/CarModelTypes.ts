import type * as THREE from "three";

import type { Vec3Data } from "@/assets/AssetTypes";

export type CarAxis = "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";

export type CarTeamId = "player" | "opponent";

export interface MaterialTargetRule {
  readonly matchBy:
    | { readonly materialName: string }
    | { readonly materialNamePattern: string }
    | { readonly nodeName: string };

  readonly role:
    | "team-primary"
    | "team-secondary"
    | "neutral-body"
    | "glass"
    | "wheel"
    | "emissive"
    | "untouched";

  readonly required: boolean;
}

export interface TeamVisualProfile {
  readonly teamId: CarTeamId;
  readonly primary: THREE.ColorRepresentation;
  readonly secondary: THREE.ColorRepresentation;
  readonly emissive: THREE.ColorRepresentation;
  readonly patternId: string;
}

export interface NodeSocketDescriptor {
  readonly id: string;
  readonly nodeName: string;
  readonly required: boolean;
}

export interface CarWheelNodeNames {
  readonly frontLeft?: string;
  readonly frontRight?: string;
  readonly rearLeft?: string;
  readonly rearRight?: string;
}

/** Asset pipeline spec section 11.3. */
export interface CarAssetDescriptor {
  readonly id: "player-car" | "opponent-car";

  readonly url: string;

  readonly expectedForwardAxis: CarAxis;
  readonly expectedUpAxis: CarAxis;

  readonly visualScale: number;

  readonly visualOffset: Vec3Data;
  readonly visualRotationEuler: Vec3Data;

  readonly teamTintTargets: readonly MaterialTargetRule[];

  readonly wheelNodes?: CarWheelNodeNames;
  readonly boostSockets?: readonly NodeSocketDescriptor[];

  readonly shadowMode: "none" | "receive" | "cast-receive";

  readonly required: true;
}

/** Asset pipeline spec section 13. */
export interface CarAssetInspectionReport {
  readonly url: string;

  readonly nodeCount: number;
  readonly meshCount: number;
  readonly skinnedMeshCount: number;
  readonly materialCount: number;
  readonly textureCount: number;

  readonly triangleCount: number;
  readonly vertexCount: number;

  readonly sourceBounds: {
    readonly min: Vec3Data;
    readonly max: Vec3Data;
    readonly size: Vec3Data;
    readonly centre: Vec3Data;
  };

  readonly animationClips: ReadonlyArray<{
    readonly name: string;
    readonly duration: number;
    readonly trackCount: number;
  }>;

  readonly nodeNames: readonly string[];
  readonly materialNames: readonly string[];

  readonly extensionUsage: readonly string[];
  readonly warnings: string[];
  readonly errors: string[];
}

export interface LoadedCarSource {
  readonly descriptor: CarAssetDescriptor;
  readonly scene: THREE.Object3D;
  readonly animations: readonly THREE.AnimationClip[];
  readonly report: CarAssetInspectionReport;
}
