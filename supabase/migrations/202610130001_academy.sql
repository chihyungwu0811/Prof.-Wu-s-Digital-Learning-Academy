-- Prof. Wu's Digital Learning Academy — Supabase schema
-- Apply once in Supabase SQL Editor. Enable email confirmations in Auth settings.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  organization text not null default '',
  country text not null default '',
  email_verified boolean not null default false,
  status text not null default 'Pending Approval' check (status in ('Pending Approval','Active','Suspended')),
  role text not null default 'student' check (role in ('student','admin')),
  created timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null default 'Engineering',
  published boolean not null default false,
  created timestamptz not null default now()
);

create table if not exists public.grants (
  student uuid not null references public.profiles(id) on delete cascade,
  subject uuid not null references public.subjects(id) on delete cascade,
  expires date,
  primary key (student, subject)
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  subject uuid not null references public.subjects(id) on delete cascade,
  chapter text not null default 'Getting Started',
  title text not null,
  type text not null default 'reading' check (type in ('reading','interactive','quiz','pdf','video','custom')),
  body text not null default '',
  asset text,
  published boolean not null default false,
  position integer not null default 0,
  created timestamptz not null default now()
);

-- Correct answers and explanations are never directly readable by learners.
create table if not exists public.lesson_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  position integer not null default 0,
  prompt text not null check (length(prompt) between 1 and 2000),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  correct_index integer not null check (correct_index >= 0 and correct_index < jsonb_array_length(options)),
  explanation text not null default '' check (length(explanation) <= 1000),
  unique (lesson_id, position)
);

create table if not exists public.progress (
  student uuid not null references public.profiles(id) on delete cascade,
  lesson uuid not null references public.lessons(id) on delete cascade,
  completed boolean not null default false,
  score integer check (score between 0 and 100),
  updated timestamptz not null default now(),
  primary key (student, lesson)
);

create table if not exists public.audit (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null references public.profiles(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created timestamptz not null default now()
);

create or replace function public.is_academy_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.status = 'Active' and p.email_verified);
$$;

create or replace function public.is_active_academy_student()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'Active' and p.email_verified);
$$;

create or replace function public.has_academy_subject_access(p_subject_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_academy_admin() or (
    public.is_active_academy_student() and exists (
      select 1 from public.grants g where g.student = (select auth.uid()) and g.subject = p_subject_id and (g.expires is null or g.expires >= current_date)
    )
  );
$$;

create or replace function public.create_academy_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,email,email_verified,name,organization,country)
  values (
    new.id,
    coalesce(new.email,''),
    new.email_confirmed_at is not null,
    left(coalesce(new.raw_user_meta_data->>'name',''),120),
    left(coalesce(new.raw_user_meta_data->>'organization',''),200),
    left(coalesce(new.raw_user_meta_data->>'country',''),100)
  ) on conflict (id) do update set email = excluded.email, email_verified = excluded.email_verified;
  return new;
end;
$$;

drop trigger if exists on_academy_auth_user_created on auth.users;
create trigger on_academy_auth_user_created after insert or update on auth.users
for each row execute function public.create_academy_profile();

create or replace function public.update_my_academy_profile(p_name text, p_organization text, p_country text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Enter a name (maximum 120 characters).'; end if;
  update public.profiles set name = trim(p_name), organization = left(coalesce(p_organization,''),200), country = left(coalesce(p_country,''),100)
  where id = auth.uid() and role = 'student';
  if not found then raise exception 'Profile not found.'; end if;
end;
$$;

create or replace function public.admin_set_student_status(p_ids uuid[], p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_academy_admin() then raise exception 'Administrator access required.'; end if;
  if p_status not in ('Active','Suspended','Pending Approval') or cardinality(p_ids) > 500 or auth.uid() = any(p_ids) then raise exception 'Invalid status selection.'; end if;
  if p_status = 'Active' and exists(select 1 from public.profiles where id = any(p_ids) and not email_verified) then raise exception 'Verify the email address before approving this account.'; end if;
  update public.profiles set status = p_status where id = any(p_ids) and role = 'student';
end;
$$;

create or replace function public.admin_batch_subject_access(p_student_ids uuid[], p_subject_ids uuid[], p_expires date default null, p_revoke boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_academy_admin() then raise exception 'Administrator access required.'; end if;
  if cardinality(p_student_ids) < 1 or cardinality(p_subject_ids) < 1 or cardinality(p_student_ids) * cardinality(p_subject_ids) > 500 then raise exception 'Select up to 500 student-subject assignments.'; end if;
  if not p_revoke and p_expires is not null and p_expires < current_date then raise exception 'Choose a future expiration date.'; end if;
  if not p_revoke and exists(select 1 from public.profiles where id = any(p_student_ids) and (status <> 'Active' or role <> 'student' or not email_verified)) then raise exception 'Grant access only to verified, approved students.'; end if;
  if p_revoke then
    delete from public.grants where student = any(p_student_ids) and subject = any(p_subject_ids);
  else
    insert into public.grants(student,subject,expires)
    select s.id, t.id, p_expires from unnest(p_student_ids) s(id) cross join unnest(p_subject_ids) t(id)
    on conflict (student,subject) do update set expires = excluded.expires;
  end if;
end;
$$;

create or replace function public.get_student_quiz_questions(p_lesson_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.lessons l where l.id = p_lesson_id and l.type = 'quiz' and l.published and public.has_academy_subject_access(l.subject)) then raise exception 'Lesson not found or access is unavailable.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('prompt',q.prompt,'options',q.options) order by q.position),'[]'::jsonb) into result
  from public.lesson_questions q where q.lesson_id = p_lesson_id;
  return result;
end;
$$;

create or replace function public.complete_academy_lesson(p_lesson_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_academy_student() or not exists(select 1 from public.lessons l where l.id=p_lesson_id and l.published and l.type <> 'quiz' and public.has_academy_subject_access(l.subject)) then raise exception 'Lesson not found or access is unavailable.'; end if;
  insert into public.progress(student,lesson,completed,updated) values(auth.uid(),p_lesson_id,true,now())
  on conflict(student,lesson) do update set completed=true,updated=excluded.updated;
end;
$$;

create or replace function public.submit_academy_quiz(p_lesson_id uuid, p_answers integer[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare question_count integer; correct_count integer; result_rows jsonb; final_score integer;
begin
  if not public.is_active_academy_student() or not exists(select 1 from public.lessons l where l.id=p_lesson_id and l.published and l.type='quiz' and public.has_academy_subject_access(l.subject)) then raise exception 'Quiz not found or access is unavailable.'; end if;
  select count(*) into question_count from public.lesson_questions where lesson_id=p_lesson_id;
  if question_count < 1 or cardinality(p_answers) <> question_count then raise exception 'Answer every question.'; end if;
  if exists(select 1 from unnest(p_answers) a where a < 0) then raise exception 'Invalid answer.'; end if;
  select count(*) into correct_count from public.lesson_questions q join unnest(p_answers) with ordinality a(answer,idx) on a.idx=q.position+1 and a.answer=q.correct_index where q.lesson_id=p_lesson_id;
  select coalesce(jsonb_agg(jsonb_build_object('correct',a.answer=q.correct_index,'explanation',q.explanation) order by q.position),'[]'::jsonb)
  into result_rows from public.lesson_questions q join unnest(p_answers) with ordinality a(answer,idx) on a.idx=q.position+1 where q.lesson_id=p_lesson_id;
  final_score := round(100.0 * correct_count / question_count);
  insert into public.progress(student,lesson,completed,score,updated) values(auth.uid(),p_lesson_id,true,final_score,now())
  on conflict(student,lesson) do update set completed=true,score=excluded.score,updated=excluded.updated;
  return jsonb_build_object('score',final_score,'results',result_rows,'correct',final_score=100);
end;
$$;

alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.grants enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_questions enable row level security;
alter table public.progress enable row level security;
alter table public.audit enable row level security;

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated using (id = (select auth.uid()) or public.is_academy_admin());
drop policy if exists subjects_read_catalog on public.subjects;
create policy subjects_read_catalog on public.subjects for select to authenticated using (public.is_academy_admin() or (published and public.is_active_academy_student()));
drop policy if exists subjects_admin_write on public.subjects;
create policy subjects_admin_write on public.subjects for all to authenticated using (public.is_academy_admin()) with check (public.is_academy_admin());
drop policy if exists grants_read_self_or_admin on public.grants;
create policy grants_read_self_or_admin on public.grants for select to authenticated using (student = (select auth.uid()) or public.is_academy_admin());
drop policy if exists grants_admin_write on public.grants;
create policy grants_admin_write on public.grants for all to authenticated using (public.is_academy_admin()) with check (public.is_academy_admin());
drop policy if exists lessons_read_authorized on public.lessons;
create policy lessons_read_authorized on public.lessons for select to authenticated using (public.is_academy_admin() or (published and exists(select 1 from public.subjects s where s.id=subject and s.published) and public.has_academy_subject_access(subject)));
drop policy if exists lessons_admin_write on public.lessons;
create policy lessons_admin_write on public.lessons for all to authenticated using (public.is_academy_admin()) with check (public.is_academy_admin());
drop policy if exists questions_admin_all on public.lesson_questions;
create policy questions_admin_all on public.lesson_questions for all to authenticated using (public.is_academy_admin()) with check (public.is_academy_admin());
drop policy if exists progress_read_self_or_admin on public.progress;
create policy progress_read_self_or_admin on public.progress for select to authenticated using (student = (select auth.uid()) or public.is_academy_admin());
drop policy if exists audit_admin_all on public.audit;
create policy audit_admin_all on public.audit for all to authenticated using (public.is_academy_admin()) with check (public.is_academy_admin());

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
revoke all on public.subjects, public.grants, public.lessons, public.lesson_questions, public.progress, public.audit from anon, authenticated;
grant select, insert, update, delete on public.subjects, public.grants, public.lessons, public.lesson_questions, public.audit to authenticated;
grant select on public.progress to authenticated;

revoke all on function public.update_my_academy_profile(text,text,text) from public;
revoke all on function public.admin_set_student_status(uuid[],text) from public;
revoke all on function public.admin_batch_subject_access(uuid[],uuid[],date,boolean) from public;
revoke all on function public.get_student_quiz_questions(uuid) from public;
revoke all on function public.complete_academy_lesson(uuid) from public;
revoke all on function public.submit_academy_quiz(uuid,integer[]) from public;
grant execute on function public.update_my_academy_profile(text,text,text) to authenticated;
grant execute on function public.admin_set_student_status(uuid[],text) to authenticated;
grant execute on function public.admin_batch_subject_access(uuid[],uuid[],date,boolean) to authenticated;
grant execute on function public.get_student_quiz_questions(uuid) to authenticated;
grant execute on function public.complete_academy_lesson(uuid) to authenticated;
grant execute on function public.submit_academy_quiz(uuid,integer[]) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('lesson-assets','lesson-assets',false,26214400,array['application/pdf','video/mp4','text/html'])
on conflict (id) do update set public=false,file_size_limit=26214400,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists lesson_assets_admin_upload on storage.objects;
create policy lesson_assets_admin_upload on storage.objects for insert to authenticated with check (bucket_id='lesson-assets' and public.is_academy_admin());
drop policy if exists lesson_assets_admin_update on storage.objects;
create policy lesson_assets_admin_update on storage.objects for update to authenticated using (bucket_id='lesson-assets' and public.is_academy_admin()) with check (bucket_id='lesson-assets' and public.is_academy_admin());
drop policy if exists lesson_assets_admin_delete on storage.objects;
create policy lesson_assets_admin_delete on storage.objects for delete to authenticated using (bucket_id='lesson-assets' and public.is_academy_admin());
drop policy if exists lesson_assets_authorized_read on storage.objects;
create policy lesson_assets_authorized_read on storage.objects for select to authenticated using (
  bucket_id='lesson-assets' and (
    public.is_academy_admin() or exists (
      select 1 from public.lessons l where l.asset = name and l.published and public.has_academy_subject_access(l.subject)
    )
  )
);

-- After creating the owner account with the signup form and confirming its email,
-- promote it once in SQL Editor (replace the email if a different administrator is desired):
-- update public.profiles set role='admin', status='Active' where lower(email)=lower('chihyungwu@gmail.com') and email_verified;
