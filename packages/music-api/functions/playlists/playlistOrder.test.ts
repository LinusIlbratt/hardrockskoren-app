import { describe, expect, it } from "vitest";
import {
  buildAppendOrderKey,
  effectiveOrderKey,
  planMoveSwap,
  sortPlaylistRowsByOrderKey,
} from "./playlistOrder";

describe("effectiveOrderKey", () => {
  it("uses stored orderKey when present", () => {
    expect(
      effectiveOrderKey({
        materialId: "m1",
        addedAt: "2026-01-01T00:00:00.000Z",
        orderKey: "0001#m1",
      })
    ).toBe("0001#m1");
  });

  it("falls back to addedAt#materialId for legacy rows", () => {
    expect(
      effectiveOrderKey({
        materialId: "m2",
        addedAt: "2026-02-01T12:00:00.000Z",
      })
    ).toBe("2026-02-01T12:00:00.000Z#m2");
  });
});

describe("sortPlaylistRowsByOrderKey", () => {
  it("sorts by orderKey ascending and falls back for missing keys", () => {
    const sorted = sortPlaylistRowsByOrderKey([
      { materialId: "c", addedAt: "2026-03-01T00:00:00.000Z" },
      { materialId: "a", addedAt: "2026-01-01T00:00:00.000Z", orderKey: "1#a" },
      { materialId: "b", addedAt: "2026-02-01T00:00:00.000Z", orderKey: "2#b" },
    ]);
    expect(sorted.map((r) => r.materialId)).toEqual(["a", "b", "c"]);
  });
});

describe("planMoveSwap", () => {
  const rows = [
    { materialId: "a", addedAt: "2026-01-01T00:00:00.000Z", orderKey: "1#a" },
    { materialId: "b", addedAt: "2026-01-02T00:00:00.000Z", orderKey: "2#b" },
    { materialId: "c", addedAt: "2026-01-03T00:00:00.000Z", orderKey: "3#c" },
  ];

  it("returns null when moving first item up", () => {
    expect(planMoveSwap(rows, "a", "up")).toBeNull();
  });

  it("returns null when moving last item down", () => {
    expect(planMoveSwap(rows, "c", "down")).toBeNull();
  });

  it("swaps with previous neighbor on up", () => {
    const plan = planMoveSwap(rows, "b", "up");
    expect(plan).toEqual({
      current: {
        materialId: "b",
        currentOrderKey: "2#b",
        nextOrderKey: "1#a",
      },
      neighbor: {
        materialId: "a",
        currentOrderKey: "1#a",
        nextOrderKey: "2#b",
      },
    });
  });

  it("swaps with next neighbor on down", () => {
    const plan = planMoveSwap(rows, "b", "down");
    expect(plan?.neighbor.materialId).toBe("c");
    expect(plan?.current.nextOrderKey).toBe("3#c");
  });
});

describe("buildAppendOrderKey", () => {
  it("builds append key from addedAt and materialId", () => {
    expect(buildAppendOrderKey("2026-10-20T18:00:00.000Z", "mid")).toBe(
      "2026-10-20T18:00:00.000Z#mid"
    );
  });
});
