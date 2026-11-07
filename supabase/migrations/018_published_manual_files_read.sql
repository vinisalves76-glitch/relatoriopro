-- Permite que usuários ativos consultem arquivos de manuais técnicos publicados.
-- Os manuais existentes são armazenados em: <owner_uid>/manuals/<manual_id>/<filename>.
-- A política antiga de arquivos de treinamentos espera <owner_uid>/<training_id>/<filename>
-- e, por isso, não reconhece o caminho específico dos manuais.
-- Esta política é somente de leitura e valida proprietário, status publicado e caminho exato salvo no registro.

drop policy if exists "published_manual_files_read" on storage.objects;
create policy "published_manual_files_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'training-attachments-private'
  and exists (
    select 1
    from public.trainings t
    join public.profiles p on p.id = auth.uid() and p.active = true
    where t.owner_id::text = (storage.foldername(name))[1]
      and (storage.foldername(name))[2] = 'manuals'
      and t.id = (storage.foldername(name))[3]
      and t.status = 'published'
      and t.legacy_data ->> 'docType' = 'technical_manual'
      and t.legacy_data ->> 'path' = name
  )
);
