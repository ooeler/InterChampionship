-- Die letzten 10 Verbesserungsvorschläge sehen alle Mitglieder, ohne Namen und Text. Idempotent.
create or replace function public.recent_feedback()
returns table (title text, status text, issue_number int, issue_url text, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select f.title, f.status, f.issue_number, f.issue_url, f.created_at, f.user_id = auth.uid()
  from public.feedback f
  where public.my_role() is not null
  order by f.created_at desc
  limit 10
$$;
revoke execute on function public.recent_feedback() from public, anon;
grant execute on function public.recent_feedback() to authenticated;
