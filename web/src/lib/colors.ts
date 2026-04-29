// Palette used for balloons and team accents.
export const BALLOON_COLORS = [
  '#E84A4A', // red
  '#F39A3F', // orange
  '#F7D247', // yellow
  '#5BC07C', // green
  '#3FA6E8', // blue
  '#A66CD0', // purple
  '#F08FB7', // pink
  '#76D6C4', // mint
  '#FF7B7B', // coral
  '#7CB6F7', // sky
];

// Hash a string to deterministic palette index
export function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return BALLOON_COLORS[hash % BALLOON_COLORS.length]!;
}

// Deterministic shuffled colors for a balloon grid
export function balloonColorsForGrid(seed: string, count: number): string[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 131 + seed.charCodeAt(i)) >>> 0;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(BALLOON_COLORS[h % BALLOON_COLORS.length]!);
  }
  return out;
}
