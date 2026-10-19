import { supabase } from './supabase';

export type NotificationKind = 'new' | 'closed';

export type AppNotification = {
  id: string;
  eventId: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
};

type NotificationRow = {
  id: string;
  event_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
};

// ------------------------------------------------------------
// In-app notifications are written by database triggers when a
// teacher creates or closes an event. The app only reads them
// and marks them as read. If the Part II migration has not been
// run yet, every function fails gracefully (empty list).
// ------------------------------------------------------------

function mapRow(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    eventId: row.event_id,
    kind: row.kind === 'closed' ? 'closed' : 'new',
    title: row.title,
    body: row.body,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

export async function getNotifications(
  userId: string,
  limit = 50
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, event_id, kind, title, body, is_read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as NotificationRow[]).map(mapRow);
}

export async function getUnreadNotificationCount(
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) return 0;
  return count ?? 0;
}

export async function markNotificationRead(
  notificationId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  return { error: error?.message ?? null };
}

export async function markAllNotificationsRead(
  userId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  return { error: error?.message ?? null };
}
