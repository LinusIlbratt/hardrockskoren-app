import type { RoleTypes } from '@hrk/core/types';

export interface Material {
  materialId: string;
  title?: string; // Här definierar vi den som valfri, en gång för alla.
  fileKey: string;
  fileType?: string;
}   

export interface Event {
  eventId: string;
  title: string;
  eventDate: string;
  endDate?: string;
  // Detta är det korrekta fältet från din databas
  eventType: 'REHEARSAL' | 'CONCERT' | string; 
  location?: string;
  description?: string;
  // Detta fält verkar alltid vara "Event", så vi kan göra det valfritt
  type?: string; 
}

export interface GroupMember {
  id: string;
  email: string;
  given_name: string;
  family_name: string;
  role: RoleTypes;
}