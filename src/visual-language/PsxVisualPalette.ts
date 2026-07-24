/** PSX visual stadium spec section 6. */
export const VISUAL_PALETTE = {
  voidBlack: "#05060B",
  deepSpace: "#080B17",
  arenaBlack: "#10131B",
  graphite: "#1A1F2A",
  steel: "#2A3140",
  paleMetal: "#A8B1C2",

  playerCyan: "#24E6FF",
  playerCyanDark: "#087F99",

  opponentMagenta: "#FF3AAE",
  opponentMagentaDark: "#9A175F",

  neutralAmber: "#FFC84A",
  dangerRed: "#FF4D57",
  successGreen: "#68F5A2",

  uiWhite: "#EDF3FF",
  uiMuted: "#8993A7",

  // G4 (plan/GAME_ENHANCEMENTS_PLAN.md): a curated warmth/depth pass —
  // the world previously sat in one narrow blue-gray band (floor, ribs,
  // void all near-identical) with only the shell's cyan glow as relief,
  // which read as desolate. These add three temperature layers (warm
  // floor/structure, cool glow, violet-lifted sky) without touching the
  // team-identity or UI colors above.
  duskViolet: "#141126",
  warmConcrete: "#2E2A26",
  hazardAmberDim: "#6E5A2A",
  horizonTeal: "#0F2E33"
} as const;

export type VisualPaletteKey = keyof typeof VISUAL_PALETTE;
