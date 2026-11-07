-- Histórico imutável de status e evolução das ordens de serviço.
-- A estrutura é aditiva; apenas corrige autoria/origem de snapshots do rascunho anterior.
-- Esta etapa mantém compatibilidade com clientes antigos. Proteções de escrita ficam na 015.

begin;

alter table public.operational_equipment
  add column if not exists maintenance_type text;

do $$
declare
  v_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
  into v_type
  from pg_attribute a
  where a.attrelid = 'public.operational_equipment'::regclass
    and a.attname = 'maintenance_type'
    and not a.attisdropped;
  if v_type is distinct from 'text' then
    raise exception 'Conflito: operational_equipment.maintenance_type deve ser text (encontrado: %).', v_type;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'operational_equipment_maintenance_type_consistency'
      and conrelid = 'public.operational_equipment'::regclass
  ) then
    alter table public.operational_equipment
      add constraint operational_equipment_maintenance_type_consistency
      check (status = 'maintenance' or maintenance_type is null);
  elsif not exists (
    select 1 from pg_constraint
    where conname = 'operational_equipment_maintenance_type_consistency'
      and conrelid = 'public.operational_equipment'::regclass
      and pg_get_constraintdef(oid) like '%status = ''maintenance''%'
      and pg_get_constraintdef(oid) like '%maintenance_type IS NULL%'
  ) then
    raise exception 'Conflito: a constraint operational_equipment_maintenance_type_consistency tem outra definição.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'operational_equipment_maintenance_type_allowed'
      and conrelid = 'public.operational_equipment'::regclass
  ) then
    alter table public.operational_equipment
      add constraint operational_equipment_maintenance_type_allowed
      check (maintenance_type is null or maintenance_type in ('preventive', 'corrective', 'tire_shop'));
  elsif not exists (
    select 1 from pg_constraint
    where conname = 'operational_equipment_maintenance_type_allowed'
      and conrelid = 'public.operational_equipment'::regclass
      and pg_get_constraintdef(oid) like '%preventive%'
      and pg_get_constraintdef(oid) like '%corrective%'
      and pg_get_constraintdef(oid) like '%tire_shop%'
  ) then
    raise exception 'Conflito: a constraint operational_equipment_maintenance_type_allowed tem outra definição.';
  end if;
end;
$$;

alter table public.operational_work_orders
  add column if not exists maintenance_type text,
  add column if not exists diagnosis text not null default '',
  add column if not exists responsible_name text not null default '',
  add column if not exists expected_completion_at timestamptz,
  add column if not exists closed_by uuid references auth.users(id) on delete set null,
  add column if not exists closure_notes text not null default '',
  add column if not exists released_at timestamptz;

do $$
declare
  v_column record;
  v_type text;
  v_not_null boolean;
begin
  for v_column in
    select * from (values
      ('maintenance_type', 'text', false),
      ('diagnosis', 'text', true),
      ('responsible_name', 'text', true),
      ('expected_completion_at', 'timestamp with time zone', false),
      ('closed_by', 'uuid', false),
      ('closure_notes', 'text', true),
      ('released_at', 'timestamp with time zone', false)
    ) as expected(name, data_type, required)
  loop
    select format_type(a.atttypid, a.atttypmod), a.attnotnull
    into v_type, v_not_null
    from pg_attribute a
    where a.attrelid = 'public.operational_work_orders'::regclass
      and a.attname = v_column.name
      and not a.attisdropped;
    if v_type is distinct from v_column.data_type
      or v_not_null is distinct from v_column.required then
      raise exception 'Conflito: operational_work_orders.% deve ser % (NOT NULL: %); encontrado % (NOT NULL: %).',
        v_column.name, v_column.data_type, v_column.required, v_type, v_not_null;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
  into v_type
  from pg_attribute a
  where a.attrelid = 'public.operational_work_orders'::regclass
    and a.attname = 'maintenance_type'
    and not a.attisdropped;
  if v_type is distinct from 'text' then
    raise exception 'Conflito: operational_work_orders.maintenance_type deve ser text (encontrado: %).', v_type;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'operational_work_orders_maintenance_type_allowed'
      and conrelid = 'public.operational_work_orders'::regclass
  ) then
    alter table public.operational_work_orders
      add constraint operational_work_orders_maintenance_type_allowed
      check (maintenance_type is null or maintenance_type in ('preventive', 'corrective'));
  elsif not exists (
    select 1 from pg_constraint
    where conname = 'operational_work_orders_maintenance_type_allowed'
      and conrelid = 'public.operational_work_orders'::regclass
      and pg_get_constraintdef(oid) like '%preventive%'
      and pg_get_constraintdef(oid) like '%corrective%'
  ) then
    raise exception 'Conflito: a constraint operational_work_orders_maintenance_type_allowed tem outra definição.';
  end if;
end;
$$;

create table if not exists public.operational_equipment_status_history (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  equipment_id uuid not null references public.operational_equipment(id) on delete restrict,
  previous_status text check (previous_status in ('available', 'stopped', 'maintenance', 'inactive')),
  new_status text not null check (new_status in ('available', 'stopped', 'maintenance', 'inactive')),
  maintenance_type text check (maintenance_type in ('preventive', 'corrective', 'tire_shop')),
  changed_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null default '',
  reason text not null,
  notes text not null default '',
  work_order_id uuid references public.operational_work_orders(id) on delete set null,
  source text not null default 'application'
    check (source in ('initial_snapshot', 'equipment_creation', 'application', 'legacy_application')),
  created_at timestamptz not null default now(),
  check (new_status = 'maintenance' or maintenance_type is null)
);

alter table public.operational_equipment_status_history
  add column if not exists source text not null default 'application';

do $$
declare
  v_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
  into v_type
  from pg_attribute a
  where a.attrelid = 'public.operational_equipment_status_history'::regclass
    and a.attname = 'source'
    and not a.attisdropped;
  if v_type is distinct from 'text' then
    raise exception 'Conflito: operational_equipment_status_history.source deve ser text (encontrado: %).', v_type;
  end if;

  update public.operational_equipment_status_history
  set actor_id = null,
      actor_name = '',
      source = 'initial_snapshot'
  where reason = 'Situação atual registrada na implantação do histórico; alterações anteriores não estão disponíveis.';

  if not exists (
    select 1 from pg_constraint
    where conname = 'operational_equipment_status_history_source_allowed'
      and conrelid = 'public.operational_equipment_status_history'::regclass
  ) then
    alter table public.operational_equipment_status_history
      add constraint operational_equipment_status_history_source_allowed
      check (source in ('initial_snapshot', 'equipment_creation', 'application', 'legacy_application'));
  elsif not exists (
    select 1 from pg_constraint
    where conname = 'operational_equipment_status_history_source_allowed'
      and conrelid = 'public.operational_equipment_status_history'::regclass
      and pg_get_constraintdef(oid) like '%initial_snapshot%'
      and pg_get_constraintdef(oid) like '%legacy_application%'
  ) then
    raise exception 'Conflito: a constraint operational_equipment_status_history_source_allowed tem outra definição.';
  end if;
end;
$$;

create index if not exists operational_equipment_status_history_timeline_idx
  on public.operational_equipment_status_history(area_id, equipment_id, changed_at desc);
create index if not exists operational_equipment_status_history_work_order_idx
  on public.operational_equipment_status_history(work_order_id)
  where work_order_id is not null;

create table if not exists public.operational_work_order_activities (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  equipment_id uuid not null references public.operational_equipment(id) on delete restrict,
  work_order_id uuid not null references public.operational_work_orders(id) on delete restrict,
  supersedes_id uuid references public.operational_work_order_activities(id) on delete restrict,
  activity_type text not null check (activity_type in ('activity', 'pending', 'impediment', 'closure')),
  title text not null,
  description text not null default '',
  notes text not null default '',
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'completed', 'blocked')),
  responsible_name text not null default '',
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at)
);

do $$
declare
  v_column record;
  v_type text;
  v_not_null boolean;
begin
  for v_column in
    select * from (values
      ('public.operational_equipment_status_history', 'id', 'uuid', true),
      ('public.operational_equipment_status_history', 'area_id', 'text', true),
      ('public.operational_equipment_status_history', 'equipment_id', 'uuid', true),
      ('public.operational_equipment_status_history', 'previous_status', 'text', false),
      ('public.operational_equipment_status_history', 'new_status', 'text', true),
      ('public.operational_equipment_status_history', 'maintenance_type', 'text', false),
      ('public.operational_equipment_status_history', 'changed_at', 'timestamp with time zone', true),
      ('public.operational_equipment_status_history', 'actor_id', 'uuid', false),
      ('public.operational_equipment_status_history', 'actor_name', 'text', true),
      ('public.operational_equipment_status_history', 'reason', 'text', true),
      ('public.operational_equipment_status_history', 'notes', 'text', true),
      ('public.operational_equipment_status_history', 'work_order_id', 'uuid', false),
      ('public.operational_equipment_status_history', 'source', 'text', true),
      ('public.operational_equipment_status_history', 'created_at', 'timestamp with time zone', true),
      ('public.operational_work_order_activities', 'id', 'uuid', true),
      ('public.operational_work_order_activities', 'area_id', 'text', true),
      ('public.operational_work_order_activities', 'equipment_id', 'uuid', true),
      ('public.operational_work_order_activities', 'work_order_id', 'uuid', true),
      ('public.operational_work_order_activities', 'supersedes_id', 'uuid', false),
      ('public.operational_work_order_activities', 'activity_type', 'text', true),
      ('public.operational_work_order_activities', 'title', 'text', true),
      ('public.operational_work_order_activities', 'description', 'text', true),
      ('public.operational_work_order_activities', 'notes', 'text', true),
      ('public.operational_work_order_activities', 'status', 'text', true),
      ('public.operational_work_order_activities', 'responsible_name', 'text', true),
      ('public.operational_work_order_activities', 'started_at', 'timestamp with time zone', false),
      ('public.operational_work_order_activities', 'ended_at', 'timestamp with time zone', false),
      ('public.operational_work_order_activities', 'created_by', 'uuid', false),
      ('public.operational_work_order_activities', 'created_by_name', 'text', true),
      ('public.operational_work_order_activities', 'created_at', 'timestamp with time zone', true)
    ) as expected(table_name, name, data_type, required)
  loop
    select format_type(a.atttypid, a.atttypmod), a.attnotnull
    into v_type, v_not_null
    from pg_attribute a
    where a.attrelid = to_regclass(v_column.table_name)
      and a.attname = v_column.name
      and not a.attisdropped;
    if v_type is distinct from v_column.data_type
      or v_not_null is distinct from v_column.required then
      raise exception 'Conflito: %.% deve ser % (NOT NULL: %); encontrado % (NOT NULL: %).',
        v_column.table_name, v_column.name, v_column.data_type, v_column.required, v_type, v_not_null;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_reference record;
  v_source oid;
  v_target oid;
  v_source_attnum smallint;
  v_target_attnum smallint;
  v_foreign_key_count integer;
  v_foreign_key_matches boolean;
begin
  for v_reference in
    select * from (values
      ('public.operational_work_orders', 'closed_by', 'auth.users', 'n', 'operational_work_orders_closed_by_014_fk'),
      ('public.operational_equipment_status_history', 'area_id', 'public.operational_areas', 'a', 'operational_equipment_status_history_area_014_fk'),
      ('public.operational_equipment_status_history', 'equipment_id', 'public.operational_equipment', 'r', 'operational_equipment_status_history_equipment_014_fk'),
      ('public.operational_equipment_status_history', 'actor_id', 'auth.users', 'n', 'operational_equipment_status_history_actor_014_fk'),
      ('public.operational_equipment_status_history', 'work_order_id', 'public.operational_work_orders', 'n', 'operational_equipment_status_history_work_order_014_fk'),
      ('public.operational_work_order_activities', 'area_id', 'public.operational_areas', 'a', 'operational_work_order_activities_area_014_fk'),
      ('public.operational_work_order_activities', 'equipment_id', 'public.operational_equipment', 'r', 'operational_work_order_activities_equipment_014_fk'),
      ('public.operational_work_order_activities', 'work_order_id', 'public.operational_work_orders', 'r', 'operational_work_order_activities_work_order_014_fk'),
      ('public.operational_work_order_activities', 'supersedes_id', 'public.operational_work_order_activities', 'r', 'operational_work_order_activities_supersedes_014_fk'),
      ('public.operational_work_order_activities', 'created_by', 'auth.users', 'n', 'operational_work_order_activities_created_by_014_fk')
    ) as expected(source_table, source_column, target_table, delete_action, constraint_name)
  loop
    v_source := to_regclass(v_reference.source_table);
    v_target := to_regclass(v_reference.target_table);
    select attnum into v_source_attnum
    from pg_attribute
    where attrelid = v_source and attname = v_reference.source_column and not attisdropped;
    select attnum into v_target_attnum
    from pg_attribute
    where attrelid = v_target and attname = 'id' and not attisdropped;
    if v_source_attnum is null or v_target_attnum is null then
      raise exception 'Conflito: não foi possível resolver a referência %.% → %.id.',
        v_reference.source_table, v_reference.source_column, v_reference.target_table;
    end if;

    select count(*),
      coalesce(bool_and(
        c.confrelid = v_target
        and cardinality(c.conkey) = 1
        and c.conkey[1] = v_source_attnum
        and c.confkey = array[v_target_attnum]::smallint[]
        and c.confupdtype::text = 'a'
        and c.confdeltype::text = v_reference.delete_action
        and c.confmatchtype::text = 's'
      ), false)
    into v_foreign_key_count, v_foreign_key_matches
    from pg_constraint c
    where c.conrelid = v_source
      and c.contype = 'f'
      and v_source_attnum = any(c.conkey);

    if v_foreign_key_count = 0 then
      execute format(
        'alter table %s add constraint %I foreign key (%I) references %s(id) on delete %s',
        v_source, v_reference.constraint_name, v_reference.source_column, v_target,
        case v_reference.delete_action
          when 'n' then 'set null'
          when 'r' then 'restrict'
          else 'no action'
        end
      );
    elsif v_foreign_key_count <> 1 or not v_foreign_key_matches then
      raise exception 'Conflito: a referência %.% não aponta corretamente para %.id.',
        v_reference.source_table, v_reference.source_column, v_reference.target_table;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_check record;
begin
  for v_check in
    select * from (values
      ('public.operational_equipment_status_history', array['available', 'stopped', 'maintenance', 'inactive']),
      ('public.operational_equipment_status_history', array['preventive', 'corrective', 'tire_shop']),
      ('public.operational_equipment_status_history', array['new_status', 'maintenance_type']),
      ('public.operational_work_order_activities', array['activity', 'pending', 'impediment', 'closure']),
      ('public.operational_work_order_activities', array['open', 'in_progress', 'completed', 'blocked']),
      ('public.operational_work_order_activities', array['ended_at', 'started_at'])
    ) as expected(table_name, required_fragments)
  loop
    if not exists (
      select 1
      from pg_constraint c
      where c.conrelid = to_regclass(v_check.table_name)
        and c.contype = 'c'
        and not exists (
          select 1
          from unnest(v_check.required_fragments) as fragment(value)
          where position(fragment.value in pg_get_constraintdef(c.oid)) = 0
        )
    ) then
      raise exception 'Conflito: falta uma CHECK constraint compatível em % para os valores/regras esperados.',
        v_check.table_name;
    end if;
  end loop;
end;
$$;

create index if not exists operational_work_order_activities_timeline_idx
  on public.operational_work_order_activities(area_id, work_order_id, created_at desc);
create index if not exists operational_work_order_activities_equipment_idx
  on public.operational_work_order_activities(equipment_id, created_at desc);
create unique index if not exists operational_work_order_activity_one_successor_idx
  on public.operational_work_order_activities(supersedes_id)
  where supersedes_id is not null;

do $$
begin
  if exists (
    select 1
    from public.operational_equipment_status_history
    where source = 'initial_snapshot'
    group by equipment_id
    having count(*) > 1
  ) then
    raise exception 'Conflito: existe mais de um snapshot inicial para algum equipamento; revise os registros antes de continuar.';
  end if;
end;
$$;

create unique index if not exists operational_equipment_status_history_one_initial_snapshot_idx
  on public.operational_equipment_status_history(equipment_id)
  where source = 'initial_snapshot';

do $$
declare
  v_index record;
  v_definition text;
  v_predicate text;
  v_unique boolean;
begin
  for v_index in
    select * from (values
      ('operational_equipment_status_history_timeline_idx', '(area_id, equipment_id, changed_at DESC)', false, ''),
      ('operational_equipment_status_history_work_order_idx', '(work_order_id)', false, 'work_order_id IS NOT NULL'),
      ('operational_work_order_activities_timeline_idx', '(area_id, work_order_id, created_at DESC)', false, ''),
      ('operational_work_order_activities_equipment_idx', '(equipment_id, created_at DESC)', false, ''),
      ('operational_work_order_activity_one_successor_idx', '(supersedes_id)', true, 'supersedes_id IS NOT NULL'),
      ('operational_equipment_status_history_one_initial_snapshot_idx', '(equipment_id)', true, 'source = ''initial_snapshot''')
    ) as expected(name, columns_sql, is_unique, predicate_sql)
  loop
    select pg_get_indexdef(c.oid), i.indisunique, pg_get_expr(i.indpred, i.indrelid)
    into v_definition, v_unique, v_predicate
    from pg_class c
    join pg_index i on i.indexrelid = c.oid
    where c.oid = to_regclass('public.' || v_index.name);
    if v_definition is null
      or position(v_index.columns_sql in v_definition) = 0
      or v_unique is distinct from v_index.is_unique
      or (v_index.predicate_sql = '' and v_predicate is not null)
      or (v_index.predicate_sql <> '' and position(v_index.predicate_sql in coalesce(v_predicate, '')) = 0) then
      raise exception 'Conflito: o índice % tem uma definição diferente da esperada pela migration 014.', v_index.name;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_function record;
  v_oid oid;
  v_comment text;
begin
  for v_function in
    select * from (values
      ('public.validate_operational_work_order_activity()', 'relatoriopro:014:validate-operational-work-order-activity:v2'),
      ('public.record_legacy_operational_work_order_closure()', 'relatoriopro:014:record-legacy-work-order-closure:v2'),
      ('public.record_operational_equipment_status()', 'relatoriopro:014:record-equipment-status:v2'),
      ('public.create_operational_equipment(text,text,text,text,text,text,text,numeric,text,text,text)', 'relatoriopro:014:create-equipment:v2'),
      ('public.transition_operational_equipment_status(text,uuid,text,text,text,text,uuid)', 'relatoriopro:014:transition-equipment-status:v2'),
      ('public.close_operational_work_order(text,uuid,text,text,boolean,text)', 'relatoriopro:014:close-work-order:v2')
    ) as expected(signature, marker)
  loop
    v_oid := to_regprocedure(v_function.signature);
    if v_oid is not null then
      v_comment := obj_description(v_oid, 'pg_proc');
      if left(v_comment, length(v_function.marker) + 1) is distinct from v_function.marker || ':'
        or right(v_comment, 32) is distinct from md5(pg_get_functiondef(v_oid)) then
        raise exception 'Conflito: a função % já existe sem a marca esperada da migration 014; revise sua definição antes de continuar.',
          v_function.signature;
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.validate_operational_work_order_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_name text;
begin
  if not public.has_operational_access(new.area_id) then
    raise exception 'Sem permissão para esta área operacional.';
  end if;

  if not exists (
    select 1
    from public.operational_work_orders w
    where w.id = new.work_order_id
      and w.area_id = new.area_id
      and w.equipment_id = new.equipment_id
  ) then
    raise exception 'A atividade e a ordem de serviço devem pertencer ao mesmo equipamento e área.';
  end if;

  if new.activity_type = 'closure'
    and current_setting('app.operational_work_order_closure', true) is distinct from 'on' then
    raise exception 'O registro de encerramento deve ser criado pelo fluxo de conclusão da OS.';
  end if;
  if new.supersedes_id is not null and not exists (
    select 1 from public.operational_work_order_activities previous
    where previous.id = new.supersedes_id
      and previous.work_order_id = new.work_order_id
      and previous.area_id = new.area_id
      and previous.equipment_id = new.equipment_id
      and previous.activity_type = new.activity_type
      and previous.activity_type <> 'closure'
  ) then
    raise exception 'A revisão deve se referir a uma atividade do mesmo tipo, equipamento e ordem de serviço.';
  end if;

  if new.activity_type <> 'closure' and exists (
    select 1 from public.operational_work_orders w
    where w.id = new.work_order_id and w.status in ('completed', 'cancelled')
  ) then
    raise exception 'Não é possível adicionar atividades a uma OS encerrada ou cancelada.';
  end if;

  new.created_by := auth.uid();
  select p.name into v_actor_name
  from public.profiles p
  where p.id = auth.uid();
  new.created_by_name := coalesce(v_actor_name, '');
  return new;
end;
$$;

revoke all on function public.validate_operational_work_order_activity() from public, anon, authenticated;

drop trigger if exists operational_work_order_activity_validate
  on public.operational_work_order_activities;
create trigger operational_work_order_activity_validate
before insert on public.operational_work_order_activities
for each row execute function public.validate_operational_work_order_activity();

create or replace function public.record_legacy_operational_work_order_closure()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status is distinct from 'completed'
    and new.status = 'completed'
    and current_setting('app.operational_work_order_closure', true) is distinct from 'on' then
    perform set_config('app.operational_work_order_closure', 'on', true);
    insert into public.operational_work_order_activities (
      area_id, equipment_id, work_order_id, activity_type, title,
      description, status, created_by
    ) values (
      new.area_id, new.equipment_id, new.id, 'closure',
      'Encerramento registrado',
      'OS encerrada pela versão anterior da aplicação; detalhes do encerramento não foram registrados.',
      'completed', auth.uid()
    );
    perform set_config('app.operational_work_order_closure', '', true);
  end if;
  return new;
end;
$$;

revoke all on function public.record_legacy_operational_work_order_closure() from public, anon, authenticated;
drop trigger if exists operational_work_order_legacy_closure_history
  on public.operational_work_orders;
create trigger operational_work_order_legacy_closure_history
after update of status on public.operational_work_orders
for each row execute function public.record_legacy_operational_work_order_closure();

alter table public.operational_equipment_status_history enable row level security;
do $$
declare
  v_policy record;
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'operational_equipment_status_history'
      and policyname <> 'operational_equipment_status_history_read_scope'
  ) then
    raise exception 'Conflito: há policies adicionais na tabela operational_equipment_status_history; revise-as antes de continuar.';
  end if;

  select * into v_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'operational_equipment_status_history'
    and policyname = 'operational_equipment_status_history_read_scope';
  if found and (
    v_policy.cmd <> 'SELECT'
    or cardinality(v_policy.roles) <> 1
    or v_policy.roles[1] <> 'authenticated'
    or position('has_operational_access' in coalesce(v_policy.qual, '')) = 0
    or position(' or ' in lower(coalesce(v_policy.qual, ''))) > 0
  ) then
    raise exception 'Conflito: a policy operational_equipment_status_history_read_scope tem outra definição.';
  end if;
end;
$$;
drop policy if exists operational_equipment_status_history_read_scope
  on public.operational_equipment_status_history;
create policy operational_equipment_status_history_read_scope
on public.operational_equipment_status_history
for select to authenticated
using (public.has_operational_access(area_id));
revoke all on public.operational_equipment_status_history from anon, authenticated;
grant select on public.operational_equipment_status_history to authenticated;

alter table public.operational_work_order_activities enable row level security;
do $$
declare
  v_policy record;
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'operational_work_order_activities'
      and policyname not in (
        'operational_work_order_activities_read_scope',
        'operational_work_order_activities_create_scope'
      )
  ) then
    raise exception 'Conflito: há policies adicionais na tabela operational_work_order_activities; revise-as antes de continuar.';
  end if;

  select * into v_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'operational_work_order_activities'
    and policyname = 'operational_work_order_activities_read_scope';
  if found and (
    v_policy.cmd <> 'SELECT'
    or cardinality(v_policy.roles) <> 1
    or v_policy.roles[1] <> 'authenticated'
    or position('has_operational_access' in coalesce(v_policy.qual, '')) = 0
    or position(' or ' in lower(coalesce(v_policy.qual, ''))) > 0
  ) then
    raise exception 'Conflito: a policy operational_work_order_activities_read_scope tem outra definição.';
  end if;
  select * into v_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'operational_work_order_activities'
    and policyname = 'operational_work_order_activities_create_scope';
  if found and (
    v_policy.cmd <> 'INSERT'
    or cardinality(v_policy.roles) <> 1
    or v_policy.roles[1] <> 'authenticated'
    or position('has_operational_access' in coalesce(v_policy.with_check, '')) = 0
    or position('auth.uid' in coalesce(v_policy.with_check, '')) = 0
    or position(' or ' in lower(coalesce(v_policy.with_check, ''))) > 0
  ) then
    raise exception 'Conflito: a policy operational_work_order_activities_create_scope tem outra definição.';
  end if;
end;
$$;
drop policy if exists operational_work_order_activities_read_scope
  on public.operational_work_order_activities;
create policy operational_work_order_activities_read_scope
on public.operational_work_order_activities
for select to authenticated
using (public.has_operational_access(area_id));
drop policy if exists operational_work_order_activities_create_scope
  on public.operational_work_order_activities;
create policy operational_work_order_activities_create_scope
on public.operational_work_order_activities
for insert to authenticated
with check (public.has_operational_access(area_id) and created_by = auth.uid());
revoke all on public.operational_work_order_activities from anon, authenticated;
grant select, insert on public.operational_work_order_activities to authenticated;

-- Remove enforcement from an earlier draft of this migration, if present.
do $$
declare
  v_trigger record;
  v_comment text;
  v_function oid;
begin
  for v_trigger in
    select * from (values
      ('public.operational_equipment'::regclass, 'operational_equipment_status_change_guard', 'public.guard_operational_equipment_status_change()'),
      ('public.operational_work_orders'::regclass, 'operational_work_order_closure_guard', 'public.guard_operational_work_order_closure()')
    ) as expected(table_oid, trigger_name, function_signature)
  loop
    if exists (
      select 1 from pg_trigger
      where tgrelid = v_trigger.table_oid
        and tgname = v_trigger.trigger_name
        and not tgisinternal
    ) then
      v_function := to_regprocedure(v_trigger.function_signature);
      if v_function is null then
        raise exception 'Conflito: o trigger % referencia uma função que não existe.', v_trigger.trigger_name;
      end if;
      v_comment := obj_description(v_function, 'pg_proc');
      if v_comment like 'relatoriopro:015:%' then
        continue;
      elsif v_comment is not null then
        raise exception 'Conflito: o trigger % usa uma função com marca inesperada; revise antes de continuar.',
          v_trigger.trigger_name;
      end if;
      execute format('drop trigger %I on %s', v_trigger.trigger_name, v_trigger.table_oid);
      execute format('drop function %s', v_function::regprocedure);
    end if;
  end loop;
end;
$$;

create or replace function public.record_operational_equipment_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text;
  v_actor_name text;
  v_work_order_id uuid;
  v_previous_status text;
  v_source text;
begin
  if tg_op = 'UPDATE' then
    if old.status is not distinct from new.status
      and old.maintenance_type is not distinct from new.maintenance_type then
      return new;
    end if;
    v_previous_status := old.status;
  end if;

  v_reason := nullif(btrim(current_setting('app.operational_status_reason', true)), '');
  v_source := nullif(current_setting('app.operational_status_origin', true), '');
  if v_source is null or v_source not in ('equipment_creation', 'application') then
    v_source := 'legacy_application';
  end if;
  if v_reason is null then
    if tg_op = 'UPDATE' then
      v_reason := 'Alteração registrada pela versão anterior da aplicação; o motivo não foi informado.';
    else
      v_reason := 'Cadastro registrado pela versão anterior da aplicação; condição inicial informada não disponível.';
    end if;
  end if;
  v_work_order_id := nullif(current_setting('app.operational_status_work_order_id', true), '')::uuid;

  if v_work_order_id is not null and not exists (
    select 1 from public.operational_work_orders w
    where w.id = v_work_order_id
      and w.area_id = new.area_id
      and w.equipment_id = new.id
  ) then
    raise exception 'A ordem de serviço informada não pertence ao equipamento.';
  end if;

  select p.name into v_actor_name
  from public.profiles p
  where p.id = auth.uid();

  insert into public.operational_equipment_status_history (
    area_id, equipment_id, previous_status, new_status, maintenance_type,
    changed_at, actor_id, actor_name, reason, notes, work_order_id, source
  ) values (
    new.area_id, new.id, v_previous_status,
    new.status, new.maintenance_type, now(), auth.uid(),
    coalesce(v_actor_name, ''), v_reason,
    coalesce(current_setting('app.operational_status_notes', true), ''),
    v_work_order_id, v_source
  );
  return new;
end;
$$;

revoke all on function public.record_operational_equipment_status() from public, anon, authenticated;

drop trigger if exists operational_equipment_status_history_record on public.operational_equipment;
create trigger operational_equipment_status_history_record
after insert or update of status, maintenance_type on public.operational_equipment
for each row execute function public.record_operational_equipment_status();

insert into public.operational_equipment_status_history (
  area_id, equipment_id, previous_status, new_status, maintenance_type,
  actor_id, actor_name, reason, notes, source
)
select e.area_id, e.id, null, e.status, e.maintenance_type,
       null, '',
       'Situação atual registrada na implantação do histórico; alterações anteriores não estão disponíveis.',
       'Snapshot inicial criado durante a implantação do histórico; autoria e alterações anteriores não estão disponíveis.',
       'initial_snapshot'
from public.operational_equipment e
where not exists (
  select 1
  from public.operational_equipment_status_history h
  where h.equipment_id = e.id
);

create or replace function public.create_operational_equipment(
  p_area_id text,
  p_asset_code text,
  p_description text,
  p_brand text,
  p_model text,
  p_category text,
  p_status text,
  p_current_horimeter numeric,
  p_maintenance_type text,
  p_initial_reason text,
  p_initial_notes text default ''
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_equipment_id uuid;
begin
  if not public.has_operational_access(p_area_id) then
    raise exception 'Sem permissão para esta área operacional.';
  end if;
  if nullif(btrim(p_initial_reason), '') is null then
    raise exception 'Informe a condição inicial do equipamento.';
  end if;
  if p_status = 'maintenance' and p_maintenance_type is null then
    raise exception 'Selecione o tipo de manutenção inicial.';
  end if;
  if p_status <> 'maintenance' and p_maintenance_type is not null then
    raise exception 'O tipo de manutenção só pode ser informado para equipamento em manutenção.';
  end if;

  perform set_config('app.operational_status_reason', btrim(p_initial_reason), true);
  perform set_config('app.operational_status_notes', coalesce(p_initial_notes, ''), true);
  perform set_config('app.operational_status_origin', 'equipment_creation', true);
  insert into public.operational_equipment (
    area_id, asset_code, description, brand, model, category, status,
    current_horimeter, maintenance_type, created_by, updated_by
  ) values (
    p_area_id, btrim(p_asset_code), coalesce(p_description, ''), coalesce(p_brand, ''),
    coalesce(p_model, ''), coalesce(p_category, 'caminhao'), p_status,
    coalesce(p_current_horimeter, 0), p_maintenance_type, auth.uid(), auth.uid()
  )
  returning id into v_equipment_id;
  perform set_config('app.operational_status_reason', '', true);
  perform set_config('app.operational_status_notes', '', true);
  perform set_config('app.operational_status_origin', '', true);
  return v_equipment_id;
end;
$$;

revoke all on function public.create_operational_equipment(text,text,text,text,text,text,text,numeric,text,text,text)
  from public, anon;
grant execute on function public.create_operational_equipment(text,text,text,text,text,text,text,numeric,text,text,text)
  to authenticated;

create or replace function public.transition_operational_equipment_status(
  p_area_id text,
  p_equipment_id uuid,
  p_new_status text,
  p_maintenance_type text,
  p_reason text,
  p_notes text default '',
  p_work_order_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_current_status text;
  v_current_type text;
begin
  if not public.has_operational_access(p_area_id) then
    raise exception 'Sem permissão para esta área operacional.';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Informe o motivo da alteração de status.';
  end if;
  if p_new_status not in ('available', 'stopped', 'maintenance', 'inactive') then
    raise exception 'Status operacional inválido.';
  end if;
  if p_new_status = 'maintenance' and p_maintenance_type is null then
    raise exception 'Selecione o tipo de manutenção.';
  end if;
  if p_new_status <> 'maintenance' and p_maintenance_type is not null then
    raise exception 'O tipo de manutenção só pode ser informado para equipamento em manutenção.';
  end if;

  select e.status, e.maintenance_type
  into v_current_status, v_current_type
  from public.operational_equipment e
  where e.id = p_equipment_id and e.area_id = p_area_id
  for update;
  if not found then
    raise exception 'Equipamento não encontrado nesta área.';
  end if;
  if v_current_status is not distinct from p_new_status
    and v_current_type is not distinct from p_maintenance_type then
    raise exception 'O equipamento já está nesta condição.';
  end if;
  if p_work_order_id is not null and not exists (
    select 1 from public.operational_work_orders w
    where w.id = p_work_order_id
      and w.area_id = p_area_id
      and w.equipment_id = p_equipment_id
  ) then
    raise exception 'A ordem de serviço informada não pertence ao equipamento.';
  end if;

  perform set_config('app.operational_status_transition', 'on', true);
  perform set_config('app.operational_status_reason', btrim(p_reason), true);
  perform set_config('app.operational_status_notes', coalesce(p_notes, ''), true);
  perform set_config('app.operational_status_origin', 'application', true);
  perform set_config('app.operational_status_work_order_id', coalesce(p_work_order_id::text, ''), true);
  update public.operational_equipment
  set status = p_new_status,
      maintenance_type = p_maintenance_type,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_equipment_id and area_id = p_area_id;
  perform set_config('app.operational_status_transition', '', true);
  perform set_config('app.operational_status_reason', '', true);
  perform set_config('app.operational_status_notes', '', true);
  perform set_config('app.operational_status_origin', '', true);
  perform set_config('app.operational_status_work_order_id', '', true);
end;
$$;

revoke all on function public.transition_operational_equipment_status(text,uuid,text,text,text,text,uuid)
  from public, anon;
grant execute on function public.transition_operational_equipment_status(text,uuid,text,text,text,text,uuid)
  to authenticated;

create or replace function public.close_operational_work_order(
  p_area_id text,
  p_work_order_id uuid,
  p_closure_notes text,
  p_remaining_pending text,
  p_release_equipment boolean,
  p_release_reason text default ''
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order public.operational_work_orders%rowtype;
  v_equipment_status text;
begin
  if not public.has_operational_access(p_area_id) then
    raise exception 'Sem permissão para esta área operacional.';
  end if;
  if nullif(btrim(p_closure_notes), '') is null then
    raise exception 'Registre as atividades concluídas antes de encerrar a OS.';
  end if;
  if p_release_equipment and nullif(btrim(p_release_reason), '') is null then
    raise exception 'Informe o motivo da liberação operacional.';
  end if;

  select * into v_order
  from public.operational_work_orders
  where id = p_work_order_id and area_id = p_area_id
  for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada nesta área.';
  end if;
  if v_order.status in ('completed', 'cancelled') then
    raise exception 'A ordem de serviço já está encerrada ou cancelada.';
  end if;

  select e.status into v_equipment_status
  from public.operational_equipment e
  where e.id = v_order.equipment_id and e.area_id = p_area_id
  for update;
  if not found then
    raise exception 'Equipamento da ordem de serviço não encontrado.';
  end if;
  if p_release_equipment and v_equipment_status not in ('maintenance', 'stopped') then
    raise exception 'O equipamento não está fora de operação; encerre a OS sem registrar nova liberação.';
  end if;

  perform set_config('app.operational_work_order_closure', 'on', true);
  insert into public.operational_work_order_activities (
    area_id, equipment_id, work_order_id, activity_type, title,
    description, notes, status, responsible_name, started_at, ended_at
  ) values (
    p_area_id, v_order.equipment_id, v_order.id, 'closure', 'Encerramento da OS',
    btrim(p_closure_notes), coalesce(p_remaining_pending, ''), 'completed',
    '', now(), now()
  );

  update public.operational_work_orders
  set status = 'completed',
      closed_at = now(),
      closed_by = auth.uid(),
      closure_notes = btrim(p_closure_notes),
      released_at = case when p_release_equipment then now() else null end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = v_order.id and area_id = p_area_id;
  perform set_config('app.operational_work_order_closure', '', true);

  if p_release_equipment then
    perform set_config('app.operational_status_transition', 'on', true);
    perform set_config('app.operational_status_reason', btrim(p_release_reason), true);
    perform set_config('app.operational_status_notes', coalesce(p_remaining_pending, ''), true);
    perform set_config('app.operational_status_origin', 'application', true);
    perform set_config('app.operational_status_work_order_id', v_order.id::text, true);
    update public.operational_equipment
    set status = 'available',
        maintenance_type = null,
        updated_by = auth.uid(),
        updated_at = now()
    where id = v_order.equipment_id and area_id = p_area_id;
    perform set_config('app.operational_status_transition', '', true);
    perform set_config('app.operational_status_reason', '', true);
    perform set_config('app.operational_status_notes', '', true);
    perform set_config('app.operational_status_origin', '', true);
    perform set_config('app.operational_status_work_order_id', '', true);
  end if;
end;
$$;

revoke all on function public.close_operational_work_order(text,uuid,text,text,boolean,text)
  from public, anon;
grant execute on function public.close_operational_work_order(text,uuid,text,text,boolean,text)
  to authenticated;

do $$
declare
  v_function record;
  v_oid oid;
begin
  for v_function in
    select * from (values
      ('public.validate_operational_work_order_activity()', 'relatoriopro:014:validate-operational-work-order-activity:v2'),
      ('public.record_legacy_operational_work_order_closure()', 'relatoriopro:014:record-legacy-work-order-closure:v2'),
      ('public.record_operational_equipment_status()', 'relatoriopro:014:record-equipment-status:v2'),
      ('public.create_operational_equipment(text,text,text,text,text,text,text,numeric,text,text,text)', 'relatoriopro:014:create-equipment:v2'),
      ('public.transition_operational_equipment_status(text,uuid,text,text,text,text,uuid)', 'relatoriopro:014:transition-equipment-status:v2'),
      ('public.close_operational_work_order(text,uuid,text,text,boolean,text)', 'relatoriopro:014:close-work-order:v2')
    ) as expected(signature, marker)
  loop
    v_oid := to_regprocedure(v_function.signature);
    execute format(
      'comment on function %s is %L',
      v_oid::regprocedure,
      v_function.marker || ':' || md5(pg_get_functiondef(v_oid))
    );
  end loop;
end;
$$;

commit;
