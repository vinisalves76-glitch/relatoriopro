-- IRMEN / RelatorioPro — Storage privado para anexos de treinamentos
-- Revisar antes de executar no projeto Supabase. Não afeta Firebase nem a aplicação em produção.
-- Estrutura de objeto esperada: <owner_uuid>/<training_id>/<filename>

insert into storage.buckets (id, name, public)
values ('training-attachments-private', 'training-attachments-private', false)
on conflict (id) do update set public = false;

drop policy if exists "training_files_read" on storage.objects;
create policy "training_files_read" on storage.objects
for select to authenticated
using (
  bucket_id = 'training-attachments-private'
  and (
    public.is_system_admin()
    or exists (
      select 1
      from public.trainings t
      join public.profiles p on p.id = auth.uid() and p.active = true
      where t.id = split_part(name, '/', 2)
        and split_part(name, '/', 1) = t.owner_id::text
        and (
          t.owner_id = auth.uid()
          or t.status = 'published'
        )
    )
  )
);

drop policy if exists "training_files_insert" on storage.objects;
create policy "training_files_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'training-attachments-private'
  and split_part(name, '/', 1) = auth.uid()::text
  and exists (
    select 1 from public.trainings t
    where t.id = split_part(name, '/', 2)
      and t.owner_id = auth.uid()
      and t.status in ('draft', 'pending')
  )
);

drop policy if exists "training_files_update" on storage.objects;
create policy "training_files_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'training-attachments-private'
  and split_part(name, '/', 1) = auth.uid()::text
  and exists (
    select 1 from public.trainings t
    where t.id = split_part(name, '/', 2)
      and t.owner_id = auth.uid()
      and t.status in ('draft', 'pending', 'returned')
  )
)
with check (
  bucket_id = 'training-attachments-private'
  and split_part(name, '/', 1) = auth.uid()::text
  and exists (
    select 1 from public.trainings t
    where t.id = split_part(name, '/', 2)
      and t.owner_id = auth.uid()
      and t.status in ('draft', 'pending', 'returned')
  )
);

drop policy if exists "training_files_delete" on storage.objects;
create policy "training_files_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'training-attachments-private'
  and (
    public.is_system_admin()
    or (
      split_part(name, '/', 1) = auth.uid()::text
      and exists (
        select 1 from public.trainings t
        where t.id = split_part(name, '/', 2)
          and t.owner_id = auth.uid()
          and t.status in ('draft', 'returned')
      )
    )
  )
);
