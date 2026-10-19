-- ============================================================
-- QR-ATT — PART II MIGRATION
-- Event management, in-app notifications, and attendance tools.
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard -> SQL Editor
--   2. Paste the ENTIRE file
--   3. Click "Run"
--
-- This script is IDEMPOTENT: it can be run multiple times safely.
-- Run it AFTER the original schema.sql (Part I).
--
-- What it adds:
--   * events: delete policy (creator or admin)
--   * attendance: teachers can correct/remove records for their events
--   * notifications table (+ RLS) for student in-app notifications
--   * triggers that notify students when an event is created/closed
--   * RPCs: student_count(), event_non_attendees(event_id)
-- ============================================================

-- ------------------------------------------------------------
-- 1. EVENTS — allow the creator and admins to DELETE an event.
-- (attendance rows are removed automatically by ON DELETE CASCADE)
-- ------------------------------------------------------------
drop policy if exists "Creators and administrators can delete events" on public.events;
create policy "Creators and administrators can delete events"
  on public.events for delete
  using (auth.uid() = created_by or public.is_admin());

-- ------------------------------------------------------------
-- 2. ATTENDANCE — teachers may correct/remove records for the
-- events they created (admins already have global policies).
-- ------------------------------------------------------------
drop policy if exists "Teachers can update attendance for their events" on public.attendance;
create policy "Teachers can update attendance for their events"
  on public.attendance for update
  using (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and e.created_by = auth.uid()
    )
  );

drop policy if exists "Teachers can delete attendance for their events" on public.attendance;
create policy "Teachers can delete attendance for their events"
  on public.attendance for delete
  using (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and e.created_by = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 3. NOTIFICATIONS TABLE
-- One row per student per event per kind ('new' | 'closed').
-- The UNIQUE constraint prevents the same notification from
-- being shown repeatedly on refresh.
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  kind text not null default 'new' check (kind in ('new', 'closed')),
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, event_id, kind)
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, is_read, created_at desc);

alter table public.notifications enable row level security;

-- Students (and any signed-in user) only see their own notifications.
drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own notifications" on public.notifications;
create policy "Users can delete their own notifications"
  on public.notifications for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 4. NOTIFICATION TRIGGERS
-- security definer lets the trigger insert rows for every
-- student even though the teacher cannot read all profiles.
-- ------------------------------------------------------------
create or replace function public.notify_students_new_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.notifications (user_id, event_id, kind, title, body)
  select
    p.id,
    new.id,
    'new',
    'New attendance event: ' || new.title,
    coalesce(
      to_char(new.start_time, 'Mon DD, YYYY at HH12:MI AM'),
      'Schedule to be announced'
    )
  from public.profiles p
  where p.role = 'student'
  on conflict (user_id, event_id, kind) do nothing;

  return new;
end;
$$;

drop trigger if exists on_event_created_notify on public.events;
create trigger on_event_created_notify
  after insert on public.events
  for each row execute procedure public.notify_students_new_event();

create or replace function public.notify_students_event_closed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    insert into public.notifications (user_id, event_id, kind, title, body)
    select
      p.id,
      new.id,
      'closed',
      'Event closed: ' || new.title,
      'Attendance is no longer accepted for this event.'
    from public.profiles p
    where p.role = 'student'
    on conflict (user_id, event_id, kind) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_event_closed_notify on public.events;
create trigger on_event_closed_notify
  after update of status on public.events
  for each row execute procedure public.notify_students_event_closed();

-- ------------------------------------------------------------
-- 5. RPC: total number of student accounts.
-- Used by the Admin/Teacher dashboard statistics cards.
-- ------------------------------------------------------------
create or replace function public.student_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.profiles where role = 'student';
$$;

grant execute on function public.student_count() to authenticated;

-- ------------------------------------------------------------
-- 6. RPC: students who have NOT checked in to an event.
-- Only the event creator or an administrator may call it; the
-- security definer function keeps other profiles private.
-- ------------------------------------------------------------
create or replace function public.event_non_attendees(p_event_id uuid)
returns table (student_id uuid, full_name text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.email
  from public.profiles p
  where p.role = 'student'
    and exists (
      select 1 from public.events e
      where e.id = p_event_id
        and (e.created_by = auth.uid() or public.is_admin())
    )
    and not exists (
      select 1 from public.attendance a
      where a.event_id = p_event_id
        and a.student_id = p.id
    )
  order by p.full_name nulls last, p.email;
$$;

grant execute on function public.event_non_attendees(uuid) to authenticated;
