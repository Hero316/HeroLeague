// Client-Helfer für den internen Chat (Phase 3).
import { apiFetch } from './api';
import type { Conversation, ChatMessage, ChatPresence, MessageReaction, Poll } from '../types';

export const fetchConversations = () =>
  apiFetch<Conversation[]>('/api/chat?resource=conversations');

export const createGroup = (title: string, memberIds: string[]) =>
  apiFetch<{ id: string }>('/api/chat?resource=conversations', {
    method: 'POST',
    body: JSON.stringify({ kind: 'group', title, memberIds }),
  });

export const startDm = (userId: string) =>
  apiFetch<{ id: string; existing?: boolean }>('/api/chat?resource=conversations', {
    method: 'POST',
    body: JSON.stringify({ kind: 'dm', userId }),
  });

export const fetchMessages = (conversationId: string, parentId?: string) =>
  apiFetch<ChatMessage[]>(
    `/api/chat?resource=messages&conversationId=${encodeURIComponent(conversationId)}` +
      (parentId ? `&parentId=${encodeURIComponent(parentId)}` : '')
  );

export const sendMessage = (input: {
  conversationId: string;
  body: string;
  parentId?: string | null;
  attachType?: 'ticket' | 'task' | 'file' | 'audio' | null;
  attachId?: string | null;
  attachTitle?: string | null;
  attachUrl?: string | null;
  attachMime?: string | null;
}) => apiFetch<ChatMessage>('/api/chat?resource=messages', { method: 'POST', body: JSON.stringify(input) });

// Abstimmung (Umfrage) erstellen. Antwort = die neue (Träger-)Nachricht inkl. poll.
export const createPoll = (input: {
  conversationId: string;
  question: string;
  options: string[];
  multiple?: boolean;
  anonymous?: boolean;
  refType?: 'ticket' | 'task' | null;
  refId?: string | null;
  refTitle?: string | null;
}) => apiFetch<ChatMessage>('/api/chat?resource=poll', { method: 'POST', body: JSON.stringify(input) });

// Stimme setzen/umschalten. Antwort = aktueller Poll-Zustand.
export const votePoll = (pollId: string, optionId: string) =>
  apiFetch<Poll>('/api/chat?resource=vote', { method: 'POST', body: JSON.stringify({ pollId, optionId }) });

// Emoji-Reaktion setzen/umschalten. Antwort = aktuelle Reaktionsliste.
export const reactMessage = (messageId: string, emoji: string) =>
  apiFetch<{ messageId: string; reactions: MessageReaction[] }>('/api/chat?resource=react', {
    method: 'POST',
    body: JSON.stringify({ messageId, emoji }),
  });

// Eigene Nachricht bearbeiten (gibt die aktualisierte Nachricht zurück).
export const editMessage = (messageId: string, body: string) =>
  apiFetch<ChatMessage>('/api/chat?resource=messages', { method: 'PATCH', body: JSON.stringify({ messageId, body }) });

// Eigene Nachricht für alle zurücknehmen. messageId zusätzlich im Query, falls
// der DELETE-Body serverseitig nicht geparst wird.
export const deleteMessage = (messageId: string) =>
  apiFetch<{ ok: true; id: string }>(`/api/chat?resource=messages&messageId=${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ messageId }),
  });

export const markConversationRead = (conversationId: string) =>
  apiFetch('/api/chat?resource=read', { method: 'POST', body: JSON.stringify({ conversationId }) });

// Präsenz: Heartbeat senden (optional mit „ich tippe in dieser Unterhaltung").
// typingConversationId=null ⇒ nur Online-Heartbeat, Tipp-Status wird gelöscht.
export const sendPresence = (typingConversationId: string | null) =>
  apiFetch('/api/chat?resource=presence', { method: 'POST', body: JSON.stringify({ typingConversationId }) });

// Präsenz abfragen: wer ist online + wer tippt in der geöffneten Unterhaltung.
export const fetchPresence = (conversationId?: string) =>
  apiFetch<ChatPresence>(
    '/api/chat?resource=presence' + (conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : '')
  );

// Gruppe verwalten (nur Super-Admin)
export const updateGroup = (conversationId: string, patch: { title?: string; avatarUrl?: string }) =>
  apiFetch('/api/chat?resource=group', { method: 'POST', body: JSON.stringify({ conversationId, ...patch }) });
export const addGroupMember = (conversationId: string, userId: string) =>
  apiFetch('/api/chat?resource=member', { method: 'POST', body: JSON.stringify({ conversationId, userId, op: 'add' }) });
export const removeGroupMember = (conversationId: string, userId: string) =>
  apiFetch('/api/chat?resource=member', { method: 'POST', body: JSON.stringify({ conversationId, userId, op: 'remove' }) });

// Unterhaltung löschen (DM/eigene Gruppe) bzw. Gruppe verlassen (normales Mitglied).
export const deleteConversation = (conversationId: string) =>
  apiFetch<{ ok: boolean; deleted?: string; left?: boolean }>('/api/chat?resource=delete', {
    method: 'POST',
    body: JSON.stringify({ conversationId }),
  });

export interface ChatSearchHit {
  id: string;
  conversationId: string;
  parentId: string | null; // gesetzt = Treffer stammt aus einem Thread
  authorId: string;
  authorName: string;
  body: string;
  attachType: 'ticket' | 'task' | 'file' | 'audio' | 'poll' | null;
  createdAt: string;
  convKind: 'group' | 'dm';
  convTitle: string;
}
// Optional auf eine Unterhaltung eingrenzen (Lupe im einzelnen Chat, inkl. Threads).
export const searchChat = (q: string, conversationId?: string) =>
  apiFetch<ChatSearchHit[]>(
    `/api/chat?resource=search&q=${encodeURIComponent(q)}` +
      (conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : '')
  );

// Ungelesene Threads (Übersicht auf der Chat-Seite, „damit nichts untergeht").
export interface ThreadSummary {
  parentId: string;
  conversationId: string;
  authorName: string; // Autor der Eltern-Nachricht
  body: string; // Eltern-Snippet (leer wenn gelöscht)
  attachType: 'ticket' | 'task' | 'file' | 'audio' | 'poll' | null;
  convKind: 'group' | 'dm';
  source: string; // Gruppenname bzw. DM-Partnername
  unreadCount: number;
  lastReplyAt: string | null;
  lastReplyAuthor: string | null;
}
export const fetchThreads = () => apiFetch<ThreadSummary[]>('/api/chat?resource=threads');

// Anzeigename einer Unterhaltung: Gruppen tragen ihren Titel, DMs den Namen
// des jeweils ANDEREN Teilnehmers.
export function conversationTitle(c: Conversation, myUserId: string): string {
  if (c.kind === 'group') return c.title || 'Gruppe';
  const other = c.members.find((m) => m.userId !== myUserId);
  return other?.userName || 'Direktnachricht';
}
