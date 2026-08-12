// Client-Helfer für den internen Chat (Phase 3).
import { apiFetch } from './api';
import type { Conversation, ChatMessage, ChatPresence } from '../types';

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

export interface ChatSearchHit {
  id: string;
  conversationId: string;
  parentId: string | null; // gesetzt = Treffer stammt aus einem Thread
  authorId: string;
  authorName: string;
  body: string;
  attachType: 'ticket' | 'task' | 'file' | 'audio' | null;
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

// Anzeigename einer Unterhaltung: Gruppen tragen ihren Titel, DMs den Namen
// des jeweils ANDEREN Teilnehmers.
export function conversationTitle(c: Conversation, myUserId: string): string {
  if (c.kind === 'group') return c.title || 'Gruppe';
  const other = c.members.find((m) => m.userId !== myUserId);
  return other?.userName || 'Direktnachricht';
}
