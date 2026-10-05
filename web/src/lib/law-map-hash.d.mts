import type { LawMapView } from "./law-map-types";

export interface LawMapHashState {
  article?: string;
  route?: [string, string];
  view?: LawMapView;
}

export function parseLawMapHash(hash: string | null | undefined): LawMapHashState;
export function formatLawMapHash(state: LawMapHashState): string;
