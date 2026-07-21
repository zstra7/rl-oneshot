export const CollisionLayer = {
  ARENA: 1 << 0,
  CAR: 1 << 1,
  BALL: 1 << 2,
  SENSOR: 1 << 3,
  BOOST_PAD_SENSOR: 1 << 4
} as const;

export type PhysicsEntityType = "car" | "ball" | "arena" | "sensor" | "boost-pad";

export interface PhysicsColliderUserData {
  readonly entityId: string;
  readonly entityType: PhysicsEntityType;
  readonly surfaceTag?: string;
}
