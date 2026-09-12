"use client";

/**
 * The correlation behind the covariance, in monochrome: colour on this page
 * says stock, crypto or cash, and a correlation is none of those. Cells
 * darken with |ρ|; the held assets are foregrounded; the most correlated
 * held pair is named.
 */
export function CorrelationGrid({
  correlation,
  held = [],
}: {
  correlation: { symbols: string[]; matrix: number[][] };
  held?: string[];
}) {
  const { symbols, matrix } = correlation;
  const holds = new Set(held);
  const anyHeld = symbols.some((s) => holds.has(s));

  let callout: { a: string; b: string; rho: number } | null = null;
  for (let i = 0; i < symbols.length; i++)
    for (let j = i + 1; j < symbols.length; j++) {
      if (!holds.has(symbols[i]) || !holds.has(symbols[j])) continue;
      if (!callout || matrix[i][j] > callout.rho) callout = { a: symbols[i], b: symbols[j], rho: matrix[i][j] };
    }

  const fmt = (rho: number) => {
    const s = Math.abs(rho).toFixed(2).replace(/^0/, "");
    return rho < 0 ? `-${s}` : s;
  };
  const short = (s: string) => (s.length > 5 ? s.replace(/x$/, "").slice(0, 4) + "x" : s);

  if (symbols.length < 2) {
    return <p className="px-4 py-4 text-xs text-tertiary">Needs at least two assets with history.</p>;
  }

  return (
    <div className="px-4 py-3.5">
      <div className="overflow-x-auto">
        <table className="numeric w-full border-separate border-spacing-[2px] text-[10px]" aria-label={`Correlation matrix across ${symbols.length} assets`}>
          <thead>
            <tr>
              <th aria-hidden="true" />
              {symbols.map((s) => (
                <th key={s} scope="col" className={`pb-1 text-center font-medium ${!anyHeld || holds.has(s) ? "text-text" : "text-tertiary"}`}>{short(s)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {symbols.map((row, i) => (
              <tr key={row}>
                <th scope="row" className={`pr-1.5 text-left font-medium ${!anyHeld || holds.has(row) ? "text-text" : "text-tertiary"}`}>{short(row)}</th>
                {symbols.map((col, j) => {
                  const rho = matrix[i][j];
                  const diagonal = i === j;
                  const dim = anyHeld && !(holds.has(row) && holds.has(col));
                  const strength = Math.abs(rho) * (dim ? 22 : 60);
                  return (
                    <td
                      key={col}
                      className="h-6 min-w-6 rounded-[3px] text-center"
                      style={{
                        backgroundColor: diagonal ? "transparent" : `color-mix(in srgb, var(--text) ${Math.round(strength)}%, transparent)`,
                        color: diagonal ? "var(--border-strong)" : strength > 34 ? "var(--bg)" : dim ? "var(--text-tertiary)" : "var(--text)",
                        outline: rho < -0.05 ? "1px solid var(--text-secondary)" : undefined,
                        outlineOffset: -1,
                      }}
                      title={diagonal ? undefined : `${row} · ${col}: ${rho.toFixed(2)}`}
                    >
                      {diagonal ? "·" : fmt(rho)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-tertiary">
        {callout ? (
          <>
            <span className="text-secondary">{callout.a} and {callout.b}</span> move together at {callout.rho.toFixed(2)} —{" "}
            {callout.rho >= 0.9 ? "one position wearing two names." : callout.rho >= 0.7 ? "spreading across them buys less than it looks." : "genuinely different exposures."}
          </>
        ) : (
          <>Pairs near 1.00 move as one; a book spread across them is one bet with several tickers.</>
        )}
      </p>
      <p className="mt-1.5 text-[10px] leading-snug text-tertiary">
        Thirty days of hourly returns, exponentially weighted on the same decay as the loss model. SPYx is always shown, held or not.
      </p>
    </div>
  );
}
