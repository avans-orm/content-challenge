-- =====================================================================
-- Content Challenge: database-opzet voor Supabase
-- Plak dit hele bestand in Supabase > SQL Editor > New query en klik Run.
-- Je kunt het later opnieuw draaien: het maakt niets dubbel.
--
-- STAP VOORAF: vervang hieronder JOUW-EMAIL@VOORBEELD.NL door je eigen
-- e-mailadres. Dat wordt de eerste docent.
-- =====================================================================

-- ---------- Tabellen ----------

-- Wie mag er in? Een docent zet hier e-mailadressen in (via het dashboard).
create table if not exists public.uitnodigingen (
  email            text primary key check (email = lower(email) and position('@' in email) > 1),
  rol              text not null default 'student' check (rol in ('student','docent')),
  uitgenodigd_door uuid references auth.users(id) on delete set null,
  uitgenodigd_op   timestamptz not null default now(),
  laatst_verstuurd timestamptz,
  geaccepteerd_op  timestamptz
);

-- Eén rij per account dat echt is ingelogd.
create table if not exists public.profielen (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text not null unique,
  rol              text not null check (rol in ('student','docent')),
  wachtwoord_gezet boolean not null default false,
  aangemaakt       timestamptz not null default now()
);

-- Alles wat een student in de game invult (de beelden staan in Storage).
create table if not exists public.voortgang (
  user_id      uuid primary key references public.profielen(id) on delete cascade,
  state        jsonb not null default '{}'::jsonb,
  samenvatting jsonb not null default '{}'::jsonb,
  versie       bigint not null default 1,
  bijgewerkt   timestamptz not null default now()
);

-- Grenzen tegen misbruik: één student kan de database niet volstoppen.
alter table public.voortgang drop constraint if exists voortgang_max_grootte;
alter table public.voortgang add constraint voortgang_max_grootte
  check (pg_column_size(state) < 3000000 and pg_column_size(samenvatting) < 50000);

create or replace function public.zet_bijgewerkt() returns trigger
language plpgsql as $$ begin new.bijgewerkt := now(); return new; end $$;
drop trigger if exists voortgang_bijgewerkt on public.voortgang;
create trigger voortgang_bijgewerkt before insert or update on public.voortgang
  for each row execute function public.zet_bijgewerkt();

-- ---------- Hulpfuncties ----------

create or replace function public.is_docent() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profielen p join public.uitnodigingen u on u.email = p.email
                 where p.id = auth.uid() and p.rol = 'docent' and u.rol = 'docent'
                   and p.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.is_lid() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profielen p join public.uitnodigingen u on u.email = p.email
                 where p.id = auth.uid() and p.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- Maximaal 10 docenten.
create or replace function public.max_docenten() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.rol = 'docent' and (select count(*) from public.uitnodigingen where rol = 'docent' and email <> new.email) >= 10 then
    raise exception 'Er zijn al 10 docenten. Verwijder eerst een docent.';
  end if;
  return new;
end $$;
drop trigger if exists uitnodigingen_max_docenten on public.uitnodigingen;
create trigger uitnodigingen_max_docenten before insert or update on public.uitnodigingen
  for each row execute function public.max_docenten();

-- Na het inloggen: geef het eigen profiel terug. Bestaat het nog niet maar is
-- het e-mailadres uitgenodigd, dan wordt het profiel nu aangemaakt.
-- Niet uitgenodigd: er komt niets terug en de game laat "geen toegang" zien.
create or replace function public.mijn_profiel() returns public.profielen
language plpgsql security definer set search_path = public as $$
declare
  r public.profielen;
  e text := lower(coalesce(auth.jwt() ->> 'email', ''));
  u public.uitnodigingen;
begin
  if auth.uid() is null then return null; end if;
  -- Alleen een bevestigd e-mailadres telt (beschermt ook als "Confirm email" per ongeluk uit staat).
  if not exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null and lower(email) = e) then
    return null;
  end if;
  select * into u from public.uitnodigingen where email = e;
  select * into r from public.profielen where id = auth.uid();
  if found then
    if u.email is null then return null; end if;        -- uitnodiging ingetrokken
    if r.email <> e then return null; end if;           -- e-mailadres van het account is veranderd: geen toegang
    if r.rol <> u.rol then
      update public.profielen set rol = u.rol where id = r.id returning * into r;
    end if;
  else
    if u.email is null then return null; end if;
    insert into public.profielen (id, email, rol) values (auth.uid(), e, u.rol) returning * into r;
  end if;
  update public.uitnodigingen set geaccepteerd_op = coalesce(geaccepteerd_op, now()) where email = e;
  return r;
end $$;

-- Scorebord en klasoverzicht: naam, studio en scores van alle studenten.
-- Studenten zien geen e-mailadressen en geen antwoorden, alleen de samenvatting.
create or replace function public.klas()
returns table (id uuid, naam text, studio text, samenvatting jsonb, email text, bijgewerkt timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id,
         v.samenvatting ->> 'naam',
         v.samenvatting ->> 'studio',
         coalesce(v.samenvatting, '{}'::jsonb),
         case when public.is_docent() then p.email end,
         v.bijgewerkt
  from public.profielen p
  left join public.voortgang v on v.user_id = p.id
  where p.rol = 'student' and public.is_lid();
$$;

-- Docent verwijdert een account of uitnodiging helemaal (ook het inlogaccount).
create or replace function public.verwijder_gebruiker(p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare e text := lower(trim(p_email));
begin
  if not public.is_docent() then raise exception 'Alleen docenten kunnen dit.'; end if;
  if e = lower(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'Je kunt jezelf niet verwijderen.'; end if;
  delete from auth.users where lower(email) = e;
  delete from public.uitnodigingen where email = e;
end $$;

-- Optioneel (aanbevolen): Auth Hook "Before User Created".
-- Zorgt dat alleen uitgenodigde e-mailadressen een account kunnen krijgen.
-- Aanzetten: Authentication > Hooks > Before User Created > Postgres > public.alleen_uitgenodigd
create or replace function public.alleen_uitgenodigd(event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if exists (select 1 from public.uitnodigingen where email = e) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Dit e-mailadres is niet uitgenodigd voor Content Challenge.'));
end $$;

-- ---------- Rechten ----------

alter table public.uitnodigingen enable row level security;
alter table public.profielen     enable row level security;
alter table public.voortgang     enable row level security;

revoke all on public.uitnodigingen, public.profielen, public.voortgang from anon, authenticated;
grant select, insert, update, delete on public.uitnodigingen to authenticated;
grant select on public.profielen to authenticated;
grant update (wachtwoord_gezet) on public.profielen to authenticated;
grant select, insert, update on public.voortgang to authenticated;

revoke execute on function public.alleen_uitgenodigd(jsonb) from public, anon, authenticated;
grant execute on function public.alleen_uitgenodigd(jsonb) to supabase_auth_admin;
revoke execute on function public.verwijder_gebruiker(text) from public, anon;
revoke execute on function public.is_docent(), public.is_lid() from public, anon;
grant execute on function public.is_docent(), public.is_lid() to authenticated;
revoke execute on function public.mijn_profiel() from public, anon;
revoke execute on function public.klas() from public, anon;
grant execute on function public.verwijder_gebruiker(text), public.mijn_profiel(), public.klas() to authenticated;

drop policy if exists "docent beheert uitnodigingen" on public.uitnodigingen;
create policy "docent beheert uitnodigingen" on public.uitnodigingen
  for all to authenticated using (public.is_docent()) with check (public.is_docent());

drop policy if exists "eigen profiel of docent" on public.profielen;
create policy "eigen profiel of docent" on public.profielen
  for select to authenticated using (id = auth.uid() or public.is_docent());
drop policy if exists "eigen profiel bijwerken" on public.profielen;
create policy "eigen profiel bijwerken" on public.profielen
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "eigen voortgang of docent lezen" on public.voortgang;
create policy "eigen voortgang of docent lezen" on public.voortgang
  for select to authenticated using (user_id = auth.uid() or public.is_docent());
drop policy if exists "eigen voortgang aanmaken" on public.voortgang;
create policy "eigen voortgang aanmaken" on public.voortgang
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "eigen voortgang of docent bijwerken" on public.voortgang;
create policy "eigen voortgang of docent bijwerken" on public.voortgang
  for update to authenticated using (user_id = auth.uid() or public.is_docent())
  with check (user_id = auth.uid() or public.is_docent());

-- ---------- Opslag voor beelden ----------
-- Privé-map per student: beelden/<user-id>/<beeld-id>. Max 1 MB per beeld.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('beelden', 'beelden', false, 1048576, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = false, file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

create or replace function public.aantal_beelden() returns bigint
language sql stable security definer set search_path = public, storage as $$
  select count(*) from storage.objects where bucket_id = 'beelden' and (storage.foldername(name))[1] = auth.uid()::text;
$$;
revoke execute on function public.aantal_beelden() from public, anon;
grant execute on function public.aantal_beelden() to authenticated;

drop policy if exists "beelden lezen" on storage.objects;
create policy "beelden lezen" on storage.objects for select to authenticated
  using (bucket_id = 'beelden' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_docent()));
drop policy if exists "beelden toevoegen" on storage.objects;
create policy "beelden toevoegen" on storage.objects for insert to authenticated
  with check (bucket_id = 'beelden' and (storage.foldername(name))[1] = auth.uid()::text and public.is_lid()
              and name ~ '^[0-9a-f-]{36}/[a-z0-9]{4,40}$' and public.aantal_beelden() < 300);
drop policy if exists "beelden vervangen" on storage.objects;
create policy "beelden vervangen" on storage.objects for update to authenticated
  using (bucket_id = 'beelden' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'beelden' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "beelden verwijderen" on storage.objects;
create policy "beelden verwijderen" on storage.objects for delete to authenticated
  using (bucket_id = 'beelden' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_docent()));

-- ---------- Eerste docent ----------
-- Vervang het adres hieronder door je eigen e-mailadres.

insert into public.uitnodigingen (email, rol)
values (lower('JOUW-EMAIL@VOORBEELD.NL'), 'docent')
on conflict (email) do update set rol = 'docent';
