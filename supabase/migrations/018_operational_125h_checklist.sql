-- Checklist 125h Trem de Força: fluxo atribuído, evidências privadas e conclusão rastreável.
begin;

create table if not exists public.operational_125h_checklists (
  id uuid primary key default gen_random_uuid(),
  area_id text not null references public.operational_areas(id),
  equipment_id uuid not null references public.operational_equipment(id),
  assigned_profile_id uuid not null references public.profiles(id),
  assigned_for date not null default current_date,
  status text not null default 'assigned' check (status in ('assigned','in_progress','completed')),
  created_by uuid not null references auth.users(id),
  technician_name text not null default '',
  inspection_date date not null default current_date,
  serial_number text not null default '',
  horimeter numeric(12,1),
  location text not null default '',
  client text not null default 'ArcelorMittal',
  general_notes text not null default '',
  responses jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  signature_path text,
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operational_125h_checklists_area_created_idx
  on public.operational_125h_checklists(area_id,created_at desc);
create index if not exists operational_125h_checklists_assignee_status_idx
  on public.operational_125h_checklists(assigned_profile_id,status,assigned_for desc);
create index if not exists operational_125h_checklists_equipment_idx
  on public.operational_125h_checklists(equipment_id,created_at desc);

create or replace function public.validate_operational_125h_checklist()
returns trigger language plpgsql security definer set search_path=public
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
  from public.profiles p where p.id=new.assigned_profile_id
    and p.operational_area_id=new.area_id;
  if v_role is distinct from 'mecanico' or v_active is distinct from true then
    raise exception 'O responsável precisa ser um mecânico ativo da mesma área.';
  end if;

  if tg_op='INSERT' then
    if auth.uid() is null or new.created_by<>auth.uid() or not public.has_operational_access(new.area_id) then
      raise exception 'Somente o supervisor da área ou administrador pode atribuir o checklist.';
    end if;
  else
    if new.id is distinct from old.id or new.area_id is distinct from old.area_id
      or new.equipment_id is distinct from old.equipment_id
      or new.assigned_profile_id is distinct from old.assigned_profile_id
      or new.assigned_for is distinct from old.assigned_for
      or new.created_by is distinct from old.created_by then
      raise exception 'A identificação e a atribuição do checklist não podem ser alteradas.';
    end if;
    if not public.has_operational_access(old.area_id) then
      if old.assigned_profile_id<>auth.uid() or old.status='completed' then
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
      if new.responses->v_item->>'status' not in ('OK','NOK') then
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
    if old.status<>'completed' then
      new.completed_by:=auth.uid();
      new.completed_at:=now();
    end if;
  end if;
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists operational_125h_checklists_validate on public.operational_125h_checklists;
create trigger operational_125h_checklists_validate
before insert or update on public.operational_125h_checklists
for each row execute function public.validate_operational_125h_checklist();

alter table public.operational_125h_checklists enable row level security;
drop policy if exists operational_125h_checklists_read on public.operational_125h_checklists;
create policy operational_125h_checklists_read on public.operational_125h_checklists
for select to authenticated
using (public.has_operational_access(area_id) or assigned_profile_id=auth.uid());

drop policy if exists operational_125h_checklists_insert on public.operational_125h_checklists;
create policy operational_125h_checklists_insert on public.operational_125h_checklists
for insert to authenticated
with check (created_by=auth.uid() and public.has_operational_access(area_id));

drop policy if exists operational_125h_checklists_update on public.operational_125h_checklists;
create policy operational_125h_checklists_update on public.operational_125h_checklists
for update to authenticated
using (public.has_operational_access(area_id) or (assigned_profile_id=auth.uid() and status<>'completed'))
with check (public.has_operational_access(area_id) or (assigned_profile_id=auth.uid() and status in ('in_progress','completed')));

revoke all on public.operational_125h_checklists from anon;
grant select,insert,update on public.operational_125h_checklists to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('operational-checklist-private','operational-checklist-private',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists operational_checklist_evidence_read on storage.objects;
create policy operational_checklist_evidence_read on storage.objects
for select to authenticated using (
  bucket_id='operational-checklist-private'
  and exists (
    select 1 from public.operational_125h_checklists c
    where c.id=(storage.foldername(name))[1]::uuid
      and (public.has_operational_access(c.area_id) or c.assigned_profile_id=auth.uid())
  )
);

drop policy if exists operational_checklist_evidence_insert on storage.objects;
create policy operational_checklist_evidence_insert on storage.objects
for insert to authenticated with check (
  bucket_id='operational-checklist-private'
  and exists (
    select 1 from public.operational_125h_checklists c
    where c.id=(storage.foldername(name))[1]::uuid
      and c.assigned_profile_id=auth.uid()
      and c.status in ('assigned','in_progress')
  )
);

commit;
