-- IRMEN / RelatorioPro — alinhar permissões padrão do banco com a interface.
-- Quando permissions estiver vazio, aplica os padrões do cargo.
-- Quando houver permissões explícitas, elas continuam prevalecendo.
-- Mantém RLS habilitada e não concede acesso amplo às tabelas.

create or replace function public.has_permission(permission_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and (
        permission_name = any(p.permissions)
        or (
          coalesce(cardinality(p.permissions), 0) = 0
          and (
            p.role in (
              'super_admin',
              'auxiliar_administrativo',
              'gerente',
              'coordenador'
            )
            and permission_name in (
              'reports.view',
              'reports.create',
              'reports.edit',
              'reports.delete',
              'reports.print',
              'model.view',
              'model.edit'
            )
            or p.role in ('instrutor_tecnico', 'consultor_tecnico')
            and permission_name in (
              'reports.view',
              'reports.create',
              'reports.print'
            )
          )
        )
      )
  );
$$;

revoke all on function public.has_permission(text) from public;
revoke all on function public.has_permission(text) from anon;
grant execute on function public.has_permission(text) to authenticated;
