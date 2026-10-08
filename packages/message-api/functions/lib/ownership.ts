/**
 * Admin may manage any message. A leader may manage only a message they created.
 * Everyone else is denied. Missing caller identity for a leader is 401.
 */
export type OwnershipDecision =
  | { allowed: true }
  | { allowed: false; statusCode: 401 | 403 };

export function evaluateMessageOwnership(
  role: string | undefined,
  callerUuid: string | undefined,
  createdByUuid: string | undefined
): OwnershipDecision {
  const normalizedRole = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (normalizedRole === "admin") {
    return { allowed: true };
  }

  if (normalizedRole !== "leader") {
    return { allowed: false, statusCode: 403 };
  }

  const uuid = typeof callerUuid === "string" ? callerUuid.trim() : "";
  if (!uuid) {
    return { allowed: false, statusCode: 401 };
  }

  const owner = typeof createdByUuid === "string" ? createdByUuid.trim() : "";
  if (!owner || owner !== uuid) {
    return { allowed: false, statusCode: 403 };
  }

  return { allowed: true };
}
