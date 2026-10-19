import { supabase } from './supabase';
import type { Role } from './profiles';

export type EventStatus = 'open' | 'closed';

export type EventPhase = 'upcoming' | 'ongoing' | 'closed';

export type ManagerStats = {
  students: number;
  notCheckedIn: number;
  events: number;
  active: number;
  closed: number;
  records: number;
};

export type Event = {
  eventId: string;
  title: string;
  venue?: string;
  description?: string;
  start: string;
  end: string;
};

export type EventUpdates = {
  title?: string;
  venue?: string;
  description?: string;
  start?: string;
  end?: string;
};

export type CloudEvent = {
  id: string;
  event_code: string;
  title: string;
  venue: string | null;
  description: string | null;
  status: EventStatus;
  start_time: string | null;
  end_time: string | null;
  created_by: string | null;
  created_at: string;
};

// CREATE — plain insert (NOT upsert) so re-using an existing
// event code is rejected instead of silently overwriting it.
export async function createEvent(
  event: Event
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('events').insert([
    {
      event_code: event.eventId.trim(),
      title: event.title.trim(),
      venue: event.venue?.trim() || null,
      description: event.description?.trim() || null,
      start_time: event.start || null,
      end_time: event.end || null,
      status: 'open',
      created_by: user?.id ?? null,
    },
  ]);

  if (error) {
    if (error.code === '23505') {
      return { error: 'Event code already exists. Use a unique code.' };
    }
    return { error: error.message };
  }
  return { error: null };
}

// EDIT — update an existing event (creator or administrator).
export async function updateEvent(
  eventId: string,
  updates: EventUpdates
): Promise<{ error: string | null }> {
  const payload: Record<string, string | null> = {};
  if (updates.title !== undefined) payload.title = updates.title.trim();
  if (updates.venue !== undefined) payload.venue = updates.venue.trim() || null;
  if (updates.description !== undefined)
    payload.description = updates.description.trim() || null;
  if (updates.start !== undefined) payload.start_time = updates.start || null;
  if (updates.end !== undefined) payload.end_time = updates.end || null;

  const { error } = await supabase
    .from('events')
    .update(payload)
    .eq('id', eventId);

  return { error: error?.message ?? null };
}

// CLOSE / REOPEN — flips the event status. A closed event rejects
// every further QR scan ("This event is closed.").
export async function setEventStatus(
  eventId: string,
  status: EventStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('events')
    .update({ status })
    .eq('id', eventId);

  return { error: error?.message ?? null };
}

export async function getEventsByTeacher(
  teacherId: string
): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as CloudEvent[];
}

// Every event the signed-in user may see (RLS = authenticated).
// Used by the Student "Events" tab and the Admin dashboard.
export async function getAllEvents(): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as CloudEvent[];
}

export async function getEventByCode(
  code: string
): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('event_code', code)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CloudEvent;
}

export async function getEventById(
  id: string
): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CloudEvent;
}

// Events the signed-in manager may manage: admins see every event,
// teachers only the events they created (also enforced by RLS).
export async function getEventsForManager(
  role: Role,
  userId: string
): Promise<CloudEvent[]> {
  if (role === 'admin') {
    return getAllEvents();
  }
  return getEventsByTeacher(userId);
}

// DELETE — creator or administrator (enforced by RLS).
// Attendance rows for the event are removed by the database cascade.
export async function deleteEvent(
  eventId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  return { error: error?.message ?? null };
}

// ------------------------------------------------------------
// Event phase helpers.
// The database keeps the lifecycle flag (open/closed); the
// Upcoming / Ongoing label is derived from the scheduled times.
// ------------------------------------------------------------
export function getEventPhase(
  event: Pick<CloudEvent, 'status' | 'start_time' | 'end_time'>
): EventPhase {
  if (event.status === 'closed') return 'closed';

  const now = Date.now();
  const start = event.start_time ? new Date(event.start_time).getTime() : null;
  const end = event.end_time ? new Date(event.end_time).getTime() : null;

  if (start !== null && now < start) return 'upcoming';
  if (end !== null && now > end) return 'closed';
  return 'ongoing';
}

export function getEventPhaseLabel(phase: EventPhase): string {
  if (phase === 'upcoming') return 'Upcoming';
  if (phase === 'ongoing') return 'Ongoing';
  return 'Closed';
}

// ------------------------------------------------------------
// Dashboard statistics — real database values only.
// Admin: campus-wide. Teacher: scoped to their own events.
// ------------------------------------------------------------
export async function getManagerStats(
  role: Role,
  userId: string
): Promise<ManagerStats> {
  const events = await getEventsForManager(role, userId);
  const eventIds = events.map((e) => e.id);

  const active = events.filter((e) => e.status === 'open').length;
  const closed = events.length - active;

  let records = 0;
  if (role === 'admin') {
    const { count } = await supabase
      .from('attendance')
      .select('*', { count: 'exact', head: true });
    records = count ?? 0;
  } else if (eventIds.length > 0) {
    const { count } = await supabase
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .in('event_id', eventIds);
    records = count ?? 0;
  }

  // Total students comes from a security-definer RPC so teachers
  // can see the real number without reading private profiles.
  let students = 0;
  const { data: studentCount, error: studentError } = await supabase.rpc(
    'student_count'
  );
  if (!studentError && studentCount !== null) {
    students = Number(studentCount);
  }

  // How many students have NOT checked in to anything yet. We read
  // the distinct checked-in student ids (own events for teachers,
  // all events for admins) which RLS already scopes correctly, then
  // subtract them from the total student count.
  const checkedInIds = new Set<string>();
  if (eventIds.length > 0) {
    const { data: checkInRows } = await supabase
      .from('attendance')
      .select('student_id')
      .in('event_id', eventIds);
    (checkInRows as { student_id: string }[] | null)?.forEach((row) => {
      checkedInIds.add(row.student_id);
    });
  }

  const notCheckedIn = Math.max(students - checkedInIds.size, 0);

  return {
    students,
    notCheckedIn,
    events: events.length,
    active,
    closed,
    records,
  };
}
