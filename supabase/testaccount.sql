-- =====================================================================
-- Content Challenge: testaccounts tellen niet mee in de ranglijst
-- Eenmalig: plak dit in Supabase > SQL Editor > New query en klik Run.
-- Je kunt het opnieuw draaien: het maakt niets dubbel.
--
-- Wat het doet: een docent kan in het docentendashboard een studentaccount
-- als testaccount markeren. Zo'n account:
--   * staat niet meer in het scorebord en klasoverzicht in de game,
--   * telt niet mee in "Waar zit de klas?" en de tellers in het dashboard,
--   * neemt geen plek in een studio in (studio's vullen per 4 zonder hem).
-- Het account zelf en al het werk blijven gewoon bestaan. Er wordt niets
-- gewist of veranderd in voortgang, beelden of profielen: het script voegt
-- alleen een nieuwe lijst (testaccounts) toe en past twee leesfuncties aan.
-- Schakelaar weer uit = het account staat meteen weer in de ranglijst.
-- =====================================================================

-- Lijst met testaccounts (alleen de id, verder niets).
create table if not exists public.testaccounts (
  user_id uuid primary key references public.profielen(id) on delete cascade,
  gezet   timestamptz not null default now(),
  door    uuid references auth.users(id) on delete set null
);
alter table public.testaccounts enable row level security;
revoke all on public.testaccounts from anon, authenticated;   -- alleen via de functies hieronder

-- Docent zet een studentaccount aan (p_aan = true) of uit als testaccount.
create or replace function public.testaccount_zet(p_user uuid, p_aan boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_docent() then raise exception 'Alleen docenten kunnen dit.'; end if;
  if not exists (select 1 from public.profielen where id = p_user and rol = 'student') then
    raise exception 'Alleen een studentaccount kan een testaccount zijn.';
  end if;
  if p_aan then
    insert into public.testaccounts (user_id, door) values (p_user, auth.uid())
    on conflict (user_id) do nothing;
  else
    delete from public.testaccounts where user_id = p_user;
  end if;
end $$;

-- Scorebord en klasoverzicht (klas) zonder testaccounts, en voor het dashboard
-- dezelfde gegevens van alleen de testaccounts (testaccounts_klas).
-- Werkt met en zonder studio.sql.
do $do$
declare
  studio_kol  text := 'v.samenvatting ->> ''studio''';
  studio_join text := '';
begin
  if to_regclass('public.studio_plekken') is not null then
    studio_kol  := 'coalesce(sp.studio::text, v.samenvatting ->> ''studio'')';
    studio_join := 'left join public.studio_plekken sp on sp.user_id = p.id';
  end if;

  execute format($f$
    create or replace function public.klas()
    returns table (id uuid, naam text, studio text, samenvatting jsonb, email text, bijgewerkt timestamptz)
    language sql stable security definer set search_path = public as $b$
      select p.id, v.samenvatting ->> 'naam', %1$s, coalesce(v.samenvatting, '{}'::jsonb),
             case when public.is_docent() then p.email end, v.bijgewerkt
      from public.profielen p
      left join public.voortgang v on v.user_id = p.id
      %2$s
      where p.rol = 'student' and public.is_lid()
        and not exists (select 1 from public.testaccounts t where t.user_id = p.id);
    $b$ $f$, studio_kol, studio_join);

  execute format($f$
    create or replace function public.testaccounts_klas()
    returns table (id uuid, naam text, studio text, samenvatting jsonb, email text, bijgewerkt timestamptz)
    language sql stable security definer set search_path = public as $b$
      select p.id, v.samenvatting ->> 'naam', %1$s, coalesce(v.samenvatting, '{}'::jsonb),
             p.email, v.bijgewerkt
      from public.testaccounts t
      join public.profielen p on p.id = t.user_id
      left join public.voortgang v on v.user_id = p.id
      %2$s
      where p.rol = 'student' and public.is_docent();
    $b$ $f$, studio_kol, studio_join);

  -- Studio's: een testaccount telt niet mee bij "studio vol" (alleen als studio.sql gedraaid is).
  if to_regprocedure('public.eerste_open_studio()') is not null then
    create or replace function public.eerste_open_studio() returns int
    language sql stable security definer set search_path = public as $b$
      select min(n)::int from generate_series(1, 30) n
      where (select count(*) from public.studio_plekken s where s.studio = n
               and not exists (select 1 from public.testaccounts t where t.user_id = s.user_id)) < public.studio_max();
    $b$;

    create or replace function public.mijn_studio() returns jsonb
    language plpgsql stable security definer set search_path = public as $b$
    declare s int; o int;
    begin
      if not public.is_lid() then return null; end if;
      select studio into s from public.studio_plekken where user_id = auth.uid();
      o := public.eerste_open_studio();
      return jsonb_build_object('studio', s, 'open', o, 'max', public.studio_max(),
        'vrij', public.studio_max() - (select count(*) from public.studio_plekken sp where sp.studio = o
                  and not exists (select 1 from public.testaccounts t where t.user_id = sp.user_id)));
    end $b$;
  end if;
end $do$;

revoke execute on function public.testaccount_zet(uuid, boolean), public.testaccounts_klas(), public.klas() from public, anon;
grant execute on function public.testaccount_zet(uuid, boolean), public.testaccounts_klas(), public.klas() to authenticated;
