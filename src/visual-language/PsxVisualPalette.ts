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
  uiMuted: "#8993A7"
} as const;

export type VisualPaletteKey = keyof typeof VISUAL_PALETTE;
