import type { RoleTypes } from '@hrk/core/types';

export interface Material {
  materialId: string;
  title?: string; // Här definierar vi den som valfri, en gång för alla.
  fileKey: string;
  fileType?: string;
  filePath?: string;
  createdAt?: string;
}   

export interface Event {
  eventId: string;
  groupSlug: string; // Saknades, men finns i datan
  title: string;
  eventDate: string;   // ISO-sträng
  endDate: string;     // ISO-sträng (alltid obligatorisk enligt din create-logik)
  eventType: 'REHEARSAL' | 'CONCERT' | string;
  location?: string;
  description: string | null; // Mer exakt än valfri
  type?: string;

  // Fält som saknades och orsakade felet:
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
}