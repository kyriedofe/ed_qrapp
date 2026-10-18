import { supabase } from './supabase';

export type EventStatus = 'open' | 'closed';

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
