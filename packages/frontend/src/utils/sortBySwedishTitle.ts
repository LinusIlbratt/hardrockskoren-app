/** Svensk bokstavsordning, skiftlägesoberoende. Å, Ä och Ö sorteras efter Z. */
export function compareSwedishTitles(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return (a ?? "").localeCompare(b ?? "", "sv", { sensitivity: "base" });
}

/** Returnerar en ny array. Ursprungslistan lämnas orörd. */
export function sortBySwedishTitle<T extends { title?: string | null }>(
  items: readonly T[],
): T[] {
  return [...items].sort((left, right) =>
    compareSwedishTitles(left?.title, right?.title),
  );
}
