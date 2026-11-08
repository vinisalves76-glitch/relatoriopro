-- IRMEN / RelatorioPro — Migration 020
-- Preserva identidade e autoria histórica após desligamento de funcionário.
-- Não transfere registros para outro usuário, não apaga registros de negócio
-- e não usa ON DELETE SET NULL nas referências de autoria/responsabilidade.
--
-- PRÉ-REQUISITOS:
--   * migrations anteriores do projeto aplicadas até a 019;
--   * public.profiles.id referencia auth.users(id) com ON DELETE CASCADE;
--   * public.profiles possui name, email, role e operational_area_id;
--   * public.user_deletion_audit já existe (migration 007/008).
--
-- Esta migration preserva os UUIDs históricos removendo somente FKs de identidade
-- para auth.users/profiles nas tabelas de negócio. Mantém a FK profiles.id -> auth.users
-- para que a exclusão Auth remova o perfil e dispare o snapshot BEFORE DELETE.
-- Não executa exclusão de usuários.

begin;

-- 1. Tabela central de snapshots: mantém a identidade mesmo sem linha em profiles.
create table if not exists public.operational_user_snapshots (
  profile_id uuid primary key,
  full_name text not null default '',
  email text not null default '',
  role text not null default '',
  operational_area_id text,
  offboarded_at timestamptz not null default now()
);

alter table public.operational_user_snapshots enable row level security;
revoke all on public.operational_user_snapshots from anon, authenticated;

-- 2. Garante que a FK principal do perfil continue existindo e seja CASCADE.
do $$
declare
  v_fk_count integer;
  v_fk_ok boolean;
begin
  select count(*),
         coalesce(bool_and(
           c.confrelid = 'auth.users'::regclass
           and c.conkey = array[(
             select a.attnum from pg_attribute a
             where a.attrelid = 'public.profiles'::regclass
               and a.attname = 'id' and not a.attisdropped
           )]::smallint[]
           and c.confdeltype = 'c'
         ), false)
    into v_fk_count, v_fk_ok
  from pg_constraint c
  where c.conrelid = 'public.profiles'::regclass
    and c.contype = 'f'
    and (
      select a.attnum from pg_attribute a
      where a.attrelid = 'public.profiles'::regclass
        and a.attname = 'id' and not a.attisdropped
    ) = any(c.conkey);

  if v_fk_count <> 1 or not v_fk_ok then
    raise exception 'Pré-requisito não atendido: profiles.id deve possuir exatamente uma FK para auth.users(id) ON DELETE CASCADE. Nenhuma alteração aplicada.';
  end if;
end;
$$;

-- 3. Remove FKs de negócio que impediriam a exclusão ou apagariam os UUIDs.
--    Exceções intencionais:
--      profiles.id -> auth.users(id): necessária para exclusão em cascata do perfil;
--      user_settings.owner_id -> auth.users(id): preferências pessoais podem ser apagadas;
--      user_deletion_audit.archived_to -> auth.users(id): protege a conta master de auditoria.
--    Os valores UUID das colunas não são alterados.
do $$
declare
  v_fk record;
begin
  for v_fk in
    select
      c.conrelid::regclass as table_name,
      c.conname as constraint_name
    from pg_constraint c
    where c.contype = 'f'
      and c.connamespace = 'public'::regnamespace
      and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
      and not (
        c.conrelid = 'public.profiles'::regclass
        and c.confrelid = 'auth.users'::regclass
        and c.conkey = array[(
          select a.attnum from pg_attribute a
          where a.attrelid = 'public.profiles'::regclass
            and a.attname = 'id' and not a.attisdropped
        )]::smallint[]
      )
      and not (
        c.conrelid = 'public.user_settings'::regclass
        and c.confrelid = 'auth.users'::regclass
        and exists (
          select 1 from pg_attribute a
          where a.attrelid = c.conrelid
            and a.attname = 'owner_id'
            and a.attnum = any(c.conkey)
            and not a.attisdropped
        )
      )
      and not (
        c.conrelid = 'public.user_deletion_audit'::regclass
        and c.confrelid = 'auth.users'::regclass
        and exists (
          select 1 from pg_attribute a
          where a.attrelid = c.conrelid
            and a.attname = 'archived_to'
            and a.attnum = any(c.conkey)
            and not a.attisdropped
        )
      )
  loop
    execute format('alter table %s drop constraint %I', v_fk.table_name, v_fk.constraint_name);
  end loop;
end;
$$;

-- 4. Snapshot automático antes da remoção do perfil.
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
    (old.id, coalesce(old.name, ''), coalesce(old.email, ''),
     coalesce(old.role, ''), old.operational_area_id, now())
  on conflict (profile_id) do nothing;

  -- Auditoria administrativa do desligamento. Não transfere a propriedade
  -- dos registros e não substitui a identidade original.
  if to_regclass('public.user_deletion_audit') is not null
     and exists (
       select 1 from auth.users
       where id = '5c6800f9-426b-44b3-842d-ba6485cc017e'::uuid
     )
     and not exists (
       select 1 from public.user_deletion_audit
       where deleted_user_id = old.id
         and archived_to = '5c6800f9-426b-44b3-842d-ba6485cc017e'::uuid
     ) then
    insert into public.user_deletion_audit
      (deleted_user_id, email, name, role, archived_to, deleted_at)
    values
      (old.id, coalesce(old.email, ''), coalesce(old.name, ''),
       coalesce(old.role, ''),
       '5c6800f9-426b-44b3-842d-ba6485cc017e'::uuid, now());
  end if;

  return old;
end;
$$;

drop trigger if exists profiles_snapshot_before_delete on public.profiles;
create trigger profiles_snapshot_before_delete
before delete on public.profiles
for each row
execute function public.snapshot_operational_profile_before_delete();

-- 5. Validação final: nenhuma FK de tabela pública de negócio pode continuar
--    apontando para auth.users/profiles, exceto as três exceções documentadas.
do $$
declare
  v_remaining text;
begin
  select string_agg(format('%s.%s', c.conrelid::regclass, c.conname), ', ')
    into v_remaining
  from pg_constraint c
  where c.contype = 'f'
    and c.connamespace = 'public'::regnamespace
    and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
    and not (
      c.conrelid = 'public.profiles'::regclass
      and c.confrelid = 'auth.users'::regclass
    )
    and not (
      c.conrelid = 'public.user_settings'::regclass
      and c.confrelid = 'auth.users'::regclass
    )
    and not (
      c.conrelid = 'public.user_deletion_audit'::regclass
      and c.confrelid = 'auth.users'::regclass
    );

  if v_remaining is not null then
    raise exception 'Ainda existem FKs de identidade não tratadas: %', v_remaining;
  end if;
end;
$$;

commit;
