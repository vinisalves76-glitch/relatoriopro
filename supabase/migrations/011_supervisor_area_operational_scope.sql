-- RelatorioPro | Supervisor de Área | migração incremental
-- Cria o escopo operacional por unidade e aplica RLS no banco.
-- Área inicial: ArcelorMittal Andradas. Não altera nem remove registros existentes.

begin;

alter table public.profiles
  add column if not exists operational_area_id text;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in (
    'super_admin','auxiliar_administrativo','gerente','coordenador',
    'instrutor_tecnico','consultor_tecnico','supervisor_area'
  ));

create table if not exists public.operational_areas (
  id text primary key,
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.operational_areas (id,name,active)
values ('arcelormittal-andradas','ArcelorMittal Andradas',true)
on conflict (id) do update set name=excluded.name, active=true;

alter table public.profiles
  drop constraint if exists profiles_operational_area_fk;
alter table public.profiles
  add constraint profiles_operational_area_fk
  foreign key (operational_area_id) references public.operational_areas(id);

alter table public.profiles
  drop constraint if exists supervisor_area_requires_area;
alter table public.profiles
  add constraint supervisor_area_requires_area
  check (role <> 'supervisor_area' or operational_area_id is not null);

create index if not exists profiles_operational_area_idx
  on public.profiles (operational_area_id);

create or replace function public.is_area_supervisor(area_key text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    join public.operational_areas a on a.id = p.operational_area_id and a.active = true
    where p.id = auth.uid()
      and p.active = true
      and p.role = 'supervisor_area'
      and p.operational_area_id = area_key
  );
$$;

revoke all on function public.is_area_supervisor(text) from public, anon;
grant execute on function public.is_area_supervisor(text) to authenticated;

create or replace function public.has_operational_access(area_key text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_master() or public.is_area_supervisor(area_key);
$$;

revoke all on function public.has_operational_access(text) from public, anon;
grant execute on function public.has_operational_access(text) to authenticated;

alter table public.operational_areas enable row level security;
drop policy if exists operational_areas_read_scope on public.operational_areas;
create policy operational_areas_read_scope on public.operational_areas
for select to authenticated
using (public.is_master() or public.is_area_supervisor(id));

-- Tabelas operacionais preparadas para cadastros reais, sempre vinculadas a uma área.
create table if not exists public.operational_equipment (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  asset_code text not null,
  description text not null default '',
  brand text not null default '',
  model text not null default '',
  category text not null default 'caminhao',
  status text not null default 'available'
    check (status in ('available','stopped','maintenance','inactive')),
  current_horimeter numeric(12,1) not null default 0 check (current_horimeter >= 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area_id, asset_code)
);

create table if not exists public.operational_work_orders (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  equipment_id uuid not null references public.operational_equipment(id),
  order_number text not null,
  title text not null,
  description text not null default '',
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  status text not null default 'open' check (status in ('open','in_progress','waiting','completed','cancelled')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area_id, order_number)
);

create table if not exists public.operational_maintenance_events (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  equipment_id uuid not null references public.operational_equipment(id),
  work_order_id uuid references public.operational_work_orders(id) on delete set null,
  event_type text not null check (event_type in ('preventive','corrective','inspection','occurrence')),
  description text not null,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.operational_horimeter_readings (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  equipment_id uuid not null references public.operational_equipment(id),
  reading numeric(12,1) not null check (reading >= 0),
  recorded_at timestamptz not null default now(),
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists operational_equipment_area_idx on public.operational_equipment(area_id);
create index if not exists operational_work_orders_area_idx on public.operational_work_orders(area_id,status);
create index if not exists operational_maintenance_area_idx on public.operational_maintenance_events(area_id,occurred_at desc);
create index if not exists operational_horimeter_area_idx on public.operational_horimeter_readings(area_id,recorded_at desc);

-- Garante que equipamento e OS referenciados pertençam à mesma área.
create or replace function public.validate_operational_area_links()
returns trigger language plpgsql set search_path = public
as $$
begin
  if tg_table_name = 'operational_work_orders' then
    if not exists(select 1 from public.operational_equipment e where e.id=new.equipment_id and e.area_id=new.area_id) then
      raise exception 'Equipamento não pertence à área informada.';
    end if;
  elsif tg_table_name = 'operational_maintenance_events' or tg_table_name = 'operational_horimeter_readings' then
    if not exists(select 1 from public.operational_equipment e where e.id=new.equipment_id and e.area_id=new.area_id) then
      raise exception 'Equipamento não pertence à área informada.';
    end if;
    if tg_table_name = 'operational_maintenance_events' and new.work_order_id is not null
      and not exists(select 1 from public.operational_work_orders w where w.id=new.work_order_id and w.area_id=new.area_id) then
      raise exception 'Ordem de serviço não pertence à área informada.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists operational_work_orders_area_guard on public.operational_work_orders;
create trigger operational_work_orders_area_guard before insert or update on public.operational_work_orders
for each row execute function public.validate_operational_area_links();
drop trigger if exists operational_maintenance_area_guard on public.operational_maintenance_events;
create trigger operational_maintenance_area_guard before insert or update on public.operational_maintenance_events
for each row execute function public.validate_operational_area_links();
drop trigger if exists operational_horimeter_area_guard on public.operational_horimeter_readings;
create trigger operational_horimeter_area_guard before insert or update on public.operational_horimeter_readings
for each row execute function public.validate_operational_area_links();

do $$
declare t text;
begin
  foreach t in array array['operational_equipment','operational_work_orders','operational_maintenance_events','operational_horimeter_readings'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists area_select_scope on public.%I',t);
    execute format('create policy area_select_scope on public.%I for select to authenticated using (public.has_operational_access(area_id))',t);
    execute format('drop policy if exists area_insert_scope on public.%I',t);
    execute format('create policy area_insert_scope on public.%I for insert to authenticated with check (public.has_operational_access(area_id))',t);
    execute format('drop policy if exists area_update_scope on public.%I',t);
    execute format('create policy area_update_scope on public.%I for update to authenticated using (public.has_operational_access(area_id)) with check (public.has_operational_access(area_id))',t);
    execute format('drop policy if exists area_delete_scope on public.%I',t);
    execute format('create policy area_delete_scope on public.%I for delete to authenticated using (public.has_operational_access(area_id))',t);
  end loop;
end $$;

revoke all on public.operational_areas, public.operational_equipment,
  public.operational_work_orders, public.operational_maintenance_events,
  public.operational_horimeter_readings from anon;
grant select on public.operational_areas to authenticated;
grant select,insert,update,delete on public.operational_equipment,
  public.operational_work_orders, public.operational_maintenance_events,
  public.operational_horimeter_readings to authenticated;

commit;
