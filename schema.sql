-- ============================================================
-- QR-ATT — Supabase PostgreSQL Schema (Part I Final Project)
--
-- Tables:   profiles, events, attendance (+ auth.users)
-- Roles:    student, teacher, admin
-- Security: Row Level Security (RLS) on every table,
--           is_admin() / is_event_manager() helpers,
--           trigger that blocks non-admins from changing roles.
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard -> SQL Editor
--   2. Paste the ENTIRE file
--   3. Click "Run"
--   4. Verify the tables appear under Table Editor
--
-- This script is IDEMPOTENT: it can be run multiple times safely.
--
-- BOOTSTRAP THE FIRST ADMIN (run once after this script):
--   update public.profiles
--   set role = 'admin'
--   where email = 'your.email@school.edu';
--   (Only an existing admin — or this SQL Editor session — can
--    grant the admin role; sign-ups can never self-select it.)
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILES TABLE
-- Stored per-user profile that references Supabase Auth.
-- Created automatically for each new signed-up user.
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade older databases: widen the role check to allow 'admin'.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'teacher', 'admin'));

alter table public.profiles enable row level security;

-- ------------------------------------------------------------
-- 1b. HELPER FUNCTIONS (used inside RLS policies)
-- security definer = runs with the function owner's rights so a
-- user's own role can always be read, even by RLS-filtered rows.
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.is_event_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('teacher', 'admin')
  );
$$;

-- ------------------------------------------------------------
-- 1c. PROFILES POLICIES
-- ------------------------------------------------------------
drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Administrators can view every profile (user management screen)
drop policy if exists "Administrators can view all profiles" on public.profiles;
create policy "Administrators can view all profiles"
  on public.profiles for select
  using (public.is_admin());

-- Administrators can change any profile (role assignment)
drop policy if exists "Administrators can update any profile" on public.profiles;
create policy "Administrators can update any profile"
  on public.profiles for update
  using (public.is_admin());

-- ------------------------------------------------------------
-- 1d. AUTO-PROFILE TRIGGER
-- Reads the sign-up metadata so the profile row (name + role)
-- is created in ONE database step. The role is sanitized here:
-- sign-up may only choose student/teacher — never admin.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_full_name text;
  v_role text;
begin
  v_full_name := nullif(new.raw_user_meta_data ->> 'full_name', '');
  v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'student');

  if v_role not in ('student', 'teacher') then
    v_role := 'student';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, v_full_name, v_role);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 1e. ROLE-PROTECTION TRIGGER
-- The "Users can update their own profile" policy allows a user
-- to UPDATE their own row — without this trigger a student could
-- rewrite their own role to 'admin'. Only an existing admin may
-- change a role (sign-up role is set by handle_new_user above).
-- ------------------------------------------------------------
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only administrators can change account roles';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute procedure public.protect_profile_role();

-- ------------------------------------------------------------
-- 2. EVENTS TABLE
-- `event_code` is the public identifier embedded in the QR code.
-- `status`  open  = attendance can be recorded
--           closed = scanning is rejected (Close Event button)
-- ------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  title text not null,
  venue text,
  description text,
  status text not null default 'open' check (status in ('open', 'closed')),
  start_time timestamptz,
  end_time timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Upgrade older databases: add the Part I columns if missing.
alter table public.events add column if not exists venue text;
alter table public.events add column if not exists description text;
alter table public.events add column if not exists status text not null default 'open';
alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('open', 'closed'));

alter table public.events enable row level security;

-- Events policies
-- Any signed-in user can read events (students view available
-- events, the scanner validates the QR against this row)
drop policy if exists "Events are readable by any authenticated user" on public.events;
create policy "Events are readable by any authenticated user"
  on public.events for select
  using (auth.role() = 'authenticated');

-- Only teachers / admins may create events, and only as owner.
-- (closes the old gap where any student could insert an event)
drop policy if exists "Users can insert events" on public.events;
create policy "Users can insert events"
  on public.events for insert
  with check (auth.uid() = created_by and public.is_event_manager());

-- Creators can edit / close their own events
drop policy if exists "Users can update their own events" on public.events;
create policy "Users can update their own events"
  on public.events for update
  using (auth.uid() = created_by);

-- Administrators can manage every event
drop policy if exists "Administrators can update any event" on public.events;
create policy "Administrators can update any event"
  on public.events for update
  using (public.is_admin());

-- ------------------------------------------------------------
-- 3. ATTENDANCE TABLE
-- `status` present = scanned within the grace period after start
--          late    = scanned after the grace period
-- UNIQUE (student_id, event_id) prevents duplicate attendance.
-- ------------------------------------------------------------
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  status text not null default 'present' check (status in ('present', 'late')),
  scanned_at timestamptz not null default now(),
  unique (student_id, event_id)
);

-- Upgrade older databases: add the status column if missing.
alter table public.attendance add column if not exists status text not null default 'present';
alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status in ('present', 'late'));

alter table public.attendance enable row level security;

-- Attendance policies
-- Students can only view / insert their own attendance
drop policy if exists "Students can view their own attendance" on public.attendance;
create policy "Students can view their own attendance"
  on public.attendance for select
  using (auth.uid() = student_id);

drop policy if exists "Students can insert their own attendance" on public.attendance;
create policy "Students can insert their own attendance"
  on public.attendance for insert
  with check (auth.uid() = student_id);

-- Teachers can view attendance for events they created
drop policy if exists "Teachers can view attendance for their events" on public.attendance;
create policy "Teachers can view attendance for their events"
  on public.attendance for select
  using (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and e.created_by = auth.uid()
    )
  );

-- Administrators can view / correct / remove ANY attendance record
drop policy if exists "Administrators can view all attendance" on public.attendance;
create policy "Administrators can view all attendance"
  on public.attendance for select
  using (public.is_admin());

drop policy if exists "Administrators can update attendance" on public.attendance;
create policy "Administrators can update attendance"
  on public.attendance for update
  using (public.is_admin());

drop policy if exists "Administrators can delete attendance" on public.attendance;
create policy "Administrators can delete attendance"
  on public.attendance for delete
  using (public.is_admin());

-- Teachers can read profiles of students who attended their events
-- (needed to show attendee names in the teacher's History view).
drop policy if exists "Teachers can view profiles of their attendees" on public.profiles;
create policy "Teachers can view profiles of their attendees"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.attendance a
      join public.events e on e.id = a.event_id
      where a.student_id = profiles.id
        and e.created_by = auth.uid()
    )
  );

------------------------------------------------------------
-- END OF SCHEMA
------------------------------------------------------------

-- ============================================================
-- PART II — Event management, notifications, attendance tools
-- (same SQL as part2-migration.sql; idempotent)
-- ============================================================

-- Allow the creator and admins to delete an event.
-- Attendance rows are removed automatically (ON DELETE CASCADE).
drop policy if exists "Creators and administrators can delete events" on public.events;
create policy "Creators and administrators can delete events"
  on public.events for delete
  using (auth.uid() = created_by or public.is_admin());

-- Teachers may correct/remove attendance for their own events.
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

-- Notifications: one row per student per event per kind.
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

-- Trigger: notify every student when a new event is created.
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

-- Trigger: notify every student when an event is closed.
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

-- RPC: total number of student accounts (dashboard stats).
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

-- RPC: students who have not checked in to an event.
-- Callable only by the event creator or an administrator.
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
