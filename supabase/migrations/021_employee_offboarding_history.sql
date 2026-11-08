-- IRMEN / RelatorioPro — desligamento preservando autoria e histórico operacional.
-- Aplicar somente após revisão em homologação. Não transfere registros para outro usuário.
begin;

create table if not exists public.operational_user_snapshots (
  profile_id uuid primary key,
  full_name text not null default '',
  email text not null default '',
  role text not null default '',
  operational_area_id text,
  offboarded_at timestamptz not null default now()
);

create table if not exists public.operational_125h_reassignment_history (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null,
  area_id text not null,
  original_assignee_id uuid not null,
  original_assignee_name text not null default '',
  new_assignee_id uuid not null,
  new_assignee_name text not null default '',
  changed_by uuid not null,
  changed_by_name text not null default '',
  reason text not null,
  changed_at timestamptz not null default now()
);

create index if not exists operational_125h_reassignment_checklist_idx
  on public.operational_125h_reassignment_history(checklist_id, changed_at desc);

alter table public.operational_125h_checklists
  drop constraint if exists operational_125h_checklists_assigned_profile_id_fkey;
alter table public.operational_mechanic_assignments
  drop constraint if exists operational_mechanic_assignments_mechanic_id_fkey;

create or replace function public.snapshot_operational_profile_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.operational_user_snapshots
    (profile_id, full_name, email, role, operational_area_id, offboarded_at)
  values
    (old.id, coalesce(old.name,''), coalesce(old.email,''), coalesce(old.role,''),
     old.operational_area_id, now())
  on conflict (profile_id) do nothing;
  return old;
end;
$$;

drop trigger if exists profiles_snapshot_before_delete on public.profiles;
create trigger profiles_snapshot_before_delete
before delete on public.profiles
for each row execute function public.snapshot_operational_profile_before_delete();

create or replace function public.validate_operational_125h_checklist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area text;
  v_role text;
  v_active boolean;
  v_item text;
  v_initial text[] := array['horimetro','painel','serie','equipamento','transmissao','placaTransmissao','motor'];
  v_items text[] := array[
    'Coxins e suporte do motor','Coxins laterais da transmissão','Suporte da transmissão',
    'Conexão motor/transmissão','Flange de saída da transmissão',
    'Cruzetas — cardã (transmissão/diferencial intermediário)','Cruzetas — cardã entre eixos',
    'Luva e ponteira estriada (Slip Yoke) — transmissão/diferencial intermediário',
    'Luva e ponteira estriada (Slip Yoke) — cardã entre eixos','Lubrificação',
    'Eixo dianteiro','Eixo intermediário','Eixo traseiro',
    'Diferencial intermediário — flange','Diferencial traseiro — flange'
  ];
begin
  select e.area_id into v_area from public.operational_equipment e where e.id=new.equipment_id;
  if v_area is null or v_area<>new.area_id then
    raise exception 'Equipamento não pertence à área operacional do checklist.';
  end if;

  select p.role,p.active into v_role,v_active
  from public.profiles p
  where p.id=new.assigned_profile_id and p.operational_area_id=new.area_id;
  if v_role is distinct from 'mecanico' or v_active is distinct from true then
    raise exception 'O responsável precisa ser um mecânico ativo da mesma área.';
  end if;

  if tg_op='INSERT' then
    if new.status='completed' then
      raise exception 'O checklist deve ser criado como atribuído e concluído pelo mecânico.';
    end if;
    if auth.uid() is null or new.created_by<>auth.uid() or not public.has_operational_access(new.area_id) then
      raise exception 'Somente o supervisor da área ou administrador pode atribuir o checklist.';
    end if;
  else
    if new.id is distinct from old.id or new.area_id is distinct from old.area_id
      or new.equipment_id is distinct from old.equipment_id
      or new.assigned_for is distinct from old.assigned_for
      or new.created_by is distinct from old.created_by then
      raise exception 'A identificação e a autoria do checklist não podem ser alteradas.';
    end if;
    if new.assigned_profile_id is distinct from old.assigned_profile_id
      and (auth.uid() is null or not public.has_operational_access(old.area_id)) then
      raise exception 'Somente o supervisor da área ou administrador pode reatribuir checklist pendente.';
    end if;
    if old.status='completed' then
      raise exception 'Checklist concluído é imutável; uma correção exige uma revisão formal.';
    end if;
    if not public.has_operational_access(old.area_id) then
      if old.assigned_profile_id<>auth.uid() then
        raise exception 'Somente o mecânico atribuído pode editar um checklist ainda não concluído.';
      end if;
      if new.status not in ('in_progress','completed') then
        raise exception 'Status inválido para execução pelo mecânico.';
      end if;
    end if;
  end if;

  if new.status='completed' then
    if nullif(trim(new.technician_name),'') is null or nullif(trim(new.serial_number),'') is null
      or new.horimeter is null or new.horimeter<0 or nullif(trim(new.location),'') is null
      or new.inspection_date is null or new.signature_path is null then
      raise exception 'Identificação, horímetro, local e assinatura são obrigatórios para concluir.';
    end if;
    foreach v_item in array v_initial loop
      if nullif(new.evidence->>v_item,'') is null then
        raise exception 'Falta uma das sete fotos iniciais obrigatórias: %.',v_item;
      end if;
    end loop;
    foreach v_item in array v_items loop
      if coalesce(new.responses->v_item->>'status','') not in ('OK','NOK') then
        raise exception 'Avalie todos os 15 itens antes de concluir: %.',v_item;
      end if;
      if nullif(new.evidence->>('item-'||array_position(v_items,v_item)),'') is null then
        raise exception 'Falta a foto obrigatória do item: %.',v_item;
      end if;
      if new.responses->v_item->>'status'='NOK'
        and nullif(trim(new.responses->v_item->>'observation'),'') is null then
        raise exception 'Descreva a não conformidade do item: %.',v_item;
      end if;
    end loop;
    if tg_op='INSERT' or old.status<>'completed' then
      new.completed_by:=auth.uid();
      new.completed_at:=now();
    end if;
  end if;
  new.updated_at:=now();
  return new;
end;
$$;

create or replace function public.reassign_pending_125h_checklist(
  p_checklist_id uuid,
  p_new_assignee_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checklist public.operational_125h_checklists%rowtype;
  v_old_name text;
  v_new_name text;
  v_actor_name text;
begin
  if auth.uid() is null then
    raise exception 'Sessão obrigatória para reatribuir checklist.';
  end if;
  if nullif(trim(p_reason),'') is null or length(trim(p_reason)) < 8 then
    raise exception 'Informe uma justificativa com pelo menos 8 caracteres.';
  end if;

  select * into v_checklist
  from public.operational_125h_checklists
  where id=p_checklist_id
  for update;
  if not found then raise exception 'Checklist não encontrado.'; end if;
  if v_checklist.status='completed' then
    raise exception 'Checklist concluído não pode ser reatribuído.';
  end if;
  if not public.has_operational_access(v_checklist.area_id) then
    raise exception 'Sem permissão para reatribuir checklist nesta área.';
  end if;

  select coalesce(p.name,s.full_name,'Funcionário desligado')
    into v_old_name
  from (select v_checklist.assigned_profile_id as id) x
  left join public.profiles p on p.id=x.id
  left join public.operational_user_snapshots s on s.profile_id=x.id;

  select name into v_new_name
  from public.profiles
  where id=p_new_assignee_id
    and role='mecanico'
    and active=true
    and operational_area_id=v_checklist.area_id;
  if v_new_name is null then
    raise exception 'O novo responsável precisa ser mecânico ativo da mesma área.';
  end if;

  select coalesce(name,'') into v_actor_name
  from public.profiles where id=auth.uid();

  update public.operational_125h_checklists
  set assigned_profile_id=p_new_assignee_id
  where id=p_checklist_id;

  insert into public.operational_125h_reassignment_history
    (checklist_id,area_id,original_assignee_id,original_assignee_name,
     new_assignee_id,new_assignee_name,changed_by,changed_by_name,reason)
  values
    (p_checklist_id,v_checklist.area_id,v_checklist.assigned_profile_id,coalesce(v_old_name,''),
     p_new_assignee_id,v_new_name,auth.uid(),v_actor_name,trim(p_reason));
end;
$$;

revoke all on function public.reassign_pending_125h_checklist(uuid,uuid,text) from public, anon;
grant execute on function public.reassign_pending_125h_checklist(uuid,uuid,text) to authenticated;

alter table public.operational_user_snapshots enable row level security;
drop policy if exists operational_user_snapshots_read on public.operational_user_snapshots;
create policy operational_user_snapshots_read on public.operational_user_snapshots
for select to authenticated
using (public.is_master() or (operational_area_id is not null and public.has_operational_access(operational_area_id)));

alter table public.operational_125h_reassignment_history enable row level security;
drop policy if exists operational_125h_reassignment_history_read on public.operational_125h_reassignment_history;
create policy operational_125h_reassignment_history_read on public.operational_125h_reassignment_history
for select to authenticated
using (public.has_operational_access(area_id));

revoke all on public.operational_user_snapshots, public.operational_125h_reassignment_history from anon;
grant select on public.operational_user_snapshots, public.operational_125h_reassignment_history to authenticated;

commit;
