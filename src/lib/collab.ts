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
  Idea,
  IdeaComment,
  IdeaStatus,
  LinkItem,
  AppUser,
  HeroEvent,
} from '../types';

// --- Team-Mitglieder & eigenes Profil ---------------------------------------
export const fetchTeam = () => apiFetch<TeamMember[]>('/api/team');

// Super-Admin: alle Nutzer (für „Personen verwalten") und Entfernen aus der Team-App.
export const fetchAllUsers = () => apiFetch<AppUser[]>('/api/users');
export const purgeUserFromTeamApp = (userId: string, deleteAccount = false) =>
  apiFetch<{ ok: boolean; deleted: boolean }>('/api/team?resource=purge-user', {
    method: 'POST',
    body: JSON.stringify({ userId, deleteAccount }),
  });

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
  links?: LinkItem[];
  assignedTo?: string | null;
}) => apiFetch<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify(input) });

export const updateTicket = (
  id: string,
  patch: { status?: TicketStatus; priority?: TicketPriority; category?: string; assignedTo?: string | null }
) => apiFetch<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify({ id, ...patch }) });

// Link-Tasten eines Tickets setzen – darf jeder (op:'links', ohne Super-Admin).
export const updateTicketLinks = (id: string, links: LinkItem[]) =>
  apiFetch<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify({ id, op: 'links', links }) });

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
  type?: 'termin' | 'aufgabe' | 'beides';
  dueDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  isoWeek?: string | null;
  status?: TaskStatus;
  priority?: TicketPriority;
  assignees?: string[];
  links?: LinkItem[];
}) => apiFetch<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(input) });

export const updateTask = (
  id: string,
  patch: {
    title?: string;
    notes?: string;
    type?: 'termin' | 'aufgabe' | 'beides';
    dueDate?: string | null;
    endDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    isoWeek?: string | null;
    status?: TaskStatus;
    priority?: TicketPriority;
    assignees?: string[];
    links?: LinkItem[];
  }
) => apiFetch<Task>('/api/tasks', { method: 'POST', body: JSON.stringify({ id, ...patch }) });

export const deleteTask = (id: string) =>
  apiFetch<{ ok: boolean }>('/api/tasks', { method: 'POST', body: JSON.stringify({ id, op: 'delete' }) });

export const addTaskComment = (
  taskId: string,
  body: string,
  attach?: { attachType: 'file' | 'audio'; attachUrl: string; attachMime: string; attachTitle: string } | null,
) =>
  apiFetch<TaskComment>('/api/tasks?sub=comment', {
    method: 'POST',
    body: JSON.stringify({ taskId, body, ...(attach ?? {}) }),
  });

// Beitrag im Aufgaben-Verlauf bearbeiten (nur eigener) – gibt den aktualisierten zurück.
export const editTaskComment = (commentId: string, body: string) =>
  apiFetch<TaskComment>('/api/tasks?sub=comment', {
    method: 'PATCH',
    body: JSON.stringify({ commentId, body }),
  });

// Beitrag für alle löschen (nur eigener).
export const deleteTaskComment = (commentId: string) =>
  apiFetch<{ ok: boolean; id: string }>(`/api/tasks?sub=comment&commentId=${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ commentId }),
  });

// Emoji-Reaktion auf einen Aufgaben-Beitrag umschalten – gibt die neue Liste zurück.
export const reactTaskComment = (commentId: string, emoji: string) =>
  apiFetch<{ commentId: string; reactions: { userId: string; emoji: string }[] }>('/api/tasks?sub=comment-react', {
    method: 'POST',
    body: JSON.stringify({ commentId, emoji }),
  });

// --- Ideen (Brainstorm) -----------------------------------------------------
export const fetchIdeas = () => apiFetch<Idea[]>('/api/team?resource=ideas');
export const fetchIdea = (id: string) => apiFetch<Idea>(`/api/team?resource=idea&id=${encodeURIComponent(id)}`);

export const createIdea = (input: { title: string; memberIds: string[] }) =>
  apiFetch<Idea>('/api/team?resource=ideas', { method: 'POST', body: JSON.stringify(input) });

export const updateIdea = (
  id: string,
  patch: { title?: string; status?: IdeaStatus; summary?: string; memberIds?: string[]; links?: LinkItem[] }
) => apiFetch<Idea>('/api/team?resource=idea', { method: 'POST', body: JSON.stringify({ id, ...patch }) });

export const deleteIdea = (id: string) =>
  apiFetch<{ ok: boolean }>('/api/team?resource=idea', { method: 'POST', body: JSON.stringify({ id, op: 'delete' }) });

// Idee in Aufgabe/Termin umwandeln – gibt die aktualisierte Idee zurück (mit linkedTaskId).
export const convertIdea = (id: string, convertType: 'termin' | 'aufgabe' | 'beides') =>
  apiFetch<Idea>('/api/team?resource=idea', { method: 'POST', body: JSON.stringify({ id, op: 'convert', convertType }) });

export const addIdeaComment = (
  ideaId: string,
  body: string,
  attach?: { attachType: 'file' | 'audio'; attachUrl: string; attachMime: string; attachTitle: string } | null,
) =>
  apiFetch<IdeaComment>('/api/team?resource=idea-comment', {
    method: 'POST',
    body: JSON.stringify({ ideaId, body, ...(attach ?? {}) }),
  });

// Beitrag bearbeiten (nur eigener) – gibt den aktualisierten Beitrag zurück.
export const editIdeaComment = (commentId: string, body: string) =>
  apiFetch<IdeaComment>('/api/team?resource=idea-comment', {
    method: 'PATCH',
    body: JSON.stringify({ commentId, body }),
  });

// Beitrag für alle löschen (nur eigener).
export const deleteIdeaComment = (commentId: string) =>
  apiFetch<{ ok: boolean; id: string }>(`/api/team?resource=idea-comment&commentId=${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ commentId }),
  });

// Emoji-Reaktion auf einen Beitrag umschalten – gibt die neue Reaktionsliste zurück.
export const reactIdeaComment = (commentId: string, emoji: string) =>
  apiFetch<{ commentId: string; reactions: { userId: string; emoji: string }[] }>('/api/team?resource=idea-comment-react', {
    method: 'POST',
    body: JSON.stringify({ commentId, emoji }),
  });

// --- Benachrichtigungen -----------------------------------------------------
export const fetchNotifications = () =>
  apiFetch<{ items: AppNotification[]; unreadCount: number }>('/api/notifications');
export const markNotificationRead = (id: string) =>
  apiFetch('/api/notifications', { method: 'POST', body: JSON.stringify({ id }) });
export const markAllNotificationsRead = () =>
  apiFetch('/api/notifications', { method: 'POST', body: JSON.stringify({ all: true }) });

// --- Hero-Punkte (Belohnung fürs Abschließen) -------------------------------
export const fetchHeroEvents = () =>
  apiFetch<{ items: HeroEvent[]; total: number; month: number }>('/api/team?resource=hero-events');
export const markHeroEventsSeen = (ids?: string[]) =>
  apiFetch('/api/team?resource=hero-events', {
    method: 'POST',
    body: JSON.stringify(ids && ids.length ? { ids } : { all: true }),
  });

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
