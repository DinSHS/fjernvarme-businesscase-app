// Fra ibcs.spec.tsx (IBCS-referencen, MIT): ScaleProvider-testen kræver et DOM (layout-effekter), så den kører i
// appens jsdom med @testing-library/react i stedet for react-test-renderer, som appen ikke har.
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScaleProvider, useScale } from "./index";

describe("scale provider", () => {
  function Chart({ max, sink }: { max: number; sink: (ppu: number | undefined) => void }) {
    const ppu = useScale([{ unit: "EUR", min: 0, max, availablePx: 100 }]);
    sink(ppu.get("EUR"));
    return null;
  }
  it("two charts in one provider settle on the smallest px per unit without an update loop", () => {
    const seen: Record<string, number | undefined> = {};
    const r = render(
        <ScaleProvider>
          <Chart max={4e6} sink={(v) => (seen.a = v)} />
          <Chart max={1e6} sink={(v) => (seen.b = v)} />
          <Chart max={2e6} sink={(v) => (seen.c = v)} />
        </ScaleProvider>,
    );
    expect(seen.a).toBeCloseTo(100 / 4e6);
    expect(seen.b).toBeCloseTo(100 / 4e6);
    expect(seen.c).toBeCloseTo(100 / 4e6);
    r.unmount();
  });
  it("server rendering without a provider uses the chart's own request", () => {
    let got: number | undefined;
    renderToStaticMarkup(<Chart max={2e6} sink={(v) => (got = v)} />);
    expect(got).toBeCloseTo(100 / 2e6);
  });
});

