/**
 * Ordning för spellistespår. `orderKey` är en lexikografiskt sorterbar sträng.
 * Äldre poster utan fältet behandlas som `${addedAt}#${materialId}`.
 */

export type PlaylistOrderRow = {
  materialId: string;
  addedAt: string;
  orderKey?: string;
};

export function effectiveOrderKey(row: PlaylistOrderRow): string {
  const stored = row.orderKey?.trim();
  if (stored) return stored;
  return `${row.addedAt}#${row.materialId}`;
}

export function buildAppendOrderKey(addedAt: string, materialId: string): string {
  return `${addedAt}#${materialId}`;
}

/** Stigande sortering på effective orderKey (stabil vid lika nyckel via materialId). */
export function sortPlaylistRowsByOrderKey<T extends PlaylistOrderRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ka = effectiveOrderKey(a);
    const kb = effectiveOrderKey(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return a.materialId.localeCompare(b.materialId);
  });
}

export type MoveDirection = "up" | "down";

export type MoveSwapPlan = {
  current: { materialId: string; currentOrderKey: string; nextOrderKey: string };
  neighbor: { materialId: string; currentOrderKey: string; nextOrderKey: string };
};

/**
 * Beräknar bytet av orderKey mellan ett spår och dess granne.
 * Returnerar null om flytt inte är möjlig (saknas / redan först/sist).
 */
export function planMoveSwap(
  rows: PlaylistOrderRow[],
  materialId: string,
  direction: MoveDirection
): MoveSwapPlan | null {
  const sorted = sortPlaylistRowsByOrderKey(rows);
  const index = sorted.findIndex((r) => r.materialId === materialId);
  if (index < 0) return null;

  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= sorted.length) return null;

  const current = sorted[index];
  const neighbor = sorted[neighborIndex];
  const currentKey = effectiveOrderKey(current);
  const neighborKey = effectiveOrderKey(neighbor);

  return {
    current: {
      materialId: current.materialId,
      currentOrderKey: currentKey,
      nextOrderKey: neighborKey,
    },
    neighbor: {
      materialId: neighbor.materialId,
      currentOrderKey: neighborKey,
      nextOrderKey: currentKey,
    },
  };
}
