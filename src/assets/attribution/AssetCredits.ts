/**
 * Third-party asset attribution surfaced in-app (Credits screen) so that a
 * distributed build carries the licence notices the assets require, not just
 * the repo docs. Kept in sync with `docs/asset-attribution.md`, which remains
 * the authoritative long-form record.
 */
export interface AssetCredit {
  /** Human-readable asset title. */
  readonly title: string;
  /** Author / creator, as they wish to be credited. */
  readonly author: string;
  /** Licence short name (e.g. "CC BY 4.0", "SIL OFL 1.1"). */
  readonly licence: string;
  /** Canonical source URL for the asset. */
  readonly sourceUrl: string;
  /** URL of the licence text/deed. */
  readonly licenceUrl: string;
}

export interface CreditsSection {
  readonly heading: string;
  readonly entries: readonly AssetCredit[];
}

export const ASSET_CREDITS: readonly CreditsSection[] = [
  {
    heading: "3D MODELS",
    entries: [
      {
        title: "PSX style Pontiac Ventura 1977's",
        author: "spatka (Sleepless)",
        licence: "CC BY 4.0",
        sourceUrl:
          "https://sketchfab.com/3d-models/psx-style-pontiac-ventura-1977s-8a63069b223e4ab88bac635d886559c7",
        licenceUrl: "https://creativecommons.org/licenses/by/4.0/"
      }
    ]
  },
  {
    heading: "FONTS",
    entries: [
      {
        title: "Russo One",
        author: "Jovanny Lemonad",
        licence: "SIL OFL 1.1",
        sourceUrl: "https://fonts.google.com/specimen/Russo+One",
        licenceUrl: "https://openfontlicense.org/"
      },
      {
        title: "Chakra Petch",
        author: "Cadson Demak",
        licence: "SIL OFL 1.1",
        sourceUrl: "https://fonts.google.com/specimen/Chakra+Petch",
        licenceUrl: "https://openfontlicense.org/"
      }
    ]
  }
];
