import type {
  CarAssetDescriptor,
  CarAssetInspectionReport,
  MaterialTargetRule
} from "@/assets/cars/CarModelTypes";

export interface CarValidationResult {
  readonly errors: string[];
  readonly warnings: string[];
}

const MAX_RECOMMENDED_TRIANGLES = 50_000;
const MAX_MATERIALS = 32;
const MAX_TEXTURES = 16;

function isFiniteVec3(vec: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(vec.x) && Number.isFinite(vec.y) && Number.isFinite(vec.z);
}

export function matchTargetInReport(
  matchBy: MaterialTargetRule["matchBy"],
  report: Pick<CarAssetInspectionReport, "materialNames" | "nodeNames">
): boolean {
  if ("materialName" in matchBy) {
    return report.materialNames.includes(matchBy.materialName);
  }
  if ("materialNamePattern" in matchBy) {
    const pattern = new RegExp(matchBy.materialNamePattern);
    return report.materialNames.some((name) => pattern.test(name));
  }
  return report.nodeNames.includes(matchBy.nodeName);
}

/**
 * Asset pipeline spec section 14: required checks (14.1) fail production
 * validation; warnings (14.2) do not. Only checks computable from a
 * `CarAssetInspectionReport` are implemented here — file-missing/loader-
 * error are reported by `CarAssetLoader` itself before a report can even
 * be built (see its own try/catch).
 */
export function validateCarAsset(
  report: CarAssetInspectionReport,
  descriptor: CarAssetDescriptor
): CarValidationResult {
  const errors: string[] = [...report.errors];
  const warnings: string[] = [...report.warnings];

  if (report.meshCount === 0) {
    errors.push(`Car "${descriptor.id}": GLB contains no mesh.`);
  }

  const { min, max, size } = report.sourceBounds;
  if (!isFiniteVec3(min) || !isFiniteVec3(max) || !isFiniteVec3(size)) {
    errors.push(`Car "${descriptor.id}": non-finite source bounds.`);
  } else if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
    errors.push(`Car "${descriptor.id}": zero-size source bounds.`);
  }

  for (const target of descriptor.teamTintTargets) {
    if (!target.required) {
      continue;
    }
    const matched = matchTargetInReport(target.matchBy, report);

    if (!matched) {
      errors.push(
        `Car "${descriptor.id}": required team-tint target not found in GLB (${JSON.stringify(target.matchBy)}).`
      );
    }
  }

  for (const [slot, nodeName] of Object.entries(descriptor.wheelNodes ?? {})) {
    if (nodeName && !report.nodeNames.includes(nodeName)) {
      errors.push(`Car "${descriptor.id}": declared wheel node "${slot}" ("${nodeName}") not found in GLB.`);
    }
  }

  for (const socket of descriptor.boostSockets ?? []) {
    if (socket.required && !report.nodeNames.includes(socket.nodeName)) {
      errors.push(`Car "${descriptor.id}": declared boost socket "${socket.id}" ("${socket.nodeName}") not found in GLB.`);
    }
  }

  if (report.triangleCount > MAX_RECOMMENDED_TRIANGLES) {
    warnings.push(
      `Car "${descriptor.id}": ${report.triangleCount} triangles exceeds the ${MAX_RECOMMENDED_TRIANGLES} recommended maximum.`
    );
  }
  if (report.materialCount > MAX_MATERIALS) {
    warnings.push(`Car "${descriptor.id}": ${report.materialCount} materials exceeds ${MAX_MATERIALS}.`);
  }
  if (report.textureCount > MAX_TEXTURES) {
    warnings.push(`Car "${descriptor.id}": ${report.textureCount} textures exceeds ${MAX_TEXTURES}.`);
  }

  return { errors, warnings };
}
