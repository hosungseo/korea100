export const EDGE_TYPE_COLORS: {
  sequence: string;
  message: string;
  loop: string;
};

export const EDGE_LINE_COLORS: {
  sequence: string;
  message: string;
  loop: string;
};

export const EDGE_DASH: {
  sequence: string;
  message: string;
  loop: string;
};

export const ARROW_HEAD: {
  d: string;
  width: number;
  height: number;
  refX: number;
  refY: number;
  outline: string;
  outlineWidth: number;
};

export const EDGE_END_INSET: number;

export const FAN_IN_GAP: number;

export function arrowMarkerMarkup(id: string, color: string, scale?: number): string;
