import { supabase } from './supabase';
import type { Role } from './profiles';
import type { AttendanceStatus } from './attendance';

// ------------------------------------------------------------
// Administrator services
// Every function here relies on the is_admin() RLS policies —
// even if someone called them from a non-admin session, the
// database would return no rows / reject the write.
// ------------------------------------------------------------

export type AdminStats = {
  users: number;
  events: number;
  records: number;
  present: number;
  late: number;
};

export type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
};

export type AdminAttendanceRow = {
  id: string;
  studentId: string;
  studentName: string | null;
  eventTitle: string;
  eventCode: string;
  scannedAt: string;
  status: AttendanceStatus;
};

async function countRows(table: string): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  return count ?? 0;
}

export async function getAdminStats(): Promise<AdminStats> {
  const [users, events, statusRows] = await Promise.all([
    countRows('profiles'),
    countRows('events'),
    supabase.from('attendance').select('status'),
  ]);

  const rows = (statusRows.data ?? []) as { status: string }[];
  const present = rows.filter((r) => r.status !== 'late').length;

  return {
    users,
    events,
    records: rows.length,
    present,
    late: rows.length - present,
  };
}

export async function listUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data as AdminUser[];
}

export async function setUserRole(
  userId: string,
  role: Role
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);

  // The protect_profile_role() trigger raises an exception when a
  // non-admin tries to change a role — surface that message.
  return { error: error?.message ?? null };
}

export async function listAllAttendance(): Promise<AdminAttendanceRow[]> {
  const [attendanceRes, eventsRes, profilesRes] = await Promise.all([
    supabase
      .from('attendance')
      .select('id, student_id, event_id, scanned_at, status')
      .order('scanned_at', { ascending: false }),
    supabase.from('events').select('id, event_code, title'),
    supabase.from('profiles').select('id, full_name, email'),
  ]);

  if (attendanceRes.error || !attendanceRes.data) return [];

  const eventMap: Record<string, { code: string; title: string }> = {};
  (eventsRes.data ?? []).forEach((e: any) => {
    eventMap[e.id] = { code: e.event_code, title: e.title };
  });

  const profileMap: Record<string, { name: string | null; email: string }> =
    {};
  (profilesRes.data ?? []).forEach((p: any) => {
    profileMap[p.id] = { name: p.full_name ?? null, email: p.email };
  });

  return (attendanceRes.data as any[]).map((row) => {
    const profile = profileMap[row.student_id];
    const event = eventMap[row.event_id];
    const studentName = profile
      ? profile.name ?? profile.email.split('@')[0]
      : null;
    return {
      id: row.id,
      studentId: row.student_id,
      studentName: studentName ?? `…${String(row.student_id).slice(-8)}`,
      eventTitle: event?.title ?? 'Unknown event',
      eventCode: event?.code ?? '',
      scannedAt: row.scanned_at,
      status: (row.status === 'late' ? 'late' : 'present') as AttendanceStatus,
    };
  });
}

// CORRECT an attendance record (present <-> late)
export async function setAttendanceStatus(
  attendanceId: string,
  status: AttendanceStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('attendance')
    .update({ status })
    .eq('id', attendanceId);

  return { error: error?.message ?? null };
}

// REMOVE a wrongly recorded attendance record
export async function removeAttendance(
  attendanceId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('attendance')
    .delete()
    .eq('id', attendanceId);

  return { error: error?.message ?? null };
}
