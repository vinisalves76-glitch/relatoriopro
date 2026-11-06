-- Relatorio Pro | Fechamento de turno e acompanhamento de frota
-- Base técnica para turnos customizáveis, localização física + setor e DF automática + oficial.
-- Preserva integralmente o processo existente de Inspeção de 125 Horas.

begin;

-- 1) Modelos de turno: horários configuráveis por área. Permite escalas e turnos variáveis.
create table if not exists public.operational_shift_templates (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  name text not null,
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean generated always as (end_time <= start_time) stored,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area_id, name),
  check (start_time <> end_time)
);

create index if not exists operational_shift_templates_area_idx
  on public.operational_shift_templates(area_id, active, sort_order);

-- 2) Instância real do turno. Datas/horas efetivas são gravadas como timestamptz,
-- portanto turnos que atravessam meia-noite não dependem de suposições no frontend.
create table if not exists public.operational_shifts (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  template_id uuid references public.operational_shift_templates(id) on delete set null,
  shift_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  supervisor_name text not null default '',
  coordinator_name text not null default '',
  team_members text[] not null default '{}',
  status text not null default 'open'
    check (status in ('open','closed','cancelled')),
  opening_notes text not null default '',
  closing_notes text not null default '',
  opened_by uuid references auth.users(id) on delete set null,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index if not exists operational_shifts_area_start_idx
  on public.operational_shifts(area_id, starts_at desc, status);

alter table public.operational_shifts add column if not exists planned_ends_at timestamptz;

-- 3) Fotografia de status da frota por turno. A localização física e o setor
-- responsável são dimensões independentes e obrigatórias quando o equipamento está parado.
create table if not exists public.operational_shift_equipment_status (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  shift_id uuid not null references public.operational_shifts(id) on delete cascade,
  equipment_id uuid not null references public.operational_equipment(id),
  fleet_status text not null
    check (fleet_status in ('producing','preventive','corrective','tire_shop','other')),
  physical_location text not null default '',
  responsible_sector text not null default '',
  current_activity text not null default '',
  observations text not null default '',
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_id, equipment_id)
);

create index if not exists operational_shift_equipment_status_area_shift_idx
  on public.operational_shift_equipment_status(area_id, shift_id);
create index if not exists operational_shift_equipment_status_equipment_idx
  on public.operational_shift_equipment_status(equipment_id, recorded_at desc);

-- 4) Tarefas estruturadas de OS: separa atividades concluídas e pendentes
-- de textos livres do relatório. A ordem e o histórico são preservados.
create table if not exists public.operational_work_order_tasks (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  work_order_id uuid not null references public.operational_work_orders(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'pending'
    check (status in ('pending','in_progress','completed','blocked','cancelled')),
  responsible_sector text not null default '',
  responsible_name text not null default '',
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operational_work_order_tasks_order_idx
  on public.operational_work_order_tasks(area_id, work_order_id, status, sort_order);

alter table public.operational_work_order_tasks add column if not exists shift_id uuid references public.operational_shifts(id) on delete set null;

-- 5) Atualizações de turno vinculadas à OS: o que foi executado, o que falta,
-- mudanças de equipe, diagnóstico, observações e passagem de serviço.
create table if not exists public.operational_work_order_updates (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  shift_id uuid references public.operational_shifts(id) on delete set null,
  work_order_id uuid references public.operational_work_orders(id) on delete cascade,
  update_type text not null default 'progress'
    check (update_type in ('diagnosis','progress','handover','incident','release')),
  summary text not null,
  details text not null default '',
  team_members text[] not null default '{}',
  physical_location text not null default '',
  responsible_sector text not null default '',
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists operational_work_order_updates_order_idx
  on public.operational_work_order_updates(area_id, work_order_id, occurred_at desc);

-- 6) Eventos de parada. df_treatment permite classificar cada parada como
-- incluída, excluída ou ainda pendente de regra contratual.
create table if not exists public.operational_downtime_events (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  equipment_id uuid not null references public.operational_equipment(id),
  work_order_id uuid references public.operational_work_orders(id) on delete set null,
  shift_id uuid references public.operational_shifts(id) on delete set null,
  reason text not null,
  reason_category text not null default 'other'
    check (reason_category in ('mechanical','electrical','hydraulic','tire_shop','parts','munck','weather','client_request','labor','diagnosis','other')),
  responsible_party text not null default 'undetermined'
    check (responsible_party in ('client','internal','supplier','weather','undetermined')),
  started_at timestamptz not null,
  ended_at timestamptz,
  df_treatment text not null default 'pending'
    check (df_treatment in ('include','exclude','pending')),
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at)
);

create index if not exists operational_downtime_equipment_period_idx
  on public.operational_downtime_events(area_id, equipment_id, started_at desc);
create index if not exists operational_downtime_shift_idx
  on public.operational_downtime_events(shift_id, started_at);

-- 7) DF oficial digitada pela operação. O valor calculado será obtido da visão
-- abaixo, mantendo os dois indicadores sem sobrescrever um ao outro.
create table if not exists public.operational_shift_df_official (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  shift_id uuid not null references public.operational_shifts(id) on delete cascade,
  official_df_percent numeric(5,2) not null check (official_df_percent between 0 and 100),
  source_name text not null default 'Informado pela operação',
  notes text not null default '',
  entered_by uuid references auth.users(id) on delete set null,
  entered_at timestamptz not null default now(),
  unique (shift_id)
);

update public.operational_shifts set planned_ends_at=ends_at where planned_ends_at is null;

-- Integridade: todos os registros relacionados precisam pertencer à mesma área.
create or replace function public.validate_operational_shift_links()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'operational_shifts' then
    if new.template_id is not null and not exists (
      select 1 from public.operational_shift_templates t
      where t.id = new.template_id and t.area_id = new.area_id
    ) then raise exception 'Modelo de turno não pertence à área informada.'; end if;
  elsif tg_table_name = 'operational_shift_equipment_status' then
    if not exists (select 1 from public.operational_shifts s where s.id=new.shift_id and s.area_id=new.area_id)
      or not exists (select 1 from public.operational_equipment e where e.id=new.equipment_id and e.area_id=new.area_id)
    then raise exception 'Turno ou equipamento não pertence à área informada.'; end if;
  elsif tg_table_name = 'operational_work_order_tasks' then
    if not exists (select 1 from public.operational_work_orders w where w.id=new.work_order_id and w.area_id=new.area_id)
      or (new.shift_id is not null and not exists (select 1 from public.operational_shifts s where s.id=new.shift_id and s.area_id=new.area_id))
    then raise exception 'Ordem de serviço ou turno não pertence à área informada.'; end if;
  elsif tg_table_name = 'operational_work_order_updates' then
    if (new.work_order_id is not null and not exists (select 1 from public.operational_work_orders w where w.id=new.work_order_id and w.area_id=new.area_id))
      or (new.shift_id is not null and not exists (select 1 from public.operational_shifts s where s.id=new.shift_id and s.area_id=new.area_id))
    then raise exception 'Ordem de serviço ou turno não pertence à área informada.'; end if;
  elsif tg_table_name = 'operational_downtime_events' then
    if not exists (select 1 from public.operational_equipment e where e.id=new.equipment_id and e.area_id=new.area_id)
      or (new.work_order_id is not null and not exists (select 1 from public.operational_work_orders w where w.id=new.work_order_id and w.area_id=new.area_id))
      or (new.shift_id is not null and not exists (select 1 from public.operational_shifts s where s.id=new.shift_id and s.area_id=new.area_id))
    then raise exception 'Equipamento, OS ou turno não pertence à área informada.'; end if;
  elsif tg_table_name = 'operational_shift_df_official' then
    if not exists (select 1 from public.operational_shifts s where s.id=new.shift_id and s.area_id=new.area_id)
    then raise exception 'Turno não pertence à área informada.'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists operational_shifts_area_guard on public.operational_shifts;
create trigger operational_shifts_area_guard before insert or update on public.operational_shifts
for each row execute function public.validate_operational_shift_links();
drop trigger if exists operational_shift_equipment_area_guard on public.operational_shift_equipment_status;
create trigger operational_shift_equipment_area_guard before insert or update on public.operational_shift_equipment_status
for each row execute function public.validate_operational_shift_links();
drop trigger if exists operational_work_order_tasks_area_guard on public.operational_work_order_tasks;
create trigger operational_work_order_tasks_area_guard before insert or update on public.operational_work_order_tasks
for each row execute function public.validate_operational_shift_links();
drop trigger if exists operational_work_order_updates_area_guard on public.operational_work_order_updates;
create trigger operational_work_order_updates_area_guard before insert or update on public.operational_work_order_updates
for each row execute function public.validate_operational_shift_links();
drop trigger if exists operational_downtime_events_area_guard on public.operational_downtime_events;
create trigger operational_downtime_events_area_guard before insert or update on public.operational_downtime_events
for each row execute function public.validate_operational_shift_links();
drop trigger if exists operational_shift_df_official_area_guard on public.operational_shift_df_official;
create trigger operational_shift_df_official_area_guard before insert or update on public.operational_shift_df_official
for each row execute function public.validate_operational_shift_links();

-- Cálculo provisório da DF por turno: (minutos programados - minutos de parada
-- classificados como incluídos) / minutos programados * 100.
-- Usa união de intervalos para não contar duas vezes paradas sobrepostas.
-- Se houver parada sem classificação, calculated_df_percent fica NULL até revisão.
create or replace view public.operational_shift_df_summary with (security_invoker = true) as
with shift_base as (
  select s.id as shift_id, s.area_id, s.starts_at,
         coalesce(s.ends_at, now()) as ends_at,
         greatest(0, extract(epoch from (coalesce(s.planned_ends_at, s.ends_at, now()) - s.starts_at))/60.0) as scheduled_minutes,
         count(d.id) filter (where d.df_treatment='pending') as pending_classification_count,
         coalesce(
           range_agg(
             tstzrange(
               greatest(d.started_at, s.starts_at),
               least(coalesce(d.ended_at, now()), coalesce(s.ends_at, now())),
               '[)'
             )
           ) filter (
             where d.df_treatment='include'
               and d.started_at < coalesce(s.ends_at, now())
               and coalesce(d.ended_at, now()) > s.starts_at
           ),
           '{}'::tstzmultirange
         ) as included_ranges
  from public.operational_shifts s
  left join public.operational_downtime_events d
    on d.shift_id=s.id
   and d.area_id=s.area_id
   and d.started_at < coalesce(s.ends_at, now())
   and coalesce(d.ended_at, now()) > s.starts_at
  group by s.id, s.area_id, s.starts_at, s.ends_at
),
duration as (
  select shift_id, area_id, scheduled_minutes, pending_classification_count,
         coalesce((
           select sum(extract(epoch from (upper(r)-lower(r)))/60.0)
           from unnest(included_ranges) as r
         ),0) as downtime_minutes
  from shift_base
)
select d.shift_id, d.area_id, d.scheduled_minutes, d.downtime_minutes,
       d.pending_classification_count,
       case when d.scheduled_minutes > 0 and d.pending_classification_count=0
         then round(((d.scheduled_minutes-downtime_minutes)/d.scheduled_minutes*100)::numeric,2)
         else null end as calculated_df_percent,
       o.official_df_percent, o.source_name as official_source, o.entered_at as official_entered_at
from duration d
left join public.operational_shift_df_official o on o.shift_id=d.shift_id;

-- RLS uniforme: supervisor de área e master só acessam a área autorizada.
do $$
declare t text;
begin
  foreach t in array array[
    'operational_shift_templates',
    'operational_shifts',
    'operational_shift_equipment_status',
    'operational_work_order_tasks',
    'operational_work_order_updates',
    'operational_downtime_events',
    'operational_shift_df_official'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists operational_area_scope on public.%I',t);
    execute format('create policy operational_area_scope on public.%I for all to authenticated using (public.has_operational_access(area_id)) with check (public.has_operational_access(area_id))',t);
  end loop;
end $$;

revoke all on public.operational_shift_templates, public.operational_shifts,
  public.operational_shift_equipment_status, public.operational_work_order_tasks,
  public.operational_work_order_updates, public.operational_downtime_events,
  public.operational_shift_df_official from anon;
grant select, insert, update, delete on public.operational_shift_templates,
  public.operational_shifts, public.operational_shift_equipment_status,
  public.operational_work_order_tasks, public.operational_work_order_updates,
  public.operational_downtime_events, public.operational_shift_df_official to authenticated;
grant select on public.operational_shift_df_summary to authenticated;

commit;
