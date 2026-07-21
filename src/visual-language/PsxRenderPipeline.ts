import * as THREE from "three";

import type { PsxRenderSettings } from "@/visual-language/PsxRenderSettings";

const QUAD_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * PSX visual stadium spec section 9: fixed 4x4 Bayer matrix, dither offset
 * added before quantisation ("colour += (bayerValue - 0.5) *
 * uDitherStrength; colour = floor(colour * uLevels + 0.5) / uLevels").
 * Dither is anchored to native-resolution screen pixels (`gl_FragCoord`,
 * not `vUv`) so it never moves/animates with the camera or the internal
 * low-resolution buffer's own texel grid.
 */
const QUAD_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;

uniform sampler2D uScene;
uniform float uDitherStrength;
uniform float uDitherEnabled;
uniform float uColourLevels;
uniform float uContrastBoost;

float bayerValue(vec2 fragCoord) {
  float bayerMatrix[16];
  bayerMatrix[0] = 0.0;  bayerMatrix[1] = 8.0;  bayerMatrix[2] = 2.0;  bayerMatrix[3] = 10.0;
  bayerMatrix[4] = 12.0; bayerMatrix[5] = 4.0;  bayerMatrix[6] = 14.0; bayerMatrix[7] = 6.0;
  bayerMatrix[8] = 3.0;  bayerMatrix[9] = 11.0; bayerMatrix[10] = 1.0; bayerMatrix[11] = 9.0;
  bayerMatrix[12] = 15.0; bayerMatrix[13] = 7.0; bayerMatrix[14] = 13.0; bayerMatrix[15] = 5.0;

  int x = int(mod(fragCoord.x, 4.0));
  int y = int(mod(fragCoord.y, 4.0));
  int index = y * 4 + x;

  for (int i = 0; i < 16; i += 1) {
    if (i == index) {
      return bayerMatrix[i] / 16.0;
    }
  }
  return 0.0;
}

void main() {
  vec3 colour = texture2D(uScene, vUv).rgb;

  colour = clamp((colour - 0.5) * uContrastBoost + 0.5, 0.0, 1.0);

  if (uDitherEnabled > 0.5) {
    float bayer = bayerValue(gl_FragCoord.xy);
    colour += (bayer - 0.5) * uDitherStrength;
  }

  colour = floor(colour * uColourLevels + 0.5) / uColourLevels;
  gl_FragColor = vec4(clamp(colour, 0.0, 1.0), 1.0);
}
`;

/**
 * PSX visual stadium spec section 7's rendering pipeline: render the 3D
 * world into a low-resolution `WebGLRenderTarget` (nearest filter, no
 * mipmaps), then a full-viewport quad samples it (the target's own
 * nearest filtering performs the "nearest-neighbour upscale" step for
 * free when the quad is drawn at native canvas resolution) while applying
 * contrast, Bayer dither, and colour quantisation. Native-resolution DOM
 * UI (HUD/menus, per section 7) is layered outside this pipeline entirely
 * — it is Vue-rendered, not part of the Three.js scene.
 */
export class PsxRenderPipeline {
  private renderTarget: THREE.WebGLRenderTarget;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quadMaterial: THREE.ShaderMaterial;
  private internalWidth: number;
  private internalHeight: number;

  public constructor(initialSettings: PsxRenderSettings) {
    this.internalWidth = initialSettings.internalResolution.width;
    this.internalHeight = initialSettings.internalResolution.height;

    this.renderTarget = new THREE.WebGLRenderTarget(this.internalWidth, this.internalHeight, {
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false
    });

    this.quadMaterial = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX_SHADER,
      fragmentShader: QUAD_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScene: { value: this.renderTarget.texture },
        uDitherStrength: { value: initialSettings.ditherStrength },
        uDitherEnabled: { value: initialSettings.ditherEnabled ? 1 : 0 },
        uColourLevels: { value: initialSettings.colourLevels },
        uContrastBoost: { value: initialSettings.contrastBoost }
      }
    });

    const quadGeometry = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(quadGeometry, this.quadMaterial);
    this.quadScene.add(quad);
  }

  public applySettings(settings: PsxRenderSettings): void {
    this.internalWidth = settings.internalResolution.width;
    this.internalHeight = settings.internalResolution.height;
    this.renderTarget.setSize(this.internalWidth, this.internalHeight);

    this.quadMaterial.uniforms["uDitherStrength"]!.value = settings.ditherStrength;
    this.quadMaterial.uniforms["uDitherEnabled"]!.value = settings.ditherEnabled ? 1 : 0;
    this.quadMaterial.uniforms["uColourLevels"]!.value = settings.colourLevels;
    this.quadMaterial.uniforms["uContrastBoost"]!.value = settings.contrastBoost;
  }

  public getInternalResolution(): { width: number; height: number } {
    return { width: this.internalWidth, height: this.internalHeight };
  }

  public render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const previousTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(this.renderTarget);
    renderer.clear();
    renderer.render(scene, camera);

    renderer.setRenderTarget(previousTarget);
    renderer.render(this.quadScene, this.quadCamera);
  }

  public dispose(): void {
    this.renderTarget.dispose();
    this.quadMaterial.dispose();
    this.quadScene.clear();
  }
}
