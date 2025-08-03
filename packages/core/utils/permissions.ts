import type { RoleTypes } from '../types';

export const RoleGroups: Record<string, RoleTypes[]> = {
  ALL_LOGGED_IN: ['admin', 'leader', 'user'],
  MANAGEMENT: ['admin', 'leader'],
  ADMIN_ONLY: ['admin'],
};

export const routePermissions: Record<string, RoleTypes[]> = {
  // === Group Management ===
  'POST /groups': RoleGroups.ADMIN_ONLY,
  'GET /groups': RoleGroups.ALL_LOGGED_IN,
  'GET /groups/{name}': RoleGroups.ALL_LOGGED_IN,
  'PATCH /groups/{name}': RoleGroups.MANAGEMENT,
  'DELETE /groups/{name}': RoleGroups.ADMIN_ONLY,
  'GET /groups/{groupSlug}/attendance/{date}': RoleGroups.ALL_LOGGED_IN,
  'GET /groups/{groupSlug}/attendance/status': RoleGroups.MANAGEMENT,
  'POST /groups/{groupSlug}/attendance/start': RoleGroups.MANAGEMENT,
  'POST /groups/{groupSlug}/attendance/register': RoleGroups.ALL_LOGGED_IN,
  'GET /groups/{groupSlug}/attendance/days': RoleGroups.MANAGEMENT,
  'POST /groups/batch-get': RoleGroups.ALL_LOGGED_IN,
  'GET /groups/public-list': RoleGroups.ALL_LOGGED_IN,

  // === User & Invite Management ===
  'POST /invites': RoleGroups.MANAGEMENT,
  'GET /groups/{groupName}/users': RoleGroups.MANAGEMENT,
  'DELETE /groups/{groupSlug}/users': RoleGroups.MANAGEMENT,
  'PATCH /groups/{groupSlug}/users': RoleGroups.MANAGEMENT,
  
  // === Auth & User Profile ===
  'GET /me': RoleGroups.ALL_LOGGED_IN,
  'POST /change-password': RoleGroups.ALL_LOGGED_IN,
  'POST /admin/change-password': RoleGroups.ADMIN_ONLY,
  
  // === Event Management ===
  'POST /groups/{groupSlug}/events': RoleGroups.MANAGEMENT,
  'GET /groups/{groupSlug}/events': RoleGroups.ALL_LOGGED_IN,
  'PUT /groups/{groupSlug}/events/{eventId}': RoleGroups.MANAGEMENT,
  'DELETE /groups/{groupSlug}/events/{eventId}': RoleGroups.MANAGEMENT,
  'POST /groups/{groupSlug}/events/batch': RoleGroups.MANAGEMENT,

  // === Material & Repertoire Management ===
  'POST /materials/upload-url': RoleGroups.ADMIN_ONLY,
  'POST /materials': RoleGroups.ADMIN_ONLY,
  'POST /practice/materials': RoleGroups.ADMIN_ONLY,
  'GET /materials': RoleGroups.ALL_LOGGED_IN,
  'GET /practice/materials': RoleGroups.ALL_LOGGED_IN,
  'DELETE /materials/{materialId}': RoleGroups.ADMIN_ONLY,
  'POST /materials/batch-delete': RoleGroups.ADMIN_ONLY,
  'GET /my-materials': RoleGroups.ALL_LOGGED_IN, // <-- KORRIGERAD
  'POST /groups/{groupName}/repertoires': RoleGroups.MANAGEMENT,
  'GET /groups/{groupName}/repertoires': RoleGroups.ALL_LOGGED_IN,
  'DELETE /groups/{groupName}/repertoires/{repertoireId}': RoleGroups.MANAGEMENT,
  'GET /groups/{groupName}/repertoires/{repertoireId}/materials': RoleGroups.ALL_LOGGED_IN,
  'POST /groups/{groupName}/repertoires/{repertoireId}/link-materials': RoleGroups.MANAGEMENT,
  'DELETE /groups/{groupName}/repertoires/{repertoireId}/materials/{materialId}': RoleGroups.MANAGEMENT,
  'POST /practice/upload-url': RoleGroups.ADMIN_ONLY,
  'POST /practice/batch-delete': RoleGroups.ADMIN_ONLY,
  'POST /materials/prepare-batch-upload': RoleGroups.ADMIN_ONLY,
  'GET /materials-by-path': RoleGroups.ADMIN_ONLY,
  'POST /groups/{groupName}/repertoires/from-library': RoleGroups.MANAGEMENT,
  'GET /practice/materials-by-week': RoleGroups.ADMIN_ONLY,
  'GET /practice/materials/member-view': RoleGroups.ALL_LOGGED_IN,
};