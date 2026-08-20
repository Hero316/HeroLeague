import { useEffect, useState } from 'react';
import { TicketDetail } from './TicketSystem';
import { TaskDetail } from './TaskBoard';
import { fetchTeam, fetchTask } from '../lib/collab';
import type { TeamMember, Task } from '../types';

// Öffnet aus einer Benachrichtigung (Push oder Glocke) direkt das Ticket bzw.
// die Aufgabe als Detail-Fenster – unabhängig davon, wo man gerade ist. Die
// Detail-Komponenten sind eigenständige Modals; hier laden wir nur das Nötige.
export default function DeepLinkModal({
  target,
  currentUserId,
  isSuperadmin,
  canManageTickets,
  onClose,
}: {
  target: { type: 'ticket' | 'task'; id: string };
  currentUserId: string;
  isSuperadmin: boolean;
  canManageTickets: boolean;
  onClose: () => void;
}) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [task, setTask] = useState<Task | null>(null);

  useEffect(() => {
    fetchTeam().then(setTeam).catch(() => {});
  }, []);

  useEffect(() => {
    if (target.type === 'task') {
      fetchTask(target.id)
        .then(setTask)
        .catch(() => {
          alert('Aufgabe nicht gefunden (evtl. gelöscht).');
          onClose();
        });
    }
    // Nur bei Ziel-Wechsel neu laden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.type, target.id]);

  if (target.type === 'ticket') {
    return (
      <TicketDetail
        ticketId={target.id}
        team={team}
        canManage={canManageTickets}
        onClose={onClose}
        onChanged={() => {}}
      />
    );
  }
  if (task) {
    return (
      <TaskDetail
        task={task}
        team={team}
        currentUserId={currentUserId}
        isSuperadmin={isSuperadmin}
        onClose={onClose}
        onChanged={() => {}}
      />
    );
  }
  return null; // Aufgabe wird noch geladen
}
