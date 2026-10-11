/** Synkron spärr så att uppladdning och radering inte startar ovanpå varandra. */
let activeOp: string | null = null;

export function tryBeginMaterialOp(op: string): boolean {
  if (activeOp) return false;
  activeOp = op;
  return true;
}

export function endMaterialOp(op: string): void {
  if (activeOp === op) activeOp = null;
}
