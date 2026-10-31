-- IRMEN RelatorioPro: permitir que usuários autenticados ativos enviem arquivos
-- somente para sua própria pasta no bucket privado de treinamentos.
-- Não concede acesso público nem altera permissões de aprovação.

drop policy if exists "training_files_insert_owner_folder" on storage.objects;
create policy "training_files_insert_owner_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'training-attachments-private'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
  )
);

drop policy if exists "training_files_update_owner_folder" on storage.objects;
create policy "training_files_update_owner_folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'training-attachments-private'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
  )
)
with check (
  bucket_id = 'training-attachments-private'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
  )
);
