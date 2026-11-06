-- RelatorioPro | Controle de manutenção preventiva a cada 125 horas
-- Migração incremental. Mantém os dados operacionais existentes.

begin;

create table if not exists public.operational_125h_control (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  equipment_id uuid not null references public.operational_equipment(id) on delete cascade,
  interval_hours numeric(8,1) not null default 125 check (interval_hours > 0),
  last_service_horimeter numeric(12,1) not null default 0 check (last_service_horimeter >= 0),
  enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (equipment_id),
  unique (area_id, equipment_id)
);

create table if not exists public.operational_125h_services (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  equipment_id uuid not null references public.operational_equipment(id),
  service_horimeter numeric(12,1) not null check (service_horimeter >= 0),
  performed_at timestamptz not null default now(),
  checklist text not null default '',
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists operational_125h_control_area_idx
  on public.operational_125h_control(area_id, enabled);
create index if not exists operational_125h_services_equipment_idx
  on public.operational_125h_services(equipment_id, service_horimeter desc);
create index if not exists operational_125h_services_area_idx
  on public.operational_125h_services(area_id, performed_at desc);

create or replace function public.validate_operational_125h_area()
returns trigger language plpgsql set search_path = public
as $$
begin
  if not exists (
    select 1 from public.operational_equipment e
    where e.id = new.equipment_id and e.area_id = new.area_id
  ) then
    raise exception 'Equipamento não pertence à área informada.';
  end if;
  return new;
end;
$$;

drop trigger if exists operational_125h_control_area_guard on public.operational_125h_control;
create trigger operational_125h_control_area_guard
before insert or update on public.operational_125h_control
for each row execute function public.validate_operational_125h_area();

drop trigger if exists operational_125h_services_area_guard on public.operational_125h_services;
create trigger operational_125h_services_area_guard
before insert or update on public.operational_125h_services
for each row execute function public.validate_operational_125h_area();

alter table public.operational_125h_control enable row level security;
alter table public.operational_125h_services enable row level security;

drop policy if exists operational_125h_control_scope on public.operational_125h_control;
create policy operational_125h_control_scope on public.operational_125h_control
for all to authenticated
using (public.has_operational_access(area_id))
with check (public.has_operational_access(area_id));

drop policy if exists operational_125h_services_scope on public.operational_125h_services;
create policy operational_125h_services_scope on public.operational_125h_services
for all to authenticated
using (public.has_operational_access(area_id))
with check (public.has_operational_access(area_id));

revoke all on public.operational_125h_control, public.operational_125h_services from anon;
grant select, insert, update, delete on public.operational_125h_control,
  public.operational_125h_services to authenticated;

-- Conclusão transacional: grava histórico, atualiza a referência da próxima
-- revisão e sincroniza o horímetro do equipamento em uma única operação.
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

  return v_service_id;
end;
$$;

revoke all on function public.complete_operational_125h_service(text,uuid,numeric,timestamptz,text,text) from public, anon;
grant execute on function public.complete_operational_125h_service(text,uuid,numeric,timestamptz,text,text) to authenticated;

commit;
