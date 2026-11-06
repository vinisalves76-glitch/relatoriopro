-- Relatorio Pro | Agenda e correção do controle de horímetro 125h
-- Corrige a validação de vínculo: leituras de horímetro não possuem work_order_id.
-- Cria agenda de inspeções com escopo por área e RLS.

begin;

create or replace function public.validate_operational_area_links()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'operational_work_orders' then
    if not exists (
      select 1 from public.operational_equipment e
      where e.id = new.equipment_id and e.area_id = new.area_id
    ) then
      raise exception 'Equipamento não pertence à área informada.';
    end if;
  elsif tg_table_name = 'operational_maintenance_events' then
    if not exists (
      select 1 from public.operational_equipment e
      where e.id = new.equipment_id and e.area_id = new.area_id
    ) then
      raise exception 'Equipamento não pertence à área informada.';
    end if;
    if new.work_order_id is not null and not exists (
      select 1 from public.operational_work_orders w
      where w.id = new.work_order_id and w.area_id = new.area_id
    ) then
      raise exception 'Ordem de serviço não pertence à área informada.';
    end if;
  elsif tg_table_name = 'operational_horimeter_readings' then
    if not exists (
      select 1 from public.operational_equipment e
      where e.id = new.equipment_id and e.area_id = new.area_id
    ) then
      raise exception 'Equipamento não pertence à área informada.';
    end if;
  end if;
  return new;
end;
$$;

create table if not exists public.operational_125h_schedules (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  equipment_id uuid not null references public.operational_equipment(id) on delete cascade,
  planned_for date not null,
  planned_horimeter numeric(12,1) not null check (planned_horimeter >= 0),
  responsible_name text not null,
  notes text not null default '',
  status text not null default 'scheduled'
    check (status in ('scheduled','in_progress','completed','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (equipment_id)
);

create index if not exists operational_125h_schedules_area_date_idx
  on public.operational_125h_schedules(area_id, planned_for, status);

create or replace function public.validate_operational_125h_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_current numeric(12,1);
  v_next numeric(12,1);
begin
  select e.current_horimeter, c.last_service_horimeter + 125
    into v_current, v_next
  from public.operational_equipment e
  left join public.operational_125h_control c on c.equipment_id = e.id
  where e.id = new.equipment_id and e.area_id = new.area_id;

  if not found then
    raise exception 'Equipamento não pertence à área informada.';
  end if;
  if new.planned_horimeter < coalesce(v_current,0) then
    raise exception 'Horímetro planejado não pode ser menor que o horímetro atual.';
  end if;
  if v_next is not null and new.planned_horimeter > v_next then
    raise exception 'Agendamento ultrapassa o limite da próxima manutenção de 125 horas.';
  end if;
  return new;
end;
$$;

drop trigger if exists operational_125h_schedule_guard on public.operational_125h_schedules;
create trigger operational_125h_schedule_guard
before insert or update on public.operational_125h_schedules
for each row execute function public.validate_operational_125h_schedule();

alter table public.operational_125h_schedules enable row level security;
drop policy if exists operational_125h_schedules_scope on public.operational_125h_schedules;
create policy operational_125h_schedules_scope
on public.operational_125h_schedules
for all to authenticated
using (public.has_operational_access(area_id))
with check (public.has_operational_access(area_id));

revoke all on public.operational_125h_schedules from anon;
grant select, insert, update, delete on public.operational_125h_schedules to authenticated;

create or replace function public.complete_operational_125h_service(
  p_area_id text,
  p_equipment_id uuid,
  p_service_horimeter numeric,
  p_performed_at timestamptz,
  p_checklist text default '',
  p_notes text default ''
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current numeric(12,1);
  v_service_id uuid;
begin
  if not public.has_operational_access(p_area_id) then
    raise exception 'Sem permissão para esta área operacional.';
  end if;

  select current_horimeter into v_current
  from public.operational_equipment
  where id = p_equipment_id and area_id = p_area_id
  for update;

  if not found then
    raise exception 'Equipamento não encontrado nesta área.';
  end if;
  if p_service_horimeter is null or p_service_horimeter < v_current then
    raise exception 'O horímetro da manutenção não pode ser menor que a leitura atual do equipamento.';
  end if;

  insert into public.operational_125h_services
    (area_id, equipment_id, service_horimeter, performed_at, checklist, notes, created_by)
  values
    (p_area_id, p_equipment_id, p_service_horimeter, coalesce(p_performed_at, now()),
     coalesce(p_checklist, ''), coalesce(p_notes, ''), auth.uid())
  returning id into v_service_id;

  insert into public.operational_horimeter_readings
    (area_id, equipment_id, reading, recorded_at, notes, created_by)
  values
    (p_area_id, p_equipment_id, p_service_horimeter, coalesce(p_performed_at, now()),
     'Leitura registrada na manutenção preventiva de 125 horas.', auth.uid());

  insert into public.operational_125h_control
    (area_id, equipment_id, interval_hours, last_service_horimeter, enabled, updated_by)
  values
    (p_area_id, p_equipment_id, 125, p_service_horimeter, true, auth.uid())
  on conflict (equipment_id) do update
    set area_id = excluded.area_id,
        interval_hours = 125,
        last_service_horimeter = excluded.last_service_horimeter,
        enabled = true,
        updated_by = auth.uid(),
        updated_at = now();

  update public.operational_equipment
  set current_horimeter = p_service_horimeter,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_equipment_id and area_id = p_area_id;

  update public.operational_125h_schedules
  set status = 'completed', updated_at = now()
  where equipment_id = p_equipment_id
    and area_id = p_area_id
    and status in ('scheduled','in_progress');

  return v_service_id;
end;
$$;

revoke all on function public.complete_operational_125h_service(text,uuid,numeric,timestamptz,text,text) from public, anon;
grant execute on function public.complete_operational_125h_service(text,uuid,numeric,timestamptz,text,text) to authenticated;

commit;
