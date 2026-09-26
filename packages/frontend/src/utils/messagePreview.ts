/** Truncate message body for list previews (word-aware when possible). */
export function previewMessageBody(
  body: string,
  maxChars: number = 120
): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  const slice = normalized.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxChars * 0.5 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

export function formatMessageSender(name?: string | null): string {
  const n = typeof name === "string" ? name.trim() : "";
  return n.length > 0 ? n : "Admin";
}

/** Member-facing: given name only; "Admin" if name is missing. */
export function formatMessageSenderFirstName(
  givenName?: string | null,
  fullName?: string | null
): string {
  const given = typeof givenName === "string" ? givenName.trim() : "";
  if (given.length > 0) return given;

  const full = typeof fullName === "string" ? fullName.trim() : "";
  if (full.length > 0) {
    const first = full.split(/\s+/)[0];
    if (first) return first;
  }

  return "Admin";
}

/** Compact relative/absolute time for Aktuellt list rows. */
export function formatMessageListTime(
  iso: string,
  now: Date = new Date()
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "Nyss";
  if (diffMin < 60) return `${diffMin} min`;

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startOfMsg = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfMsg.getTime()) / 86_400_000
  );

  if (dayDiff === 0) {
    return date.toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (dayDiff === 1) return "Igår";
  if (dayDiff < 7) {
    return date.toLocaleDateString("sv-SE", { weekday: "short" });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("sv-SE", {
      day: "numeric",
      month: "short",
    });
  }
  return date.toLocaleDateString("sv-SE");
}
