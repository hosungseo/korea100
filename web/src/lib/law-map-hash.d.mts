export interface LawMapHashState {
  article?: string;
  route?: [string, string];
}

export function parseLawMapHash(hash: string | null | undefined): LawMapHashState;
export function formatLawMapHash(state: LawMapHashState): string;
