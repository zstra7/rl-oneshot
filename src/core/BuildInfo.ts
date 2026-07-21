import * as THREE from "three";

export const THREE_REVISION = THREE.REVISION;

export const EXPECTED_THREE_REVISION = "160";

export function assertThreeRevision(): void {
  if (THREE_REVISION !== EXPECTED_THREE_REVISION) {
    throw new Error(
      `Expected three.js revision ${EXPECTED_THREE_REVISION} but found ${THREE_REVISION}. ` +
        `Three.js must not be upgraded independently of the reviewed skill set.`
    );
  }
}

export const APP_VERSION: string =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
