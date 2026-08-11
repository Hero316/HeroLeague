// Client-Helfer für die Team-Zusammenarbeit (Tickets, Aufgaben, Benachrichtigungen).
import { apiFetch } from './api';
import type {
  Ticket,
  TicketComment,
  TicketPriority,
  TicketStatus,
  Task,
  TaskComment,
  TaskStatus,
  TeamMember,
  AppNotification,
  UserStatus,
  UserRole,
} from '../types';

// --- Team-Mitglieder & eigenes Profil ---------------------------------------
export const fetchTeam = () => apiFetch<TeamMember[]>('/api/team');

export const updateOwnProfile = (input: { name?: string; avatarUrl?: string; status?: UserStatus }) =>
  apiFetch<{ id: string; name: string; avatarUrl: string; status: UserStatus; role: UserRole }>(
    '/api/team?resource=profile',
    { method: 'POST', body: JSON.stringify(input) }
  );

// Schnelle Nachschlagekarte id -> Mitglied (für Avatare/Namen überall).
export function memberMap(team: TeamMember[]): Map<string, TeamMember> {
  return new Map(team.map((m) => [m.id, m]));
}

// --- Tickets ----------------------------------------------------------------
export const fetchTickets = () => apiFetch<Ticket[]>('/api/tickets');
export const fetchTicket = (id: string) => apiFetch<Ticket>(`/api/tickets?id=${encodeURIComponent(id)}`);

export const createTicket = (input: {
  title: string;
  description: string;
  priority: TicketPriority;
  category: string;
  images: string[];
}) => apiFetch<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify(input) });

export const updateTicket = (
  id: string,
  patch: { status?: TicketStatus; priority?: TicketPriority; category?: string; assignedTo?: string | null }
) => apiFetch<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify({ id, ...patch }) });

export const deleteTicket = (id: string) =>
  apiFetch<{ ok: boolean }>('/api/tickets', { method: 'POST', body: JSON.stringify({ id, op: 'delete' }) });

export const addTicketComment = (ticketId: string, body: string, images: string[] = []) =>
  apiFetch<TicketComment>('/api/tickets?sub=comment', {
    method: 'POST',
    body: JSON.stringify({ ticketId, body, images }),
  });

// --- Aufgaben ---------------------------------------------------------------
export const fetchTasksForWeek = (isoWeek: string) =>
  apiFetch<Task[]>(`/api/tasks?week=${encodeURIComponent(isoWeek)}`);
export const fetchAllTasks = () => apiFetch<Task[]>('/api/tasks');
export const fetchTasksRange = (from: string, to: string) =>
  apiFetch<Task[]>(`/api/tasks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
export const fetchTask = (id: string) => apiFetch<Task>(`/api/tasks?id=${encodeURIComponent(id)}`);

export const createTask = (input: {
  title: string;
  notes?: string;
  dueDate?: string | null;
  isoWeek?: string | null;
  status?: TaskStatus;
  priority?: TicketPriority;
  assignees?: string[];
}) => apiFetch<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(input) });

export const updateTask = (
  id: string,
  patch: {
    title?: string;
    notes?: string;
    dueDate?: string | null;
    isoWeek?: string | null;
    status?: TaskStatus;
    priority?: TicketPriority;
    assignees?: string[];
  }
) => apiFetch<Task>('/api/tasks', { method: 'POST', body: JSON.stringify({ id, ...patch }) });

export const deleteTask = (id: string) =>
  apiFetch<{ ok: boolean }>('/api/tasks', { method: 'POST', body: JSON.stringify({ id, op: 'delete' }) });

export const addTaskComment = (taskId: string, body: string) =>
  apiFetch<TaskComment>('/api/tasks?sub=comment', { method: 'POST', body: JSON.stringify({ taskId, body }) });

// --- Benachrichtigungen -----------------------------------------------------
export const fetchNotifications = () =>
  apiFetch<{ items: AppNotification[]; unreadCount: number }>('/api/notifications');
export const markNotificationRead = (id: string) =>
  apiFetch('/api/notifications', { method: 'POST', body: JSON.stringify({ id }) });
export const markAllNotificationsRead = () =>
  apiFetch('/api/notifications', { method: 'POST', body: JSON.stringify({ all: true }) });

// --- Kalenderwochen-Helfer (ISO 8601, Woche beginnt Montag) -----------------
export function isoWeekOf(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mo=0 … So=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Donnerstag dieser Woche
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function parseIsoWeek(iso: string): { year: number; week: number } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), week: Number(m[2]) };
}

// Montag (00:00 UTC) einer ISO-Woche.
export function mondayOfIsoWeek(iso: string): Date {
  const parsed = parseIsoWeek(iso) ?? parseIsoWeek(isoWeekOf(new Date()))!;
  const jan4 = new Date(Date.UTC(parsed.year, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Dow);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (parsed.week - 1) * 7);
  return monday;
}

// Die sieben Tage (Mo–So) einer ISO-Woche als { date: 'YYYY-MM-DD', label, weekday }.
export function daysOfIsoWeek(iso: string): { date: string; label: string; weekday: string }[] {
  const monday = mondayOfIsoWeek(iso);
  const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  return weekdays.map((wd, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const label = `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return { date, label, weekday: wd };
  });
}

// Nachbarwoche (offset -1/+1) als ISO-Woche.
export function shiftIsoWeek(iso: string, offset: number): string {
  const monday = mondayOfIsoWeek(iso);
  monday.setUTCDate(monday.getUTCDate() + offset * 7);
  return isoWeekOf(monday);
}
