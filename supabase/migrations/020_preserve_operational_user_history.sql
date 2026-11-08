-- RelatorioPro / IRMEN — preservação de vínculos operacionais na exclusão de usuários.
-- Migration 020: snapshots de autoria, FKs SET NULL e reatribuição administrativa do checklist 125h.
-- Aplicar no Supabase após revisar. Não apaga checklists nem escalas.

begin;

-- 1) Preservar a identidade do mecânico mesmo depois da remoção do perfil.
alter table public.operational_125h_checklists
  add column if not exists assigned_profile_name_snapshot text not null default '',
  add column if not exists assigned_profile_email_snapshot text not null default '',
  add column if not exists assigned_profile_role_snapshot text not null default '';

update public.operational_125h_checklists c
set assigned_profile_name_snapshot = coalesce(nullif(c.assigned_profile_name_snapshot, ''), p.name, ''),
    assigned_profile_email_snapshot = coalesce(nullif(c.assigned_profile_email_snapshot, ''), p.email, ''),
    assigned_profile_role_snapshot = coalesce(nullif(c.assigned_profile_role_snapshot, ''), p.role, '')
from public.profiles p
where p.id = c.assigned_profile_id;

alter table public.operational_125h_checklists
  alter column assigned_profile_id drop not null;

alter table public.operational_125h_checklists
  drop constraint if exists operational_125h_checklists_assigned_profile_id_fkey;

alter table public.operational_125h_checklists
  add constraint operational_125h_checklists_assigned_profile_id_fkey
  foreign key (assigned_profile_id) references public.profiles(id) on delete set null;

-- 2) Preservar a identidade do mecânico nas escalas históricas.
alter table public.operational_mechanic_assignments
  add column if not exists mechanic_name_snapshot text not null default '',
  add column if not exists mechanic_email_snapshot text not null default '',
  add column if not exists mechanic_role_snapshot text not null default '';

update public.operational_mechanic_assignments a
set mechanic_name_snapshot = coalesce(nullif(a.mechanic_name_snapshot, ''), p.name, ''),
    mechanic_email_snapshot = coalesce(nullif(a.mechanic_email_snapshot, ''), p.email, ''),
    mechanic_role_snapshot = coalesce(nullif(a.mechanic_role_snapshot, ''), p.role, '')
from public.profiles p
where p.id = a.mechanic_id;

alter table public.operational_mechanic_assignments
  alter column mechanic_id drop not null;

alter table public.operational_mechanic_assignments
  drop constraint if exists operational_mechanic_assignments_mechanic_id_fkey;

alter table public.operational_mechanic_assignments
  add constraint operational_mechanic_assignments_mechanic_id_fkey
  foreign key (mechanic_id) references public.profiles(id) on delete set null;

-- 3) Atualizar o trigger do checklist: permitir apenas reatribuição explícita pelo master
--    ou por uma sessão administrativa confiável do SQL Editor; preservar snapshots.
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
  v_profile_name text;
  v_profile_email text;
  v_profile_role text;
  v_admin_context boolean;
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
  -- A ação interna da FK ON DELETE SET NULL apenas desvincula o perfil;
  -- os snapshots já foram preenchidos e permanecem no registro.
  if tg_op = 'UPDATE'
    and new.assigned_profile_id is null
    and old.assigned_profile_id is not null
    and pg_trigger_depth() > 1 then
    return new;
  end if;

  v_admin_context := public.is_master()
    or session_user in ('postgres', 'supabase_admin');

  select e.area_id into v_area
  from public.operational_equipment e
  where e.id = new.equipment_id;

  if v_area is null or v_area <> new.area_id then
    raise exception 'Equipamento não pertence à área operacional do checklist.';
  end if;

  if new.assigned_profile_id is null then
    raise exception 'O checklist precisa manter um responsável válido até o arquivamento do perfil.';
  end if;

  select p.role,p.active,p.name,p.email
    into v_role,v_active,v_profile_name,v_profile_email
  from public.profiles p
  where p.id = new.assigned_profile_id
    and p.operational_area_id = new.area_id;

  if v_role is distinct from 'mecanico' or v_active is distinct from true then
    raise exception 'O responsável precisa ser um mecânico ativo da mesma área.';
  end if;

  new.assigned_profile_name_snapshot := coalesce(v_profile_name, new.assigned_profile_name_snapshot, '');
  new.assigned_profile_email_snapshot := coalesce(v_profile_email, new.assigned_profile_email_snapshot, '');
  new.assigned_profile_role_snapshot := coalesce(v_role, new.assigned_profile_role_snapshot, '');

  if tg_op = 'INSERT' then
    if new.status = 'completed' then
      raise exception 'O checklist deve ser criado como atribuído e concluído pelo mecânico.';
    end if;
    if auth.uid() is null or new.created_by <> auth.uid() or not public.has_operational_access(new.area_id) then
      raise exception 'Somente o supervisor da área ou administrador pode atribuir o checklist.';
    end if;
  else
    if new.id is distinct from old.id
      or new.area_id is distinct from old.area_id
      or new.equipment_id is distinct from old.equipment_id
      or new.assigned_for is distinct from old.assigned_for
      or new.created_by is distinct from old.created_by then
      raise exception 'A identificação e a origem do checklist não podem ser alteradas.';
    end if;

    if new.assigned_profile_id is distinct from old.assigned_profile_id and not v_admin_context then
      raise exception 'Somente o ADMIN MASTER pode reatribuir um checklist.';
    end if;

    if old.status = 'completed' then
      raise exception 'Checklist concluído é imutável; uma correção exige uma revisão formal.';
    end if;

    if not public.has_operational_access(old.area_id) and not v_admin_context then
      if old.assigned_profile_id <> auth.uid() then
        raise exception 'Somente o mecânico atribuído pode editar um checklist ainda não concluído.';
      end if;
      if new.status not in ('in_progress','completed') then
        raise exception 'Status inválido para execução pelo mecânico.';
      end if;
    end if;
  end if;

  if new.status = 'completed' then
    if nullif(trim(new.technician_name),'') is null
      or nullif(trim(new.serial_number),'') is null
      or new.horimeter is null or new.horimeter < 0
      or nullif(trim(new.location),'') is null
      or new.inspection_date is null
      or new.signature_path is null then
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
      if new.responses->v_item->>'status' = 'NOK'
        and nullif(trim(new.responses->v_item->>'observation'),'') is null then
        raise exception 'Descreva a não conformidade do item: %.',v_item;
      end if;
    end loop;

    if tg_op = 'INSERT' or old.status <> 'completed' then
      new.completed_by := auth.uid();
      new.completed_at := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- 4) Atualizar trigger da escala para permitir somente o SET NULL interno da FK.
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
  mechanic_name text;
  mechanic_email text;
begin
  if tg_op = 'UPDATE'
    and new.mechanic_id is null
    and old.mechanic_id is not null
    and pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.mechanic_id is null then
    raise exception 'A escala exige um mecânico vinculado; desvinculação só é permitida no arquivamento do perfil.';
  end if;

  if not public.has_operational_access(new.area_id) then
    raise exception 'Somente o Supervisor de Área pode gerenciar a escala desta mina.';
  end if;

  if tg_op = 'INSERT' and new.work_date < current_date then
    raise exception 'Não é permitido criar uma alocação em data passada.';
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

  select p.operational_area_id,p.active,p.role,p.name,p.email
    into mechanic_area,mechanic_active,mechanic_role,mechanic_name,mechanic_email
  from public.profiles p
  where p.id = new.mechanic_id;

  if mechanic_area is distinct from new.area_id
    or mechanic_active is distinct from true
    or mechanic_role is distinct from 'mecanico' then
    raise exception 'O profissional selecionado não é um mecânico ativo desta área.';
  end if;

  new.mechanic_name_snapshot := coalesce(mechanic_name, new.mechanic_name_snapshot, '');
  new.mechanic_email_snapshot := coalesce(mechanic_email, new.mechanic_email_snapshot, '');
  new.mechanic_role_snapshot := coalesce(mechanic_role, new.mechanic_role_snapshot, '');

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

-- 5) RPC controlada para reatribuição manual do checklist pendente.
--    O usuário final precisa ser o MASTER; o SQL Editor confiável também pode executar.
create or replace function public.reassign_operational_125h_checklist(
  p_checklist_id uuid,
  p_new_mechanic_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area text;
  v_status text;
  v_new_area text;
  v_new_role text;
  v_new_active boolean;
begin
  if not (
    public.is_master()
    or session_user in ('postgres', 'supabase_admin')
  ) then
    raise exception 'Somente o ADMIN MASTER pode reatribuir checklists.';
  end if;

  select area_id, status into v_area, v_status
  from public.operational_125h_checklists
  where id = p_checklist_id
  for update;

  if not found then
    raise exception 'Checklist não encontrado.';
  end if;
  if v_status = 'completed' then
    raise exception 'Checklist concluído não pode ser reatribuído.';
  end if;

  select operational_area_id, role, active
    into v_new_area, v_new_role, v_new_active
  from public.profiles
  where id = p_new_mechanic_id;

  if v_new_area is distinct from v_area
    or v_new_role is distinct from 'mecanico'
    or v_new_active is distinct from true then
    raise exception 'O novo responsável precisa ser um mecânico ativo da mesma área.';
  end if;

  update public.operational_125h_checklists
  set assigned_profile_id = p_new_mechanic_id,
      updated_at = now()
  where id = p_checklist_id;
end;
$$;

revoke all on function public.reassign_operational_125h_checklist(uuid,uuid) from public, anon;
grant execute on function public.reassign_operational_125h_checklist(uuid,uuid) to authenticated, service_role;

commit;
