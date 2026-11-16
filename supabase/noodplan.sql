-- =====================================================================
-- Content Challenge: schakelaar voor het noodplan (inhaal-invoer)
-- Eenmalig: plak dit in Supabase > SQL Editor > New query en klik Run.
-- Je kunt het opnieuw draaien: het maakt niets dubbel.
-- Daarna zet een docent het noodplan aan of uit in het docentendashboard.
-- =====================================================================

create table if not exists public.instellingen (
  sleutel         text primary key check (sleutel in ('noodplan')),
  waarde          jsonb not null default 'false'::jsonb check (jsonb_typeof(waarde) = 'boolean'),
  bijgewerkt      timestamptz not null default now(),
  bijgewerkt_door uuid references auth.users(id) on delete set null
);

drop trigger if exists instellingen_bijgewerkt on public.instellingen;
create trigger instellingen_bijgewerkt before insert or update on public.instellingen
  for each row execute function public.zet_bijgewerkt();

alter table public.instellingen enable row level security;
revoke all on public.instellingen from anon, authenticated;
grant select, insert, update on public.instellingen to authenticated;

drop policy if exists "leden lezen instellingen" on public.instellingen;
create policy "leden lezen instellingen" on public.instellingen
  for select to authenticated using (public.is_lid());
drop policy if exists "docent maakt instelling" on public.instellingen;
create policy "docent maakt instelling" on public.instellingen
  for insert to authenticated with check (public.is_docent());
drop policy if exists "docent wijzigt instelling" on public.instellingen;
create policy "docent wijzigt instelling" on public.instellingen
  for update to authenticated using (public.is_docent()) with check (public.is_docent());

-- Standaard staat het noodplan uit.
insert into public.instellingen (sleutel, waarde) values ('noodplan', 'false'::jsonb)
on conflict (sleutel) do nothing;
