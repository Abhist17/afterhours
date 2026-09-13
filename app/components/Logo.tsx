/**
 * The mark: a day in New York as a ring of pixels, midnight at the top,
 * clockwise — the same ring the hero draws. The NYSE session, 9:30 to
 * 4:00, is the lit run of cells at the bottom; the seventeen and a half
 * hours the tokens trade without their shares are the dim ones. The
 * single pixel in the middle is now. Eleven cells a side, so it still
 * reads at sixteen pixels in a browser tab.
 */
const N = 11;

// Cells that are the ring, grouped by whether the market is open there.
const DIM: [number, number][] = [
  [4, 0], [5, 0], [6, 0], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [1, 2], [2, 2], [3, 2], [7, 2], [8, 2],
  [9, 2], [1, 3], [2, 3], [8, 3], [9, 3], [0, 4], [1, 4], [9, 4], [10, 4], [0, 5], [1, 5], [9, 5], [10, 5], [0, 6], [1, 6],
  [9, 6], [10, 6], [1, 7], [8, 7], [9, 7], [8, 8], [9, 8],
];
const LIT: [number, number][] = [
  [2, 7], [1, 8], [2, 8], [3, 8], [7, 8], [2, 9], [3, 9], [4, 9], [5, 9], [6, 9], [7, 9], [8, 9], [4, 10], [5, 10], [6, 10],
];

function Cells({ cells, fill }: { cells: [number, number][]; fill: string }) {
  return (
    <path
      fill={fill}
      d={cells.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join("")}
    />
  );
}

export function Mark({
  size = 20,
  dim = "var(--border-strong)",
  lit = "var(--brand)",
  now = "var(--text)",
  className = "",
}: {
  size?: number;
  dim?: string;
  lit?: string;
  now?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${N} ${N}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
    >
      <Cells cells={DIM} fill={dim} />
      <Cells cells={LIT} fill={lit} />
      <rect x="5" y="5" width="1" height="1" fill={now} />
    </svg>
  );
}

/** Mark and wordmark, as the top bar shows them. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <Mark size={size} />
      <span className="display text-[19px] leading-none text-text">Afterhours</span>
    </span>
  );
}
