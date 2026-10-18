import { supabase } from './supabase';
import { parseQRPayload } from './qr';
import { getEventByCode } from './events';

export type AttendanceStatus = 'present' | 'late';

export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
  status: AttendanceStatus;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
};

export type TeacherEventAttendance = {
  eventId: string;
  eventCode: string;
  title: string;
  eventStatus: 'open' | 'closed';
  createdAt: string | null;
  startTime: string | null;
  endTime: string | null;
  attendeeCount: number;
  attendees: {
    studentId: string;
    studentName: string | null;
    scannedAt: string;
    status: AttendanceStatus;
  }[];
};

export type TeacherEventSummary = {
  eventId: string;
  eventCode: string;
  title: string;
  attendeeCount: number;
};

// Grace period: a scan within 15 minutes of the event start is
// "present"; after that it is recorded as "late".
const LATE_GRACE_MS = 15 * 60 * 1000;

export async function registerAttendance(
  rawPayload: string,
  studentId: string
): Promise<RegisterResult> {
  const parsed = parseQRPayload(rawPayload);
  if (!parsed.ok) {
    return { success: false, message: parsed.message };
  }
  const payload = parsed.payload;

  // The event MUST already exist (created by a teacher/admin).
  // Unknown codes are rejected instead of inventing an event.
  const event = await getEventByCode(payload.event);
  if (!event) {
    return {
      success: false,
      message: 'Invalid QR code: unknown event code.',
    };
  }

  // Closed events reject every scan (validation requirement).
  if (event.status === 'closed') {
    return {
      success: false,
      message: `Event "${event.title}" is closed.`,
      eventTitle: event.title,
    };
  }

  // Time window comes from the DATABASE event (source of truth),
  // falling back to the QR payload for older records.
  const now = Date.now();
  const startRaw = event.start_time ?? payload.start ?? null;
  const endRaw = event.end_time ?? payload.end ?? null;
  const start = startRaw ? new Date(startRaw).getTime() : null;
  const end = endRaw ? new Date(endRaw).getTime() : null;

  if (start && now < start) {
    return { success: false, message: 'Event has not started yet.' };
  }
  if (end && now > end) {
    return {
      success: false,
      message: 'Event has already ended.',
      eventTitle: event.title,
    };
  }

  const status: AttendanceStatus =
    start && now > start + LATE_GRACE_MS ? 'late' : 'present';

  const { error: attError } = await supabase.from('attendance').insert([
    {
      student_id: studentId,
      event_id: event.id,
      status,
    },
  ]);

  if (attError) {
    if (attError.code === '23505') {
      return {
        success: false,
        message: 'Already registered for this event.',
        eventTitle: event.title,
      };
    }
    return { success: false, message: attError.message };
  }

  return {
    success: true,
    message:
      status === 'late'
        ? 'Attendance recorded! (Late — after the grace period)'
        : 'Attendance recorded! (Present)',
    eventTitle: event.title,
  };
}

export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, scanned_at, status, events ( event_code, title )')
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as any[]).map((row: any) => ({
    id: row.id,
    eventId: row.events?.event_code ?? '',
    eventTitle: row.events?.title ?? '',
    scannedAt: row.scanned_at,
    status: (row.status === 'late' ? 'late' : 'present') as AttendanceStatus,
  }));
}

export async function getTeacherEventAttendance(
  teacherId: string
): Promise<TeacherEventAttendance[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title, status, created_at, start_time, end_time')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError || !events) return [];

  const eventIds = (events as any[]).map((e: any) => e.id);
  if (eventIds.length === 0) return [];

  // NOTE: attendance.student_id references auth.users, NOT profiles,
  // so a direct `profiles (...)` join often fails (no FK) and returns error
  // -> which previously caused empty lists ("No scans yet" + count 0).
  // Fix: 2-step fetch — attendance rows first, then profiles separately.
  const { data: attendance, error: attError } = await supabase
    .from('attendance')
    .select('student_id, scanned_at, event_id, status')
    .in('event_id', eventIds)
    .order('scanned_at', { ascending: false });

  if (attError || !attendance) {
    return (events as any[]).map((e: any) => ({
      eventId: e.id,
      eventCode: e.event_code,
      title: e.title,
      eventStatus: e.status === 'closed' ? 'closed' : 'open',
      createdAt: e.created_at ?? null,
      startTime: e.start_time,
      endTime: e.end_time,
      attendeeCount: 0,
      attendees: [],
    }));
  }

  // Fetch student profiles in one query to get the name/email
  // (e.g. "jhonny321") even when full_name is missing.
  const studentIds = [...new Set((attendance as any[]).map((a: any) => a.student_id))];
  let profileMap: Record<string, { full_name: string | null; email: string | null }> = {};
  if (studentIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', studentIds);
    (profiles as any[] | null)?.forEach((p: any) => {
      profileMap[p.id] = { full_name: p.full_name ?? null, email: p.email ?? null };
    });
  }

  return (events as any[]).map((e: any) => {
    const rows = (attendance as any[]).filter(
      (a: any) => a.event_id === e.id
    );
    return {
      eventId: e.id,
      eventCode: e.event_code,
      title: e.title,
      eventStatus: e.status === 'closed' ? 'closed' : 'open',
      createdAt: e.created_at ?? null,
      startTime: e.start_time,
      endTime: e.end_time,
      attendeeCount: rows.length,
      attendees: rows.map((a: any) => {
        const prof = profileMap[a.student_id];
        // Fallback chain: full_name -> email prefix (e.g. jhonny321) -> null
        // (UI will fallback pa to shortId if gihapon null)
        const studentName =
          prof?.full_name ??
          (typeof prof?.email === 'string' ? prof.email.split('@')[0] : null) ??
          null;
        return {
          studentId: a.student_id,
          studentName,
          scannedAt: a.scanned_at,
          status: (a.status === 'late' ? 'late' : 'present') as AttendanceStatus,
        };
      }),
    };
  });
}

export async function getTeacherEventSummary(
  teacherId: string
): Promise<TeacherEventSummary[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError || !events) return [];

  const eventIds = (events as any[]).map((e: any) => e.id);
  if (eventIds.length === 0) return [];

  const { data: attRows, error: attError } = await supabase
    .from('attendance')
    .select('event_id')
    .in('event_id', eventIds);

  if (attError || !attRows) {
    return (events as any[]).map((e: any) => ({
      eventId: e.id,
      eventCode: e.event_code,
      title: e.title,
      attendeeCount: 0,
    }));
  }

  const counts: Record<string, number> = {};
  (attRows as any[]).forEach((r: any) => {
    counts[r.event_id] = (counts[r.event_id] ?? 0) + 1;
  });

  return (events as any[]).map((e: any) => ({
    eventId: e.id,
    eventCode: e.event_code,
    title: e.title,
    attendeeCount: counts[e.id] ?? 0,
  }));
}
