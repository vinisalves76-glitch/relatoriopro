-- RelatorioPro / IRMEN — arquivamento histórico antes da exclusão de usuários.
-- A função só pode ser executada pelo service_role, a partir da API administrativa.

create table if not exists public.user_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  deleted_user_id uuid not null,
  email text not null default '',
  name text not null default '',
  role text not null default '',
  archived_to uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz not null default now()
);

alter table public.user_deletion_audit enable row level security;
revoke all on public.user_deletion_audit from anon, authenticated;

-- Atualizar o proprietário do relatório deve propagar o owner_id às fotos relacionadas.
alter table public.report_photos
  drop constraint if exists report_photos_owner_id_report_id_fkey;
alter table public.report_photos
  add constraint report_photos_owner_id_report_id_fkey
  foreign key (owner_id, report_id)
  references public.reports(owner_id, id)
  on update cascade on delete cascade;

create or replace function public.archive_user_business_data(
  p_target_uid uuid,
  p_master_uid uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if p_target_uid is null or p_master_uid is null or p_target_uid = p_master_uid then
    raise exception 'Identificador de usuário inválido ou protegido';
  end if;

  if p_master_uid <> '5c6800f9-426b-44b3-842d-ba6485cc017e'::uuid then
    raise exception 'Conta mestre inválida';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_target_uid
  for update;

  if not found then
    raise exception 'Perfil não encontrado';
  end if;

  if not exists (
    select 1 from auth.users
    where id = p_master_uid
  ) then
    raise exception 'Conta de arquivamento não encontrada';
  end if;

  insert into public.user_deletion_audit
    (deleted_user_id, email, name, role, archived_to)
  values
    (p_target_uid, coalesce(v_profile.email,''), coalesce(v_profile.name,''),
     coalesce(v_profile.role,''), p_master_uid);

  -- Os dados de negócio continuam disponíveis; a autoria original fica registrada
  -- em legacy_data.archived_owner para consulta e auditoria.
  update public.reports
  set owner_id = p_master_uid,
      legacy_data = coalesce(legacy_data, '{}'::jsonb) ||
        jsonb_build_object('archived_owner', jsonb_build_object(
          'id', p_target_uid, 'email', v_profile.email,
          'name', v_profile.name, 'role', v_profile.role,
          'archived_at', now()
        )),
      updated_at = now()
  where owner_id = p_target_uid;

  update public.trainings
  set owner_id = p_master_uid,
      legacy_data = coalesce(legacy_data, '{}'::jsonb) ||
        jsonb_build_object('archived_owner', jsonb_build_object(
          'id', p_target_uid, 'email', v_profile.email,
          'name', v_profile.name, 'role', v_profile.role,
          'archived_at', now()
        )),
      updated_at = now()
  where owner_id = p_target_uid;

  update public.agenda
  set owner_id = p_master_uid,
      legacy_data = coalesce(legacy_data, '{}'::jsonb) ||
        jsonb_build_object('archived_owner', jsonb_build_object(
          'id', p_target_uid, 'email', v_profile.email,
          'name', v_profile.name, 'role', v_profile.role,
          'archived_at', now()
        )),
      updated_at = now()
  where owner_id = p_target_uid;
end;
$$;

revoke all on function public.archive_user_business_data(uuid, uuid) from public, anon, authenticated;
grant execute on function public.archive_user_business_data(uuid, uuid) to service_role;
