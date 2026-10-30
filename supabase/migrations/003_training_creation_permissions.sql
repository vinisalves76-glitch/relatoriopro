-- IRMEN / RelatorioPro — restringir criação de treinamentos por perfil.
-- Executar no SQL Editor do Supabase após revisar. Não afeta Firebase nem produção.
-- Mantém os perfis permitidos alinhados à regra de criação do sistema original.

drop policy if exists "trainings_create" on public.trainings;
create policy "trainings_create" on public.trainings
for insert to authenticated
with check (
  owner_id = auth.uid()
  and status in ('draft','pending')
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role in (
        'super_admin','instrutor_tecnico','consultor_tecnico',
        'auxiliar_administrativo','gerente','coordenador'
      )
  )
);

drop policy if exists "training_attachments_create" on public.training_attachments;
create policy "training_attachments_create" on public.training_attachments
for insert to authenticated
with check (exists (
  select 1
  from public.trainings t
  join public.profiles p on p.id = auth.uid()
  where t.id = training_id
    and t.owner_id = auth.uid()
    and t.status in ('draft','pending')
    and p.active = true
    and p.role in (
      'super_admin','instrutor_tecnico','consultor_tecnico',
      'auxiliar_administrativo','gerente','coordenador'
    )
));

drop policy if exists "training_files_insert" on storage.objects;
create policy "training_files_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'training-attachments-private'
  and split_part(name, '/', 1) = auth.uid()::text
  and exists (
    select 1
    from public.trainings t
    join public.profiles p on p.id = auth.uid()
    where t.id = split_part(name, '/', 2)
      and t.owner_id = auth.uid()
      and t.status in ('draft', 'pending')
      and p.active = true
      and p.role in (
        'super_admin','instrutor_tecnico','consultor_tecnico',
        'auxiliar_administrativo','gerente','coordenador'
      )
  )
);
