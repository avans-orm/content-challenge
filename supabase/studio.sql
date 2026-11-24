-- =====================================================================
-- Content Challenge: studio's automatisch vullen, maximaal 4 per studio
-- Eenmalig: plak dit in Supabase > SQL Editor > New query en klik Run.
-- Je kunt het opnieuw draaien: het maakt niets dubbel.
--
-- Wat het doet: een student kiest in het spelersprofiel een studio, maar
-- ziet alleen de eerste studio die nog plek heeft (studio 1, is die vol
-- dan studio 2, enzovoort). De database telt mee, dus twee studenten die
-- tegelijk kiezen kunnen niet allebei de vijfde plek krijgen.
-- Een docent kan een student in het dashboard verplaatsen.
--
-- Ander maximum dan 4? Verander het getal in studio_max() hieronder.
-- =====================================================================

create table if not exists public.studio_plekken (
  user_id uuid primary key references public.profielen(id) on delete cascade,
  studio  int  not null check (studio between 1 and 30),
  gekozen timestamptz not null default now(),
  door    uuid references auth.users(id) on delete set null
);
alter table public.studio_plekken enable row level security;
revoke all on public.studio_plekken from anon, authenticated;   -- alleen via de functies hieronder

-- Testaccounts (testaccount.sql): tellen niet mee in scorebord, klasoverzicht en studio-telling.
create table if not exists public.testaccounts (
  user_id uuid primary key references public.profielen(id) on delete cascade,
  gezet   timestamptz not null default now(),
  door    uuid references auth.users(id) on delete set null
);
alter table public.testaccounts enable row level security;
revoke all on public.testaccounts from anon, authenticated;

create or replace function public.studio_max() returns int
language sql immutable as $$ select 4 $$;

-- Eerste studio met een vrije plek.
create or replace function public.eerste_open_studio() returns int
language sql stable security definer set search_path = public as $$
  select min(n)::int from generate_series(1, 30) n
  where (select count(*) from public.studio_plekken s where s.studio = n
           and not exists (select 1 from public.testaccounts t where t.user_id = s.user_id)) < public.studio_max();
$$;

-- Voor de game: mijn studio (of null) en welke studio nu open staat.
create or replace function public.mijn_studio() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s int; o int;
begin
  if not public.is_lid() then return null; end if;
  select studio into s from public.studio_plekken where user_id = auth.uid();
  o := public.eerste_open_studio();
  return jsonb_build_object('studio', s, 'open', o, 'max', public.studio_max(),
    'vrij', public.studio_max() - (select count(*) from public.studio_plekken sp where sp.studio = o
              and not exists (select 1 from public.testaccounts t where t.user_id = sp.user_id)));
end $$;

-- Student neemt een plek in de eerste open studio. Heeft de student al een studio, dan blijft die.
create or replace function public.studio_kies() returns int
language plpgsql security definer set search_path = public as $$
declare s int;
begin
  if not public.is_lid() or not exists (select 1 from public.profielen where id = auth.uid() and rol = 'student') then
    raise exception 'Alleen studenten kiezen zo een studio.';
  end if;
  perform pg_advisory_xact_lock(hashtext('content-challenge-studio'));   -- één tegelijk
  select studio into s from public.studio_plekken where user_id = auth.uid();
  if found then return s; end if;
  s := public.eerste_open_studio();
  if s is null then raise exception 'Alle studio''s zijn vol. Vraag je docent om je in te delen.'; end if;
  insert into public.studio_plekken (user_id, studio) values (auth.uid(), s);
  return s;
end $$;

-- Voor het dashboard: wie zit waar.
create or replace function public.studio_lijst() returns table (user_id uuid, studio int)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.studio from public.studio_plekken s where public.is_docent();
$$;

-- Docent verplaatst een student (mag ook boven het maximum) of haalt hem uit zijn studio (p_studio = null).
create or replace function public.studio_zet(p_user uuid, p_studio int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_docent() then raise exception 'Alleen docenten kunnen dit.'; end if;
  if not exists (select 1 from public.profielen where id = p_user and rol = 'student') then
    raise exception 'Deze student heeft nog geen account.';
  end if;
  perform pg_advisory_xact_lock(hashtext('content-challenge-studio'));
  if p_studio is null then
    delete from public.studio_plekken where user_id = p_user;
  else
    insert into public.studio_plekken (user_id, studio, door) values (p_user, p_studio, auth.uid())
    on conflict (user_id) do update set studio = excluded.studio, door = excluded.door, gekozen = now();
  end if;
end $$;

-- Scorebord en klasoverzicht: de studio komt nu uit studio_plekken (anders uit de game).
create or replace function public.klas()
returns table (id uuid, naam text, studio text, samenvatting jsonb, email text, bijgewerkt timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id,
         v.samenvatting ->> 'naam',
         coalesce(sp.studio::text, v.samenvatting ->> 'studio'),
         coalesce(v.samenvatting, '{}'::jsonb),
         case when public.is_docent() then p.email end,
         v.bijgewerkt
  from public.profielen p
  left join public.voortgang v on v.user_id = p.id
  left join public.studio_plekken sp on sp.user_id = p.id
  where p.rol = 'student' and public.is_lid()
    and not exists (select 1 from public.testaccounts t where t.user_id = p.id);
$$;

revoke execute on function public.studio_max(), public.eerste_open_studio(), public.mijn_studio(), public.studio_kies(),
  public.studio_lijst(), public.studio_zet(uuid, int), public.klas() from public, anon;
grant execute on function public.studio_max(), public.eerste_open_studio(), public.mijn_studio(), public.studio_kies(),
  public.studio_lijst(), public.studio_zet(uuid, int), public.klas() to authenticated;
