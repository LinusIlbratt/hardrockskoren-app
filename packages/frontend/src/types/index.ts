import type { RoleTypes } from '@hrk/core/types';

export type { RoleTypes } from '@hrk/core/types';

export type EventType = 'REHEARSAL' | 'CONCERT';

export function isEventType(value: unknown): value is EventType {
  return value === 'REHEARSAL' || value === 'CONCERT';
}

/** Kör från list-/batch-get. `id` och `description` saknas i en del listor som bara visar namn. */
export interface Group {
  id?: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
}

export interface Material {
  materialId: string;
  title?: string;
  fileKey: string;
  fileType?: string;
  filePath?: string;
  createdAt?: string;
  /** Visningsnamn sparat på repertoarlänken, inte i biblioteket. */
  voiceLabel?: string;
  songTitle?: string;
}

export interface Event {
  eventId: string;
  groupSlug: string;
  title: string;
  eventDate: string;
  endDate: string;
  eventType: EventType;
  location?: string;
  description: string | null;
  type?: string;
  createdAt: string;
  updatedAt: string;
  descriptionUpdatedAt: string | null;
  lastUpdatedFields: string[];
}

export interface GroupMember {
  id: string;
  email: string;
  given_name: string;
  family_name: string;
  role: RoleTypes;
  /** Sätts i medlemslistan så redigering träffar rätt kör. */
  groupSlug?: string;
  /** Visas bara när listan samlar flera körer. */
  choirName?: string;
}
