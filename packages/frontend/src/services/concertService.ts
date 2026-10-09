import { createAuthedClient } from "@/services/apiClient";
import { getAuthHeaders } from "@/utils/authHeaders";

const API_BASE_URL = import.meta.env.VITE_CONCERT_API_URL as string | undefined;

function requireBaseUrl(): string {
  if (!API_BASE_URL?.trim()) {
    throw new Error(
      "VITE_CONCERT_API_URL is not configured. Add it to your .env file after deploying concert-api."
    );
  }
  return API_BASE_URL.replace(/\/$/, "");
}

function client() {
  if (!getAuthHeaders().Authorization) {
    throw new Error("Authentication token is missing.");
  }
  return createAuthedClient(requireBaseUrl());
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
  const response = await client().post<SharedConcert>("/shared-concerts", {
    title: input.title.trim(),
    concertDate: input.concertDate.trim(),
    location: input.location.trim(),
    ...(input.description?.trim()
      ? { description: input.description.trim() }
      : {}),
  });
  return response.data;
}

export async function listSharedConcerts(options?: {
  limit?: number;
  before?: string | null;
  signal?: AbortSignal;
}): Promise<ListSharedConcertsResult> {
  const response = await client().get<{
    concerts?: SharedConcert[];
    hasMore?: boolean;
    nextBefore?: string | null;
  }>("/shared-concerts", {
    signal: options?.signal,
    params: {
      ...(options?.limit !== undefined ? { limit: options.limit } : {}),
      ...(options?.before ? { before: options.before } : {}),
    },
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

  const description = input.description?.trim() ?? "";
  const response = await client().patch<SharedConcert>(
    `/shared-concerts/${encodeURIComponent(id)}`,
    {
      version: input.version,
      title: input.title.trim(),
      concertDate: input.concertDate.trim(),
      location: input.location.trim(),
      description: description || null,
    }
  );
  return response.data;
}

export async function getSharedConcert(
  concertId: string
): Promise<SharedConcert> {
  const id = concertId.trim();
  if (!id) {
    throw new Error("concertId is required.");
  }
  const response = await client().get<SharedConcert>(
    `/shared-concerts/${encodeURIComponent(id)}`
  );
  return response.data;
}

export async function createConcertSignup(
  concertId: string,
  input: CreateConcertSignupInput
): Promise<ConcertSignup> {
  const id = concertId.trim();
  if (!id) {
    throw new Error("concertId is required.");
  }
  const response = await client().post<ConcertSignup>(
    `/shared-concerts/${encodeURIComponent(id)}/signups`,
    {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      choirSlug: input.choirSlug.trim(),
      voicePart: input.voicePart,
    }
  );
  return response.data;
}

export async function listConcertSignups(
  concertId: string,
  options?: { limit?: number; before?: string | null; signal?: AbortSignal }
): Promise<ListConcertSignupsResult> {
  const id = concertId.trim();
  if (!id) {
    throw new Error("concertId is required.");
  }
  const response = await client().get<ListConcertSignupsResult>(
    `/shared-concerts/${encodeURIComponent(id)}/signups`,
    {
      signal: options?.signal,
      params: {
        ...(options?.limit !== undefined ? { limit: options.limit } : {}),
        ...(options?.before ? { before: options.before } : {}),
      },
    }
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
