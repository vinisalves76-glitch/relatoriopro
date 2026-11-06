-- Enable write guards only after the frontend using the migration 014 RPCs
-- is deployed and legacy clients/open sessions are no longer in use.
-- Do not apply this migration as part of the additive 014 rollout.
-- Apply and validate this file separately; a batch push of 014 and 015 breaks
-- compatibility with clients that still write status/closure fields directly.

begin;

do $$
declare
  v_function record;
  v_oid oid;
  v_comment text;
  v_trigger record;
  v_expected_function oid;
  v_trigger_definition text;
begin
  for v_function in
    select * from (values
      ('public.guard_operational_equipment_status_change()', 'relatoriopro:015:guard-equipment-status:v1'),
      ('public.guard_operational_work_order_closure()', 'relatoriopro:015:guard-work-order-closure:v1')
    ) as expected(signature, marker)
  loop
    v_oid := to_regprocedure(v_function.signature);
    if v_oid is not null then
      v_comment := obj_description(v_oid, 'pg_proc');
      if left(v_comment, length(v_function.marker) + 1) is distinct from v_function.marker || ':'
        or right(v_comment, 32) is distinct from md5(pg_get_functiondef(v_oid)) then
        raise exception 'Conflito: a função % já existe sem a marca esperada da migration 015; revise sua definição antes de continuar.',
          v_function.signature;
      end if;
    end if;
  end loop;

  for v_trigger in
    select * from (values
      ('public.operational_equipment'::regclass, 'operational_equipment_status_change_guard', 'public.guard_operational_equipment_status_change()'),
      ('public.operational_work_orders'::regclass, 'operational_work_order_closure_guard', 'public.guard_operational_work_order_closure()')
    ) as expected(table_oid, trigger_name, function_signature)
  loop
    v_expected_function := to_regprocedure(v_trigger.function_signature);
    select pg_get_triggerdef(t.oid)
    into v_trigger_definition
    from pg_trigger t
    where t.tgrelid = v_trigger.table_oid
      and t.tgname = v_trigger.trigger_name
      and not t.tgisinternal;
    if v_trigger_definition is not null and (
      v_expected_function is null
      or not exists (
        select 1 from pg_trigger t
        where t.tgrelid = v_trigger.table_oid
          and t.tgname = v_trigger.trigger_name
          and t.tgfoid = v_expected_function
          and not t.tgisinternal
      )
    ) then
      raise exception 'Conflito: o trigger % já existe com outra definição.', v_trigger.trigger_name;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_function record;
  v_oid oid;
  v_security_definer boolean;
begin
  for v_function in
    select * from (values
      ('public.transition_operational_equipment_status(text,uuid,text,text,text,text,uuid)'),
      ('public.close_operational_work_order(text,uuid,text,text,boolean,text)')
    ) as expected(signature)
  loop
    v_oid := to_regprocedure(v_function.signature);
    if v_oid is null then
      raise exception 'Não é possível ativar as proteções: a função % não existe.', v_function.signature;
    end if;

    select p.prosecdef into v_security_definer
    from pg_proc p
    where p.oid = v_oid;
    if v_security_definer then
      raise exception 'Não é possível ativar as proteções: % deve permanecer SECURITY INVOKER.', v_function.signature;
    end if;
    if not has_function_privilege('authenticated', v_oid, 'EXECUTE')
      or has_function_privilege('anon', v_oid, 'EXECUTE') then
      raise exception 'Permissões inesperadas na função %; revise antes de ativar as proteções.', v_function.signature;
    end if;
  end loop;
end;
$$;

create or replace function public.guard_operational_equipment_status_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (new.status is distinct from old.status
      or new.maintenance_type is distinct from old.maintenance_type)
    and current_setting('app.operational_status_transition', true) is distinct from 'on' then
    raise exception 'Use o fluxo autorizado para alterar o status operacional.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_operational_equipment_status_change() from public, anon, authenticated;

create or replace function public.guard_operational_work_order_closure()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if (new.status = 'completed'
      or new.closed_at is not null
      or new.closed_by is not null
      or new.closure_notes <> ''
      or new.released_at is not null)
      and current_setting('app.operational_work_order_closure', true) is distinct from 'on' then
      raise exception 'A OS deve ser encerrada pelo fluxo de conclusão.';
    end if;
    return new;
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed'
    and current_setting('app.operational_work_order_closure', true) is distinct from 'on' then
    raise exception 'A OS deve ser encerrada pelo fluxo de conclusão.';
  end if;
  if old.status = 'completed' and new.status <> 'completed' then
    raise exception 'Uma OS encerrada não pode ser reaberta.';
  end if;
  if current_setting('app.operational_work_order_closure', true) is distinct from 'on'
    and (new.closed_at is distinct from old.closed_at
      or new.closed_by is distinct from old.closed_by
      or new.closure_notes is distinct from old.closure_notes
      or new.released_at is distinct from old.released_at) then
    raise exception 'Os dados de encerramento só podem ser alterados pelo fluxo de conclusão.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_operational_work_order_closure() from public, anon, authenticated;

drop trigger if exists operational_equipment_status_change_guard on public.operational_equipment;
create trigger operational_equipment_status_change_guard
before update of status, maintenance_type on public.operational_equipment
for each row execute function public.guard_operational_equipment_status_change();

drop trigger if exists operational_work_order_closure_guard on public.operational_work_orders;
create trigger operational_work_order_closure_guard
before insert or update on public.operational_work_orders
for each row execute function public.guard_operational_work_order_closure();

do $$
declare
  v_function record;
  v_oid oid;
begin
  for v_function in
    select * from (values
      ('public.guard_operational_equipment_status_change()', 'relatoriopro:015:guard-equipment-status:v1'),
      ('public.guard_operational_work_order_closure()', 'relatoriopro:015:guard-work-order-closure:v1')
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
