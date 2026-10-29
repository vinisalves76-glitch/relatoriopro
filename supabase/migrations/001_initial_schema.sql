-- RelatorioPro / IRMEN — base inicial Supabase
-- Executar no SQL Editor do projeto de destino somente após revisar este arquivo.
-- Esta migração cria a estrutura e políticas; NÃO importa nem apaga dados do Firebase.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null check (role in (
    'super_admin','auxiliar_administrativo','gerente','coordenador',
    'instrutor_tecnico','consultor_tecnico'
  )),
  role_label text not null default '',
  permissions text[] not null default '{}',
  active boolean not null default true,
  must_change_password boolean not null default false,
  legacy_firebase_uid text unique,
  legacy_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id text not null,
  owner_id uuid not null references auth.users(id) on delete restrict,
  type text not null default '',
  report_date date,
  responsible text not null default '',
  client text not null default '',
  branch text not null default '',
  equipment text not null default '',
  location text not null default '',
  objective text not null default '',
  observations text not null default '',
  activities text not null default '',
  results text not null default '',
  conclusion text not null default '',
  model jsonb not null default '{}'::jsonb,
  legacy_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create index if not exists reports_updated_at_idx on public.reports (updated_at desc);
create index if not exists reports_client_idx on public.reports (client);
create index if not exists reports_equipment_idx on public.reports (equipment);

create table if not exists public.report_photos (
  id text not null,
  owner_id uuid not null,
  report_id text not null,
  data text not null default '',
  caption text not null default '',
  order_index integer not null default 0,
  legacy_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner_id, report_id, id),
  foreign key (owner_id, report_id) references public.reports(owner_id, id) on delete cascade
);

create table if not exists public.user_settings (
  owner_id uuid not null references auth.users(id) on delete cascade,
  setting_key text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner_id, setting_key)
);

create table if not exists public.trainings (
  id text primary key,
  title text not null,
  category text not null default '',
  audience text not null default '',
  description text not null default '',
  owner_id uuid not null references auth.users(id) on delete restrict,
  owner_name text not null default '',
  status text not null check (status in ('draft','pending','published','returned')),
  review_comment text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  version integer not null default 1 check (version > 0),
  legacy_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trainings_status_idx on public.trainings (status);
create index if not exists trainings_owner_idx on public.trainings (owner_id);

create table if not exists public.training_attachments (
  id uuid primary key default gen_random_uuid(),
  training_id text not null references public.trainings(id) on delete cascade,
  name text not null,
  storage_path text not null default '',
  public_url text not null default '',
  kind text not null default '',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  content_type text not null default '',
  legacy_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists training_attachments_training_idx on public.training_attachments (training_id);

create table if not exists public.agenda (
  id text not null,
  owner_id uuid not null references auth.users(id) on delete restrict,
  appointment_date date not null,
  appointment_time time,
  client text not null default '',
  location text not null default '',
  equipment text not null default '',
  activity_type text not null default '',
  status text not null default 'Agendado'
    check (status in ('Agendado','Confirmado','Concluído','Cancelado')),
  notes text not null default '',
  assignee_name text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  legacy_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create index if not exists agenda_date_idx on public.agenda (appointment_date);
create index if not exists agenda_status_idx on public.agenda (status);

-- Funções de autorização: perfil não pode ser elevado pelo próprio usuário.
create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'super_admin' and p.active = true
  );
$$;

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role in ('super_admin','auxiliar_administrativo','gerente','coordenador')
  );
$$;

create or replace function public.has_permission(permission_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and permission_name = any(p.permissions)
  );
$$;

alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.report_photos enable row level security;
alter table public.user_settings enable row level security;
alter table public.trainings enable row level security;
alter table public.training_attachments enable row level security;
alter table public.agenda enable row level security;

-- Perfis: usuário lê o próprio perfil; administradores podem consultar perfis.
drop policy if exists "profiles_read_self_or_admin" on public.profiles;
create policy "profiles_read_self_or_admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_system_admin());

-- Criação de perfis operacionais por administradores; criação do super_admin deve ser controlada.
drop policy if exists "profiles_admin_create_operational" on public.profiles;
create policy "profiles_admin_create_operational" on public.profiles
for insert to authenticated
with check (
  public.is_master()
  or (
    public.is_system_admin()
    and role in ('instrutor_tecnico','consultor_tecnico')
    and active = true
  )
);

drop policy if exists "profiles_master_update" on public.profiles;
create policy "profiles_master_update" on public.profiles
for update to authenticated
using (public.is_master() and id <> auth.uid())
with check (public.is_master() and role <> '');

drop policy if exists "profiles_master_delete" on public.profiles;
create policy "profiles_master_delete" on public.profiles
for delete to authenticated
using (public.is_master() and id <> auth.uid());

-- Relatórios.
drop policy if exists "reports_read" on public.reports;
create policy "reports_read" on public.reports
for select to authenticated
using (
  public.is_system_admin()
  or (owner_id = auth.uid() and public.has_permission('reports.view'))
);

drop policy if exists "reports_create" on public.reports;
create policy "reports_create" on public.reports
for insert to authenticated
with check (
  public.is_master()
  or (owner_id = auth.uid() and public.has_permission('reports.create'))
);

drop policy if exists "reports_update" on public.reports;
create policy "reports_update" on public.reports
for update to authenticated
using (public.is_master() or (owner_id = auth.uid() and public.has_permission('reports.edit')))
with check (public.is_master() or (owner_id = auth.uid() and public.has_permission('reports.edit')));

drop policy if exists "reports_delete" on public.reports;
create policy "reports_delete" on public.reports
for delete to authenticated
using (public.is_master() or (owner_id = auth.uid() and public.has_permission('reports.delete')));

-- Fotos seguem as permissões do relatório proprietário.
drop policy if exists "report_photos_read" on public.report_photos;
create policy "report_photos_read" on public.report_photos
for select to authenticated
using (public.is_system_admin() or (owner_id = auth.uid() and public.has_permission('reports.view')));

drop policy if exists "report_photos_create" on public.report_photos;
create policy "report_photos_create" on public.report_photos
for insert to authenticated
with check (public.is_master() or (
  owner_id = auth.uid() and (public.has_permission('reports.create') or public.has_permission('reports.edit'))
));

drop policy if exists "report_photos_update" on public.report_photos;
create policy "report_photos_update" on public.report_photos
for update to authenticated
using (public.is_master() or (
  owner_id = auth.uid() and (public.has_permission('reports.create') or public.has_permission('reports.edit'))
))
with check (public.is_master() or (
  owner_id = auth.uid() and (public.has_permission('reports.create') or public.has_permission('reports.edit'))
));

drop policy if exists "report_photos_delete" on public.report_photos;
create policy "report_photos_delete" on public.report_photos
for delete to authenticated
using (public.is_master() or (owner_id = auth.uid() and public.has_permission('reports.delete')));

-- Configuração visual individual.
drop policy if exists "settings_read" on public.user_settings;
create policy "settings_read" on public.user_settings
for select to authenticated
using (public.is_system_admin() or (
  owner_id = auth.uid() and (public.has_permission('model.view') or public.has_permission('model.edit'))
));

drop policy if exists "settings_write" on public.user_settings;
create policy "settings_write" on public.user_settings
for all to authenticated
using (public.is_master() or (owner_id = auth.uid() and public.has_permission('model.edit')))
with check (public.is_master() or (owner_id = auth.uid() and public.has_permission('model.edit')));

-- Treinamentos: publicados são visíveis a usuários ativos; rascunhos pertencem ao criador.
drop policy if exists "trainings_read" on public.trainings;
create policy "trainings_read" on public.trainings
for select to authenticated
using (
  public.is_system_admin()
  or status = 'published'
  or (owner_id = auth.uid() and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.active = true
  ))
);

drop policy if exists "trainings_create" on public.trainings;
create policy "trainings_create" on public.trainings
for insert to authenticated
with check (
  owner_id = auth.uid()
  and status in ('draft','pending')
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active = true)
);

drop policy if exists "trainings_update" on public.trainings;
create policy "trainings_update" on public.trainings
for update to authenticated
using (
  public.is_system_admin()
  or (
    owner_id = auth.uid()
    and status in ('draft','returned')
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active = true)
  )
)
with check (
  public.is_system_admin()
  or (
    owner_id = auth.uid()
    and status in ('draft','pending')
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active = true)
  )
);

drop policy if exists "trainings_delete" on public.trainings;
create policy "trainings_delete" on public.trainings
for delete to authenticated
using (
  public.is_system_admin()
  or (owner_id = auth.uid() and status in ('draft','returned'))
);

-- Metadados de anexos herdam acesso do treinamento pai.
drop policy if exists "training_attachments_read" on public.training_attachments;
create policy "training_attachments_read" on public.training_attachments
for select to authenticated
using (exists (
  select 1 from public.trainings t
  where t.id = training_id
    and (
      public.is_system_admin()
      or t.status = 'published'
      or t.owner_id = auth.uid()
    )
));

drop policy if exists "training_attachments_create" on public.training_attachments;
create policy "training_attachments_create" on public.training_attachments
for insert to authenticated
with check (exists (
  select 1 from public.trainings t
  where t.id = training_id
    and t.owner_id = auth.uid()
    and t.status in ('draft','pending')
));

drop policy if exists "training_attachments_delete" on public.training_attachments;
create policy "training_attachments_delete" on public.training_attachments
for delete to authenticated
using (public.is_system_admin() or exists (
  select 1 from public.trainings t
  where t.id = training_id
    and t.owner_id = auth.uid()
    and t.status in ('draft','returned')
));

-- Agenda: somente administradores gerenciam; profissional atribuído pode consultar a própria agenda.
drop policy if exists "agenda_read" on public.agenda;
create policy "agenda_read" on public.agenda
for select to authenticated
using (public.is_system_admin() or (
  owner_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active = true)
));

drop policy if exists "agenda_admin_insert" on public.agenda;
create policy "agenda_admin_insert" on public.agenda
for insert to authenticated
with check (public.is_system_admin());

drop policy if exists "agenda_admin_update" on public.agenda;
create policy "agenda_admin_update" on public.agenda
for update to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

drop policy if exists "agenda_admin_delete" on public.agenda;
create policy "agenda_admin_delete" on public.agenda
for delete to authenticated
using (public.is_system_admin());

-- Segurança padrão: tabelas não devem ser acessadas por anon.
revoke all on public.profiles, public.reports, public.report_photos,
  public.user_settings, public.trainings, public.training_attachments,
  public.agenda from anon;
grant select, insert, update, delete on public.profiles, public.reports,
  public.report_photos, public.user_settings, public.trainings,
  public.training_attachments, public.agenda to authenticated;

