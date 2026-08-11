// Client-Helfer für den internen Chat (Phase 3).
import { apiFetch } from './api';
import type { Conversation, ChatMessage } from '../types';

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

// Anzeigename einer Unterhaltung: Gruppen tragen ihren Titel, DMs den Namen
// des jeweils ANDEREN Teilnehmers.
export function conversationTitle(c: Conversation, myUserId: string): string {
  if (c.kind === 'group') return c.title || 'Gruppe';
  const other = c.members.find((m) => m.userId !== myUserId);
  return other?.userName || 'Direktnachricht';
}
