import { createAuthedClient } from '@/services/apiClient';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface AttendanceSession {
  code: string;
  expiresAt: number;
}

export interface AttendanceDay {
  date: string;
}

export interface PresentMember {
  givenName: string;
  familyName: string;
}

type RequestOptions = {
  signal?: AbortSignal;
};

/**
 * Ledarnärvaro läser och skriver mot admin-api, kör-scopad via slug i path.
 * GetItem/Query sker i Lambdan (GroupDateIndex). Klienten skickar bara känd slug och datum.
 */
function getApiClient() {
  if (!API_BASE_URL) {
    throw new Error('API Base URL is not configured. Check your .env file.');
  }
  return createAuthedClient(API_BASE_URL);
}

function requireGroupSlug(groupSlug: string): string {
  const slug = groupSlug.trim();
  if (!slug || slug.includes('/') || slug.includes('\\') || slug.includes('..')) {
    throw new Error('Ogiltig kör.');
  }
  return encodeURIComponent(slug);
}

function requireDate(date: string): string {
  const value = date.trim();
  if (!DATE_PATTERN.test(value)) {
    throw new Error('Ogiltigt datum.');
  }
  return value;
}

function readRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null;
  return data as Record<string, unknown>;
}

function parseSession(data: unknown, requireActiveFlag: boolean): AttendanceSession | null {
  const body = readRecord(data);
  if (!body) return null;
  if (requireActiveFlag && body.isActive !== true) return null;
  const code = body.attendanceCode;
  const expiresAt = body.expiresAt;
  if (typeof code !== 'string' || !code.trim()) return null;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
  return { code: code.trim(), expiresAt };
}

function parseDays(data: unknown): AttendanceDay[] {
  const body = readRecord(data);
  const raw = body?.attendanceDays;
  if (!Array.isArray(raw)) return [];
  const days: AttendanceDay[] = [];
  for (const item of raw) {
    const record = readRecord(item);
    const date = record?.date;
    if (typeof date === 'string' && DATE_PATTERN.test(date)) {
      days.push({ date });
    }
  }
  return days;
}

function parseMembers(data: unknown): PresentMember[] {
  const body = readRecord(data);
  const raw = body?.presentMembers;
  if (!Array.isArray(raw)) return [];
  const members: PresentMember[] = [];
  for (const item of raw) {
    const record = readRecord(item);
    if (!record) continue;
    const givenName = typeof record.givenName === 'string' ? record.givenName : '';
    const familyName = typeof record.familyName === 'string' ? record.familyName : '';
    if (!givenName && !familyName) continue;
    members.push({ givenName, familyName });
  }
  members.sort((a, b) => {
    const byFamily = a.familyName.localeCompare(b.familyName, 'sv');
    if (byFamily !== 0) return byFamily;
    return a.givenName.localeCompare(b.givenName, 'sv');
  });
  return members;
}

export async function getAttendanceStatus(
  groupSlug: string,
  options?: RequestOptions
): Promise<AttendanceSession | null> {
  const slug = requireGroupSlug(groupSlug);
  const response = await getApiClient().get(`/groups/${slug}/attendance/status`, {
    signal: options?.signal,
  });
  return parseSession(response.data, true);
}

export async function startAttendanceSession(
  groupSlug: string,
  options?: RequestOptions
): Promise<AttendanceSession> {
  const slug = requireGroupSlug(groupSlug);
  const response = await getApiClient().post(
    `/groups/${slug}/attendance/start`,
    {},
    { signal: options?.signal }
  );
  const session = parseSession(response.data, false);
  if (!session) {
    throw new Error('Kunde inte läsa närvarokoden.');
  }
  return session;
}

export async function listAttendanceDays(
  groupSlug: string,
  options?: RequestOptions
): Promise<AttendanceDay[]> {
  const slug = requireGroupSlug(groupSlug);
  const response = await getApiClient().get(`/groups/${slug}/attendance/days`, {
    signal: options?.signal,
  });
  return parseDays(response.data);
}

export async function listPresentMembers(
  groupSlug: string,
  date: string,
  options?: RequestOptions
): Promise<PresentMember[]> {
  const slug = requireGroupSlug(groupSlug);
  const day = requireDate(date);
  const response = await getApiClient().get(`/groups/${slug}/attendance/${day}`, {
    signal: options?.signal,
  });
  return parseMembers(response.data);
}
