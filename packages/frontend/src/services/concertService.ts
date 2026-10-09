import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_CONCERT_API_URL as string | undefined;

function requireBaseUrl(): string {
  if (!API_BASE_URL?.trim()) {
    throw new Error(
      "VITE_CONCERT_API_URL is not configured. Add it to your .env file after deploying concert-api."
    );
  }
  return API_BASE_URL.replace(/\/$/, "");
}

function authHeaders(): { Authorization: string } {
  const token = localStorage.getItem("authToken");
  if (!token) {
    throw new Error("Authentication token is missing.");
  }
  return { Authorization: `Bearer ${token}` };
}

export type SharedConcert = {
  concertId: string;
  title: string;
  concertDate: string;
  location: string;
  description?: string;
  createdAt: string;
  signupCount: number;
  signupOpen: boolean;
  viewerIsSignedUp?: boolean;
  /** Optimistic-lock version for PATCH (from API). */
  version?: number;
  /** Absent today: every shared gig is for all choirs. */
  scope?: "all" | "groups";
  targets?: string[];
};

export const VOICE_PARTS = ["Sopran", "Alt", "Tenor", "Bas"] as const;
export type VoicePart = (typeof VOICE_PARTS)[number];

export type ConcertSignup = {
  userUuid: string;
  firstName: string;
  lastName: string;
  choirSlug: string;
  choirName?: string;
  /** Absent on signups created before voice part was collected. */
  voicePart?: VoicePart;
  createdAt: string;
  status: string;
};

export type CreateSharedConcertInput = {
  title: string;
  concertDate: string;
  location: string;
  description?: string;
};

export type ListSharedConcertsResult = {
  concerts: SharedConcert[];
  hasMore: boolean;
  nextBefore: string | null;
};

export type ListConcertSignupsResult = {
  concertId: string;
  signupCount: number;
  signups: ConcertSignup[];
  hasMore: boolean;
  nextBefore: string | null;
};

export type CreateConcertSignupInput = {
  firstName: string;
  lastName: string;
  choirSlug: string;
  voicePart: VoicePart;
};

export async function createSharedConcert(
  input: CreateSharedConcertInput
): Promise<SharedConcert> {
  const base = requireBaseUrl();
  const response = await axios.post<SharedConcert>(
    `${base}/shared-concerts`,
    {
      title: input.title.trim(),
      concertDate: input.concertDate.trim(),
      location: input.location.trim(),
      ...(input.description?.trim()
        ? { description: input.description.trim() }
        : {}),
    },
    {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
    }
  );
  return response.data;
}

export async function listSharedConcerts(options?: {
  limit?: number;
  before?: string | null;
}): Promise<ListSharedConcertsResult> {
  const base = requireBaseUrl();
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options?.before) {
    params.set("before", options.before);
  }
  const qs = params.toString();
  const response = await axios.get<{
    concerts?: SharedConcert[];
    hasMore?: boolean;
    nextBefore?: string | null;
  }>(`${base}/shared-concerts${qs ? `?${qs}` : ""}`, {
    headers: authHeaders(),
  });
  return {
    concerts: Array.isArray(response.data?.concerts)
      ? response.data.concerts
      : [],
    hasMore: Boolean(response.data?.hasMore),
    nextBefore: response.data?.nextBefore ?? null,
  };
}

export type UpdateSharedConcertInput = {
  title: string;
  concertDate: string;
  location: string;
  description?: string | null;
  version: number;
};

export async function updateSharedConcert(
  concertId: string,
  input: UpdateSharedConcertInput
): Promise<SharedConcert> {
  const id = concertId.trim();
  if (!id) {
    throw new Error("concertId is required.");
  }
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new Error("version is required.");
  }

  const base = requireBaseUrl();
  const description = input.description?.trim() ?? "";
  const response = await axios.patch<SharedConcert>(
    `${base}/shared-concerts/${encodeURIComponent(id)}`,
    {
      version: input.version,
      title: input.title.trim(),
      concertDate: input.concertDate.trim(),
      location: input.location.trim(),
      description: description || null,
    },
    {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
    }
  );
  return response.data;
}

export async function getSharedConcert(
  concertId: string
): Promise<SharedConcert> {
  const base = requireBaseUrl();
  const response = await axios.get<SharedConcert>(
    `${base}/shared-concerts/${encodeURIComponent(concertId)}`,
    { headers: authHeaders() }
  );
  return response.data;
}

export async function createConcertSignup(
  concertId: string,
  input: CreateConcertSignupInput
): Promise<ConcertSignup> {
  const base = requireBaseUrl();
  const response = await axios.post<ConcertSignup>(
    `${base}/shared-concerts/${encodeURIComponent(concertId)}/signups`,
    {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      choirSlug: input.choirSlug.trim(),
      voicePart: input.voicePart,
    },
    {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
    }
  );
  return response.data;
}

export async function listConcertSignups(
  concertId: string,
  options?: { limit?: number; before?: string | null }
): Promise<ListConcertSignupsResult> {
  const base = requireBaseUrl();
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options?.before) {
    params.set("before", options.before);
  }
  const qs = params.toString();
  const response = await axios.get<ListConcertSignupsResult>(
    `${base}/shared-concerts/${encodeURIComponent(concertId)}/signups${
      qs ? `?${qs}` : ""
    }`,
    { headers: authHeaders() }
  );
  return {
    concertId: response.data?.concertId ?? concertId,
    signupCount:
      typeof response.data?.signupCount === "number"
        ? response.data.signupCount
        : 0,
    signups: Array.isArray(response.data?.signups)
      ? response.data.signups
      : [],
    hasMore: Boolean(response.data?.hasMore),
    nextBefore: response.data?.nextBefore ?? null,
  };
}
