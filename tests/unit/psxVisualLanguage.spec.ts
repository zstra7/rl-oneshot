import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { PSX_RENDER_PRESETS, JITTER_STRENGTH_BY_CATEGORY } from "@/visual-language/PsxRenderSettings";
import { PsxRenderPipeline } from "@/visual-language/PsxRenderPipeline";
import { VISUAL_PALETTE } from "@/visual-language/PsxVisualPalette";
import { applyVertexJitter, updateAllJitterHandles } from "@/visual-language/VertexJitter";

describe("VISUAL_PALETTE (PSX visual spec section 6)", () => {
  it("every colour is a valid 6-digit hex string", () => {
    for (const [key, value] of Object.entries(VISUAL_PALETTE)) {
      expect(value, key).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("PSX_RENDER_PRESETS (spec sections 7 and 9)", () => {
  it("authentic is 480x270, balanced 640x360, clean 960x540", () => {
    expect(PSX_RENDER_PRESETS.authentic.internalResolution).toEqual({ width: 480, height: 270 });
    expect(PSX_RENDER_PRESETS.balanced.internalResolution).toEqual({ width: 640, height: 360 });
    expect(PSX_RENDER_PRESETS.clean.internalResolution).toEqual({ width: 960, height: 540 });
  });

  it("dither strength decreases and colour levels increase from authentic to clean", () => {
    expect(PSX_RENDER_PRESETS.authentic.ditherStrength).toBeGreaterThan(PSX_RENDER_PRESETS.balanced.ditherStrength);
    expect(PSX_RENDER_PRESETS.balanced.ditherStrength).toBeGreaterThan(PSX_RENDER_PRESETS.clean.ditherStrength);
    expect(PSX_RENDER_PRESETS.authentic.colourLevels).toBeLessThan(PSX_RENDER_PRESETS.balanced.colourLevels);
    expect(PSX_RENDER_PRESETS.balanced.colourLevels).toBeLessThan(PSX_RENDER_PRESETS.clean.colourLevels);
  });

  it("authentic colour levels stay within the spec's 16-24 range", () => {
    expect(PSX_RENDER_PRESETS.authentic.colourLevels).toBeGreaterThanOrEqual(16);
    expect(PSX_RENDER_PRESETS.authentic.colourLevels).toBeLessThanOrEqual(24);
  });
});

describe("JITTER_STRENGTH_BY_CATEGORY (spec section 8)", () => {
  it("matches the spec's exact per-category table", () => {
    expect(JITTER_STRENGTH_BY_CATEGORY.arenaMetal).toBe(1.0);
    expect(JITTER_STRENGTH_BY_CATEGORY.cars).toBe(0.65);
    expect(JITTER_STRENGTH_BY_CATEGORY.ball).toBe(0.25);
    expect(JITTER_STRENGTH_BY_CATEGORY.goalOutlines).toBe(0.25);
    expect(JITTER_STRENGTH_BY_CATEGORY.glass).toBe(0.4);
    expect(JITTER_STRENGTH_BY_CATEGORY.stars).toBe(0);
    expect(JITTER_STRENGTH_BY_CATEGORY.ui).toBe(0);
    expect(JITTER_STRENGTH_BY_CATEGORY.debugGeometry).toBe(0);
  });

  it("arena metal jitters the most, ball/goal-outlines the least (excluding the zero categories)", () => {
    expect(JITTER_STRENGTH_BY_CATEGORY.arenaMetal).toBeGreaterThan(JITTER_STRENGTH_BY_CATEGORY.cars);
    expect(JITTER_STRENGTH_BY_CATEGORY.cars).toBeGreaterThan(JITTER_STRENGTH_BY_CATEGORY.glass);
    expect(JITTER_STRENGTH_BY_CATEGORY.glass).toBeGreaterThan(JITTER_STRENGTH_BY_CATEGORY.ball);
  });
});

/** Simulates three.js's shader-compile invocation without a real WebGL context. */
function fakeCompile(material: THREE.Material): { uniforms: Record<string, unknown>; vertexShader: string } {
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: "void main() {\n  #include <project_vertex>\n}\n",
    fragmentShader: "void main() {}\n"
  };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader;
}

describe("applyVertexJitter (spec section 8)", () => {
  it("injects the jitter snap after #include <project_vertex> and wires the two uniforms", () => {
    const material = new THREE.MeshStandardMaterial();
    applyVertexJitter(material, "cars");

    const shader = fakeCompile(material);
    expect(shader.vertexShader).toContain("#include <project_vertex>");
    expect(shader.vertexShader).toContain("uJitterEnabled");
    expect(shader.uniforms["uJitterResolution"]).toBeDefined();
    expect(shader.uniforms["uJitterEnabled"]).toBeDefined();
  });

  it("is idempotent — calling it twice on the same material returns the same handle and does not double-inject", () => {
    const material = new THREE.MeshStandardMaterial();
    const first = applyVertexJitter(material, "ball");
    const second = applyVertexJitter(material, "ball");
    expect(first).toBe(second);

    // A second onBeforeCompile invocation must not throw (no duplicate
    // uniform declarations / no crash from double-wrapping).
    expect(() => fakeCompile(material)).not.toThrow();
  });

  it("a strength-0 category (stars/ui/debugGeometry) starts with jitter disabled", () => {
    const material = new THREE.MeshBasicMaterial();
    const handle = applyVertexJitter(material, "stars");
    const shader = fakeCompile(material);
    expect((shader.uniforms["uJitterEnabled"] as { value: number }).value).toBe(0);
    expect(handle.category).toBe("stars");
  });

  it("a positive-strength category starts with jitter enabled and a finite resolution", () => {
    const material = new THREE.MeshBasicMaterial();
    applyVertexJitter(material, "ball");
    const shader = fakeCompile(material);
    expect((shader.uniforms["uJitterEnabled"] as { value: number }).value).toBe(1);
    const resolution = (shader.uniforms["uJitterResolution"] as { value: THREE.Vector2 }).value;
    expect(Number.isFinite(resolution.x)).toBe(true);
    expect(Number.isFinite(resolution.y)).toBe(true);
  });

  it("a lower-strength category snaps to a finer (larger-number) grid than a higher-strength one", () => {
    const carMaterial = new THREE.MeshBasicMaterial();
    const ballMaterial = new THREE.MeshBasicMaterial();
    applyVertexJitter(carMaterial, "cars"); // strength 0.65
    applyVertexJitter(ballMaterial, "ball"); // strength 0.25 (more subtle)

    const carShader = fakeCompile(carMaterial);
    const ballShader = fakeCompile(ballMaterial);
    const carRes = (carShader.uniforms["uJitterResolution"] as { value: THREE.Vector2 }).value;
    const ballRes = (ballShader.uniforms["uJitterResolution"] as { value: THREE.Vector2 }).value;

    // Ball (lower strength -> subtler jitter) should use a finer grid
    // (bigger resolution number) than cars.
    expect(ballRes.x).toBeGreaterThan(carRes.x);
  });

  it("updateAllJitterHandles broadcasts a new base grid to a previously-registered material", () => {
    const material = new THREE.MeshBasicMaterial();
    applyVertexJitter(material, "arenaMetal"); // strength 1.0 -> resolution == base grid exactly
    updateAllJitterHandles({ width: 480, height: 270 }, true);

    const shader = fakeCompile(material);
    const resolution = (shader.uniforms["uJitterResolution"] as { value: THREE.Vector2 }).value;
    expect(resolution.x).toBeCloseTo(480, 5);
    expect(resolution.y).toBeCloseTo(270, 5);
  });
});

describe("PsxRenderPipeline (spec section 7)", () => {
  it("constructs a render target sized to the preset's internal resolution with nearest filtering", () => {
    const pipeline = new PsxRenderPipeline(PSX_RENDER_PRESETS.authentic);
    expect(pipeline.getInternalResolution()).toEqual({ width: 480, height: 270 });
    pipeline.dispose();
  });

  it("applySettings resizes the internal resolution when switching preset", () => {
    const pipeline = new PsxRenderPipeline(PSX_RENDER_PRESETS.authentic);
    pipeline.applySettings(PSX_RENDER_PRESETS.clean);
    expect(pipeline.getInternalResolution()).toEqual({ width: 960, height: 540 });
    pipeline.dispose();
  });
});
