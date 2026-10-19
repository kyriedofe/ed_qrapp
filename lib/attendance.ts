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

export type EventAttendee = {
  attendanceId: string;
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  scannedAt: string;
  status: AttendanceStatus;
};

export type EventNonAttendee = {
  studentId: string;
  studentName: string;
  studentEmail: string | null;
};

export type EventAttendanceDetail = {
  attendees: EventAttendee[];
  nonAttendees: EventNonAttendee[];
};

export type MyAttendanceRecord = {
  id: string;
  status: AttendanceStatus;
  scannedAt: string;
} | null;

function displayName(
  fullName: string | null | undefined,
  email: string | null | undefined,
  fallbackId: string
): string {
  if (fullName && fullName.trim()) return fullName;
  if (email) return email.split('@')[0];
  return `…${fallbackId.slice(-8)}`;
}

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

// ------------------------------------------------------------
// Student helpers
// ------------------------------------------------------------

// Event UUIDs the student has already checked in to.
export async function getStudentAttendedEventIds(
  studentId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('attendance')
    .select('event_id')
    .eq('student_id', studentId);

  if (error || !data) return new Set();
  return new Set((data as { event_id: string }[]).map((row) => row.event_id));
}

export async function getStudentAttendanceForEvent(
  studentId: string,
  eventId: string
): Promise<MyAttendanceRecord> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, status, scanned_at')
    .eq('student_id', studentId)
    .eq('event_id', eventId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as { id: string; status: string; scanned_at: string };
  return {
    id: row.id,
    status: row.status === 'late' ? 'late' : 'present',
    scannedAt: row.scanned_at,
  };
}

// ------------------------------------------------------------
// Manager helpers (teacher: own events / admin: all events)
// ------------------------------------------------------------

// Number of attendees per event, keyed by event id.
export async function getAttendanceCounts(
  eventIds: string[]
): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {};

  const { data, error } = await supabase
    .from('attendance')
    .select('event_id')
    .in('event_id', eventIds);

  if (error || !data) return {};

  const counts: Record<string, number> = {};
  (data as { event_id: string }[]).forEach((row) => {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
  });
  return counts;
}

// Full attendance picture for one event: who checked in and who
// did not. Non-attendees come from a security-definer RPC so the
// teacher sees the list without reading private profiles directly.
export async function getEventAttendanceDetail(
  eventId: string
): Promise<EventAttendanceDetail> {
  const { data: rows, error } = await supabase
    .from('attendance')
    .select('id, student_id, scanned_at, status')
    .eq('event_id', eventId)
    .order('scanned_at', { ascending: true });

  const attendanceRows = error ? [] : ((rows ?? []) as any[]);
  const studentIds = [...new Set(attendanceRows.map((r) => r.student_id))];

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

  const attendees: EventAttendee[] = attendanceRows.map((row) => {
    const profile = profileMap[row.student_id];
    return {
      attendanceId: row.id,
      studentId: row.student_id,
      studentName: displayName(
        profile?.full_name,
        profile?.email,
        row.student_id
      ),
      studentEmail: profile?.email ?? null,
      scannedAt: row.scanned_at,
      status: (row.status === 'late' ? 'late' : 'present') as AttendanceStatus,
    };
  });

  const { data: missing, error: missingError } = await supabase.rpc(
    'event_non_attendees',
    { p_event_id: eventId }
  );

  const nonAttendees: EventNonAttendee[] =
    missingError || !missing
      ? []
      : (missing as any[]).map((p) => ({
          studentId: p.student_id,
          studentName: displayName(p.full_name, p.email, p.student_id),
          studentEmail: p.email ?? null,
        }));

  return { attendees, nonAttendees };
}

export async function updateAttendanceStatus(
  attendanceId: string,
  status: AttendanceStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('attendance')
    .update({ status })
    .eq('id', attendanceId);

  return { error: error?.message ?? null };
}

export async function deleteAttendanceRecord(
  attendanceId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('attendance')
    .delete()
    .eq('id', attendanceId);

  return { error: error?.message ?? null };
}
