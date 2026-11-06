-- RelatorioPro | Escala mensal de mecânicos e autorização de relatórios por alocação
-- Migration 017. Arquivo aditivo: revisar e executar manualmente no SQL Editor.
-- Aplicar somente depois da Migration 016_mechanic_shift_reports.sql.

begin;

create table if not exists public.operational_mechanic_assignments (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  equipment_id uuid not null references public.operational_equipment(id),
  mechanic_id uuid not null references public.profiles(id),
  work_date date not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','cancelled')),
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area_id,equipment_id,mechanic_id,work_date)
);

create index if not exists operational_mechanic_assignments_area_date_idx
  on public.operational_mechanic_assignments(area_id,work_date);
create index if not exists operational_mechanic_assignments_mechanic_date_idx
  on public.operational_mechanic_assignments(mechanic_id,work_date);
create index if not exists operational_mechanic_assignments_equipment_date_idx
  on public.operational_mechanic_assignments(equipment_id,work_date);

create or replace function public.can_read_mechanic_schedule(area_key text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.has_operational_access(area_key)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role = 'mecanico'
        and p.operational_area_id = area_key
    );
$$;

revoke all on function public.can_read_mechanic_schedule(text) from public, anon;
grant execute on function public.can_read_mechanic_schedule(text) to authenticated;

create or replace function public.list_operational_area_mechanics(area_key text)
returns table(id uuid,name text,email text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_operational_access(area_key) then
    raise exception 'Acesso negado à equipe desta área operacional.';
  end if;

  return query
    select p.id,p.name,p.email
    from public.profiles p
    where p.active = true
      and p.role = 'mecanico'
      and p.operational_area_id = area_key
    order by p.name;
end;
$$;

revoke all on function public.list_operational_area_mechanics(text) from public, anon;
grant execute on function public.list_operational_area_mechanics(text) to authenticated;

create or replace function public.is_mechanic_assigned_to_equipment(
  area_key text,equipment_key uuid,date_key date,mechanic_key uuid
)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.operational_mechanic_assignments a
    where a.area_id = area_key
      and a.equipment_id = equipment_key
      and a.work_date = date_key
      and a.mechanic_id = mechanic_key
      and a.status = 'scheduled'
  );
$$;

revoke all on function public.is_mechanic_assigned_to_equipment(text,uuid,date,uuid) from public, anon;
grant execute on function public.is_mechanic_assigned_to_equipment(text,uuid,date,uuid) to authenticated;

create or replace function public.validate_operational_mechanic_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  equipment_area text;
  mechanic_area text;
  mechanic_active boolean;
  mechanic_role text;
begin
  if not public.has_operational_access(new.area_id) then
    raise exception 'Somente o Supervisor de Área pode gerenciar a escala desta mina.';
  end if;

  if tg_op = 'UPDATE' and old.work_date < current_date then
    raise exception 'A escala de uma data passada é histórica e não pode ser alterada.';
  end if;

  if tg_op = 'UPDATE' and (
    new.area_id is distinct from old.area_id
    or new.equipment_id is distinct from old.equipment_id
    or new.mechanic_id is distinct from old.mechanic_id
    or new.work_date is distinct from old.work_date
  ) then
    raise exception 'Para alterar uma alocação, cancele a anterior e crie uma nova.';
  end if;

  select e.area_id into equipment_area
  from public.operational_equipment e
  where e.id = new.equipment_id;

  if equipment_area is null or equipment_area <> new.area_id then
    raise exception 'O equipamento não pertence à área operacional selecionada.';
  end if;

  select p.operational_area_id,p.active,p.role
    into mechanic_area,mechanic_active,mechanic_role
  from public.profiles p
  where p.id = new.mechanic_id;

  if mechanic_area is distinct from new.area_id
    or mechanic_active is distinct from true
    or mechanic_role is distinct from 'mecanico' then
    raise exception 'O profissional selecionado não é um mecânico ativo desta área.';
  end if;

  if new.status not in ('scheduled','cancelled') then
    raise exception 'Status de escala inválido.';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists operational_mechanic_assignments_validate on public.operational_mechanic_assignments;
create trigger operational_mechanic_assignments_validate
before insert or update on public.operational_mechanic_assignments
for each row execute function public.validate_operational_mechanic_assignment();

alter table public.operational_mechanic_assignments enable row level security;

drop policy if exists operational_mechanic_assignments_read on public.operational_mechanic_assignments;
create policy operational_mechanic_assignments_read
on public.operational_mechanic_assignments
for select to authenticated
using (
  public.can_read_mechanic_schedule(area_id)
  and (
    public.has_operational_access(area_id)
    or mechanic_id = auth.uid()
  )
);

drop policy if exists operational_mechanic_assignments_insert on public.operational_mechanic_assignments;
create policy operational_mechanic_assignments_insert
on public.operational_mechanic_assignments
for insert to authenticated
with check (public.has_operational_access(area_id));

drop policy if exists operational_mechanic_assignments_update on public.operational_mechanic_assignments;
create policy operational_mechanic_assignments_update
on public.operational_mechanic_assignments
for update to authenticated
using (public.has_operational_access(area_id))
with check (public.has_operational_access(area_id));

revoke all on public.operational_mechanic_assignments from anon;
grant select,insert,update on public.operational_mechanic_assignments to authenticated;

-- A escala passa a ser a autorização efetiva do mecânico para registrar o equipamento/data.
create or replace function public.validate_operational_shift_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  equipment_area text;
  profile_name text;
  profile_area text;
  profile_role text;
  profile_active boolean;
begin
  select e.area_id into equipment_area
  from public.operational_equipment e
  where e.id = new.equipment_id;

  if equipment_area is null or equipment_area <> new.area_id then
    raise exception 'O equipamento selecionado não pertence à área vinculada ao relatório.';
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is null or new.created_by <> auth.uid() then
      raise exception 'O usuário autenticado deve ser o responsável pelo registro.';
    end if;

    select p.name,p.operational_area_id,p.role,p.active
      into profile_name,profile_area,profile_role,profile_active
    from public.profiles p
    where p.id = auth.uid();

    if profile_active is distinct from true then
      raise exception 'Perfil inativo não pode registrar relatório.';
    end if;

    if profile_role = 'super_admin' then
      if not public.is_master() then
        raise exception 'Acesso administrativo não autorizado.';
      end if;
    elsif profile_role = 'supervisor_area' then
      if profile_area is distinct from new.area_id then
        raise exception 'O supervisor só pode registrar relatório na própria área.';
      end if;
    elsif profile_role = 'mecanico' then
      if profile_area is distinct from new.area_id then
        raise exception 'O mecânico só pode registrar relatório na própria área.';
      end if;
      if not public.is_mechanic_assigned_to_equipment(
        new.area_id,new.equipment_id,new.report_date,auth.uid()
      ) then
        raise exception 'Você não está escalado para este equipamento nesta data.';
      end if;
    else
      raise exception 'Este perfil não pode registrar relatório de final de turno.';
    end if;

    new.created_by_name := coalesce(profile_name,'');
  elsif new.area_id is distinct from old.area_id
     or new.equipment_id is distinct from old.equipment_id
     or new.report_date is distinct from old.report_date
     or new.created_by is distinct from old.created_by
     or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'Não é permitido alterar a identificação do relatório de turno.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists operational_shift_reports_validate on public.operational_shift_reports;
create trigger operational_shift_reports_validate
before insert or update on public.operational_shift_reports
for each row execute function public.validate_operational_shift_report();

drop policy if exists operational_shift_reports_insert_mechanic on public.operational_shift_reports;
drop policy if exists operational_shift_reports_insert_authorized on public.operational_shift_reports;
create policy operational_shift_reports_insert_authorized
on public.operational_shift_reports
for insert to authenticated
with check (
  created_by = auth.uid()
  and (
    public.has_operational_access(area_id)
    or (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.active = true
          and p.role = 'mecanico'
          and p.operational_area_id = area_id
      )
      and public.is_mechanic_assigned_to_equipment(
        area_id,equipment_id,report_date,auth.uid()
      )
    )
  )
);

commit;
