-- RelatorioPro | Perfil Mecânico e Relatório de Final de Turno
-- Migration aditiva. Revisar e executar manualmente no SQL Editor do Supabase.
-- Não modifica registros existentes nem amplia permissões de escrita em tabelas administrativas.

begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in (
    'super_admin','auxiliar_administrativo','gerente','coordenador',
    'instrutor_tecnico','consultor_tecnico','supervisor_area','mecanico'
  ));

alter table public.profiles
  drop constraint if exists mechanic_requires_operational_area;
alter table public.profiles
  add constraint mechanic_requires_operational_area
  check (role <> 'mecanico' or operational_area_id is not null);

create or replace function public.can_read_operational_area(area_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_operational_access(area_key)
    or exists (
      select 1
      from public.profiles p
      join public.operational_areas a on a.id = p.operational_area_id and a.active = true
      where p.id = auth.uid()
        and p.active = true
        and p.role = 'mecanico'
        and p.operational_area_id = area_key
    );
$$;

revoke all on function public.can_read_operational_area(text) from public, anon;
grant execute on function public.can_read_operational_area(text) to authenticated;

-- Mecânicos podem consultar a frota da própria mina para selecionar a TAG.
-- Escritas na frota continuam restritas à função has_operational_access.
drop policy if exists area_select_scope on public.operational_equipment;
create policy area_select_scope on public.operational_equipment
for select to authenticated
using (public.can_read_operational_area(area_id));

create table if not exists public.operational_shift_reports (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  equipment_id uuid not null references public.operational_equipment(id),
  report_date date not null,
  horimeter numeric(12,1) not null check (horimeter >= 0),
  created_by uuid not null references auth.users(id),
  created_by_name text not null default '',
  other_mechanics text[] not null default '{}',
  work_performed text not null,
  anomalies text not null default '',
  actions_taken text not null default '',
  pending_items text not null default '',
  final_condition text not null check (final_condition in ('available','stopped','maintenance')),
  final_condition_notes text not null default '',
  idempotency_key uuid not null,
  client_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area_id, equipment_id, report_date),
  unique (created_by, idempotency_key)
);

create index if not exists operational_shift_reports_area_date_idx
  on public.operational_shift_reports(area_id, report_date desc);
create index if not exists operational_shift_reports_equipment_date_idx
  on public.operational_shift_reports(equipment_id, report_date desc);

create or replace function public.validate_operational_shift_report()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  equipment_area text;
  mechanic_name text;
begin
  select e.area_id into equipment_area
  from public.operational_equipment e
  where e.id = new.equipment_id;

  if equipment_area is null or equipment_area <> new.area_id then
    raise exception 'O equipamento selecionado não pertence à mina vinculada ao relatório.';
  end if;

  if tg_op = 'INSERT' then
    select p.name into mechanic_name
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role = 'mecanico'
      and p.operational_area_id = new.area_id;

    if auth.uid() is null or new.created_by <> auth.uid() or mechanic_name is null then
      raise exception 'Somente o mecânico ativo vinculado à mina pode enviar o relatório.';
    end if;
    new.created_by_name := mechanic_name;
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

alter table public.operational_shift_reports enable row level security;

drop policy if exists operational_shift_reports_read_scope on public.operational_shift_reports;
create policy operational_shift_reports_read_scope on public.operational_shift_reports
for select to authenticated
using (public.can_read_operational_area(area_id));

drop policy if exists operational_shift_reports_insert_mechanic on public.operational_shift_reports;
create policy operational_shift_reports_insert_mechanic on public.operational_shift_reports
for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role = 'mecanico'
      and p.operational_area_id = area_id
  )
);

drop policy if exists operational_shift_reports_update_author on public.operational_shift_reports;
create policy operational_shift_reports_update_author on public.operational_shift_reports
for update to authenticated
using (
  created_by = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role = 'mecanico'
      and p.operational_area_id = area_id
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role = 'mecanico'
      and p.operational_area_id = area_id
  )
);

revoke all on public.operational_shift_reports from anon;
grant select, insert, update on public.operational_shift_reports to authenticated;

commit;
