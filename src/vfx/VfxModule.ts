import * as THREE from "three";

import { OPPONENT_CAR_ID, PLAYER_CAR_ID } from "@/game-flow/MatchFlowConstants";
import type { MatchFlowController } from "@/game-flow/MatchFlowController";
import { otherTeam, type TeamId } from "@/core/TeamTypes";
import type { RenderFrameContext, RenderFrameModule } from "@/core/GameModule";
import type { PhysicsFacade } from "@/physics/PhysicsFacade";
import type { CarId } from "@/physics/PhysicsTypes";
import * as V from "@/physics/Vec3Math";
import { SeededRandom } from "@/assets/procedural/SeededRandom";
import { VISUAL_PALETTE } from "@/visual-language/PsxVisualPalette";

const VFX_RANDOM_SEED = 0x76667831;

const POOL_SIZE = 500;

/**
 * `THREE.PointsMaterial.size` is a single uniform for the whole draw
 * call — it does not read a per-vertex "size" attribute. A custom
 * `ShaderMaterial` is the standard three.js technique for per-particle
 * point size (used here so a dying particle can shrink/fade and an
 * inactive pooled particle can be driven to `gl_PointSize = 0`, i.e.
 * genuinely invisible, rather than rendering as a stray fixed-size dot
 * sitting at the origin).
 */
const PARTICLE_VERTEX_SHADER = `
attribute float size;
attribute vec3 color;
varying vec3 vColor;
varying float vSize;
void main() {
  vColor = color;
  vSize = size;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / max(-mvPosition.z, 0.001));
  gl_Position = projectionMatrix * mvPosition;
}
`;

// WS7.D (plan/POLISH_OVERHAUL_PLAN.md): `gl_PointSize = 0` is clamped to
// 1px on most GPUs rather than culled, so an inactive pooled particle
// (size driven to 0 in uploadBuffers) could still rasterise a stray 1px
// dot at its last position forever with additive blending. Discarding
// on the size varying (not just relying on point-size) makes a
// zero-size particle genuinely invisible on every GPU/driver.
const PARTICLE_FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vColor;
varying float vSize;
void main() {
  if (vSize <= 0.0) {
    discard;
  }
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) {
    discard;
  }
  float alpha = 1.0 - smoothstep(0.25, 0.5, dist);
  gl_FragColor = vec4(vColor, alpha);
}
`;

/** RL spec section 24's boost consumption rate (33.3/s) makes a >0.15-per-frame drop an unambiguous "actively boosting" signal even at 30fps. */
const BOOST_DROP_THRESHOLD = 0.1;
const BALL_IMPACT_VELOCITY_DELTA_THRESHOLD = 6;

interface Particle {
  active: boolean;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly color: THREE.Color;
  size: number;
  age: number;
  maxLife: number;
  drag: number;
}

function teamColor(team: TeamId): THREE.ColorRepresentation {
  return team === "player" ? VISUAL_PALETTE.playerCyan : VISUAL_PALETTE.opponentMagenta;
}

function carIdToTeam(carId: CarId): TeamId {
  return carId === OPPONENT_CAR_ID ? "opponent" : "player";
}

/**
 * Real VFX module (Master Brief Phase 14, PSX visual spec sections 18-20)
 * replacing `NullVfxModule`. A single shared, fixed-size particle pool
 * (spec section 18's "pooling") rendered as one `THREE.Points` object —
 * boost trails, ball-impact bursts, and goal celebration bursts all draw
 * from it rather than each owning a separate system. Scoped to the three
 * effects with an unambiguous, physics-observation-only trigger signal
 * (boost consumption, a sudden ball velocity change, entering
 * `GOAL_CELEBRATION`) — car-car impact, jump/slide-specific particles,
 * and the full goal-celebration shockwave/shard/banner/camera-impulse
 * choreography (spec sections 19-20) are deferred; see
 * docs/visual-language-deviations.md Phase 14.
 */
export class VfxModule implements RenderFrameModule {
  private readonly root = new THREE.Group();
  private readonly particles: Particle[] = [];
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly points: THREE.Points;

  private readonly previousBoostAmount = new Map<CarId, number>();
  private previousBallVelocity: V.Vec3Like = { x: 0, y: 0, z: 0 };
  private previousMatchState: string | null = null;
  private previousPlayerScore = 0;
  private previousOpponentScore = 0;
  /** R12.2: Customise Car boost-trail colour override for the player's car, boost-trail spawn path only — goal celebration always keeps team colours. */
  private playerBoostColorOverride: THREE.ColorRepresentation | null = null;
  /** R12.4: car currently showing the stationary Customise Car boost-trail preview, or null while off-screen. */
  private boostPreviewCarId: CarId | null = null;
  private boostPreviewFrameCounter = 0;
  /**
   * Master Brief "Never Do These": "Never use Math.random() for
   * gameplay." Particle cosmetics don't feed back into gameplay/physics,
   * but a dedicated seeded stream (not the shared procedural-asset RNG)
   * keeps the whole codebase's randomness policy uniform and this
   * module's spawn variation reproducible run-to-run.
   */
  private readonly random = new SeededRandom(VFX_RANDOM_SEED);

  public constructor(
    private readonly physics: PhysicsFacade,
    private readonly gameFlow: Pick<MatchFlowController, "getSessionState">
  ) {
    this.root.name = "VfxRoot";

    for (let i = 0; i < POOL_SIZE; i += 1) {
      this.particles.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        color: new THREE.Color(),
        size: 0,
        age: 0,
        maxLife: 1,
        drag: 0
      });
    }

    this.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(POOL_SIZE * 3), 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(POOL_SIZE * 3), 3));
    this.geometry.setAttribute("size", new THREE.BufferAttribute(new Float32Array(POOL_SIZE), 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = "VfxParticles";
    this.points.frustumCulled = false;
    this.root.add(this.points);
  }

  public getRoot(): THREE.Object3D {
    return this.root;
  }

  public updateRenderFrame(context: RenderFrameContext): void {
    const dt = Math.min(context.frameDeltaSeconds, 1 / 15);

    this.detectBoostTrails();
    this.detectBallImpact();
    this.detectGoalCelebration();
    this.updateBoostPreview();
    this.stepParticles(dt);
    this.uploadBuffers();
  }

  /** R12.2: boost-trail spawn colour for `carId` — the live override for the player's own car, team colour otherwise. Kept distinct from `teamColor`/goal-celebration's colour lookup by call site, not by sharing this function. */
  private boostTrailColor(carId: CarId): THREE.ColorRepresentation {
    if (carId === PLAYER_CAR_ID && this.playerBoostColorOverride) {
      return this.playerBoostColorOverride;
    }
    return teamColor(carIdToTeam(carId));
  }

  /** R12.2: live override applied only to the boost-trail spawn path (see `boostTrailColor`) — null restores the team-cyan default. */
  public setPlayerBoostColor(hex: string | null): void {
    this.playerBoostColorOverride = hex;
  }

  /** R12.4: Customise Car menu preview — while set, spawns a boost-trail burst at `carId`'s rear roughly every 3rd frame, bypassing the normal boost-consumption detection (the car is stationary in the menu, so there is no real boost draw to detect). Null stops the preview. */
  public setBoostPreview(carId: CarId | null): void {
    this.boostPreviewCarId = carId;
    this.boostPreviewFrameCounter = 0;
  }

  private updateBoostPreview(): void {
    if (!this.boostPreviewCarId) {
      return;
    }
    this.boostPreviewFrameCounter += 1;
    if (this.boostPreviewFrameCounter % 3 !== 0) {
      return;
    }

    const carId = this.boostPreviewCarId;
    const car = this.physics.getCarState(carId);
    const forward = V.applyQuaternion(V.LOCAL_FORWARD, car.rotation);
    const behind = V.sub(car.position, V.scale(forward, 0.7));
    const color = this.boostTrailColor(carId);

    for (let i = 0; i < 2; i += 1) {
      this.spawn({
        position: { x: behind.x, y: behind.y - 0.05, z: behind.z },
        velocity: V.add(
          V.scale(forward, -3 - this.random.range(0, 2)),
          {
            x: this.random.range(-0.75, 0.75),
            y: this.random.range(-0.75, 0.75),
            z: this.random.range(-0.75, 0.75)
          }
        ),
        color,
        size: 0.14 + this.random.range(0, 0.08),
        maxLife: 0.35,
        drag: 2.5
      });
    }
  }

  private detectBoostTrails(): void {
    for (const carId of [PLAYER_CAR_ID, OPPONENT_CAR_ID] as const) {
      const car = this.physics.getCarState(carId);
      const previous = this.previousBoostAmount.get(carId) ?? car.boostAmount;
      const consumed = previous - car.boostAmount;
      this.previousBoostAmount.set(carId, car.boostAmount);

      if (consumed < BOOST_DROP_THRESHOLD) {
        continue;
      }

      const forward = V.applyQuaternion(V.LOCAL_FORWARD, car.rotation);
      const behind = V.sub(car.position, V.scale(forward, 0.7));
      const color = this.boostTrailColor(carId);

      for (let i = 0; i < 2; i += 1) {
        this.spawn({
          position: { x: behind.x, y: behind.y - 0.05, z: behind.z },
          velocity: V.add(
            V.scale(forward, -3 - this.random.range(0, 2)),
            {
              x: this.random.range(-0.75, 0.75),
              y: this.random.range(-0.75, 0.75),
              z: this.random.range(-0.75, 0.75)
            }
          ),
          color,
          size: 0.14 + this.random.range(0, 0.08),
          maxLife: 0.35,
          drag: 2.5
        });
      }
    }
  }

  private detectBallImpact(): void {
    const ball = this.physics.getBallState();
    const delta = V.length(V.sub(ball.linearVelocity, this.previousBallVelocity));
    this.previousBallVelocity = ball.linearVelocity;

    if (delta < BALL_IMPACT_VELOCITY_DELTA_THRESHOLD) {
      return;
    }

    const burstCount = 10;
    for (let i = 0; i < burstCount; i += 1) {
      const direction = V.normalize({
        x: this.random.range(-0.5, 0.5),
        y: this.random.range(-0.5, 0.5),
        z: this.random.range(-0.5, 0.5)
      });
      this.spawn({
        position: ball.position,
        velocity: V.scale(direction, 3 + this.random.range(0, 4)),
        color: VISUAL_PALETTE.neutralAmber,
        size: 0.1 + this.random.range(0, 0.06),
        maxLife: 0.4,
        drag: 3
      });
    }
  }

  private detectGoalCelebration(): void {
    const session = this.gameFlow.getSessionState();
    const enteredCelebration =
      session.matchState === "GOAL_CELEBRATION" && this.previousMatchState !== "GOAL_CELEBRATION";
    this.previousMatchState = session.matchState;

    if (!enteredCelebration) {
      this.previousPlayerScore = session.playerScore;
      this.previousOpponentScore = session.opponentScore;
      return;
    }

    const playerScored = session.playerScore > this.previousPlayerScore;
    const opponentScored = session.opponentScore > this.previousOpponentScore;
    const scoringTeam: TeamId = playerScored && !opponentScored ? "player" : "opponent";
    this.previousPlayerScore = session.playerScore;
    this.previousOpponentScore = session.opponentScore;

    const concededTeam = otherTeam(scoringTeam);
    const goalCentre = this.physics.getGoalSensorCentre(concededTeam) ?? { x: 0, y: 1, z: 0 };
    const color = teamColor(scoringTeam);

    const burstCount = 60;
    for (let i = 0; i < burstCount; i += 1) {
      const direction = V.normalize({
        x: this.random.range(-0.5, 0.5),
        y: this.random.range(0, 0.6),
        z: this.random.range(-0.5, 0.5)
      });
      this.spawn({
        position: goalCentre,
        velocity: V.scale(direction, 4 + this.random.range(0, 8)),
        color,
        size: 0.16 + this.random.range(0, 0.12),
        maxLife: 0.9 + this.random.range(0, 0.4),
        drag: 1.2
      });
    }
  }

  private spawn(options: {
    position: V.Vec3Like;
    velocity: V.Vec3Like;
    color: THREE.ColorRepresentation;
    size: number;
    maxLife: number;
    drag: number;
  }): void {
    const particle = this.particles.find((p) => !p.active) ?? this.particles[0]!;
    particle.active = true;
    particle.position.set(options.position.x, options.position.y, options.position.z);
    particle.velocity.set(options.velocity.x, options.velocity.y, options.velocity.z);
    particle.color.set(options.color);
    particle.size = options.size;
    particle.age = 0;
    particle.maxLife = options.maxLife;
    particle.drag = options.drag;
  }

  private stepParticles(dt: number): void {
    for (const particle of this.particles) {
      if (!particle.active) {
        continue;
      }
      particle.age += dt;
      if (particle.age >= particle.maxLife) {
        particle.active = false;
        continue;
      }
      particle.velocity.y -= 4 * dt;
      particle.velocity.multiplyScalar(Math.max(0, 1 - particle.drag * dt));
      particle.position.addScaledVector(particle.velocity, dt);
    }
  }

  private uploadBuffers(): void {
    const positionAttr = this.geometry.getAttribute("position") as THREE.BufferAttribute;
    const colorAttr = this.geometry.getAttribute("color") as THREE.BufferAttribute;
    const sizeAttr = this.geometry.getAttribute("size") as THREE.BufferAttribute;

    for (let i = 0; i < POOL_SIZE; i += 1) {
      const particle = this.particles[i]!;
      if (particle.active) {
        const lifeRatio = 1 - particle.age / particle.maxLife;
        positionAttr.setXYZ(i, particle.position.x, particle.position.y, particle.position.z);
        colorAttr.setXYZ(i, particle.color.r, particle.color.g, particle.color.b);
        sizeAttr.setX(i, particle.size * Math.max(0, lifeRatio));
      } else {
        sizeAttr.setX(i, 0);
        // Belt-and-braces alongside the fragment-shader discard: move
        // the point far off-screen too, so even a renderer/driver that
        // ignores gl_PointSize==0 has nothing there to draw.
        positionAttr.setXYZ(i, 0, -10000, 0);
      }
    }

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  }

  public getActiveParticleCount(): number {
    return this.particles.reduce((count, p) => count + (p.active ? 1 : 0), 0);
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.root.clear();
  }
}
