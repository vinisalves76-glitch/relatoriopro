-- Gestão Operacional IRMEN — Fase 1
-- Esta migração cria tabelas próprias para clientes, contratos, operações e frota.
-- NÃO executar no banco de produção durante a fase de preview.
-- As políticas liberam acesso somente ao administrador master.
create extension if not exists pgcrypto;

create table if not exists public.go_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  contact text,
  status text not null default 'Ativo' check (status in ('Ativo','Inativo')),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.go_contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.go_clients(id) on delete restrict,
  code text not null,
  name text not null,
  start_date date,
  end_date date,
  status text not null default 'Ativo' check (status in ('Ativo','Suspenso','Encerrado')),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, code),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.go_operations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.go_contracts(id) on delete restrict,
  code text not null,
  name text not null,
  location text,
  status text not null default 'Ativa' check (status in ('Ativa','Suspensa','Encerrada')),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, code)
);

create table if not exists public.go_assets (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.go_operations(id) on delete restrict,
  asset_code text not null,
  asset_category text not null default 'truck',
  manufacturer text,
  model text not null,
  serial_number text,
  year integer check (year is null or year between 1950 and 2100),
  current_hourmeter numeric(12,1) not null default 0 check (current_hourmeter >= 0),
  status text not null default 'Disponível',
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, asset_code)
);

create table if not exists public.go_asset_components (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.go_assets(id) on delete restrict,
  parent_component_id uuid references public.go_asset_components(id) on delete restrict,
  component_code text,
  name text not null,
  system text not null,
  serial_number text,
  installed_hourmeter numeric(12,1) check (installed_hourmeter is null or installed_hourmeter >= 0),
  removed_hourmeter numeric(12,1) check (removed_hourmeter is null or removed_hourmeter >= installed_hourmeter),
  status text not null default 'Instalado',
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.go_hourmeter_readings (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.go_assets(id) on delete restrict,
  reading numeric(12,1) not null check (reading >= 0),
  reading_at timestamptz not null,
  source text not null,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.go_work_orders (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.go_assets(id) on delete restrict,
  order_number text not null,
  order_type text not null check (order_type in ('Preventiva','Corretiva','Inspeção','Preditiva','Melhoria')),
  priority text not null default 'Média' check (priority in ('Baixa','Média','Alta','Crítica')),
  status text not null default 'Aberta',
  description text not null,
  opened_at date not null default current_date,
  started_at timestamptz,
  completed_at timestamptz,
  hourmeter numeric(12,1) check (hourmeter is null or hourmeter >= 0),
  assigned_to text,
  action_taken text,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, order_number)
);

create table if not exists public.go_failure_events (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.go_assets(id) on delete restrict,
  component_id uuid references public.go_asset_components(id) on delete restrict,
  failure_date timestamptz not null,
  system text not null,
  failure_mode text not null,
  symptom text not null,
  cause text,
  severity text not null default 'Média',
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.go_downtime_events (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.go_assets(id) on delete restrict,
  work_order_id uuid references public.go_work_orders(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz,
  category text not null,
  reason text not null,
  planned boolean not null default false,
  counts_unavailable boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);

create index if not exists go_contracts_client_idx on public.go_contracts(client_id);
create index if not exists go_operations_contract_idx on public.go_operations(contract_id);
create index if not exists go_assets_operation_idx on public.go_assets(operation_id);
create index if not exists go_components_asset_idx on public.go_asset_components(asset_id);
create index if not exists go_hourmeters_asset_date_idx on public.go_hourmeter_readings(asset_id, reading_at desc);
create index if not exists go_work_orders_asset_status_idx on public.go_work_orders(asset_id, status);
create index if not exists go_failures_asset_date_idx on public.go_failure_events(asset_id, failure_date desc);
create index if not exists go_downtime_asset_start_idx on public.go_downtime_events(asset_id, start_at desc);

do $$
declare t text;
begin
  foreach t in array array[
    'go_clients','go_contracts','go_operations','go_assets','go_asset_components',
    'go_hourmeter_readings','go_work_orders','go_failure_events','go_downtime_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_master_only', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_master()) with check (public.is_master())',
      t || '_master_only', t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
