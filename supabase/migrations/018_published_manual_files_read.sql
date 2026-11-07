-- Migration 018: leitura de arquivos de manuais técnicos publicados
-- IRMEN / RelatorioPro
--
-- Permite que usuários autenticados e ativos leiam somente os arquivos de
-- manuais técnicos cujo registro correspondente esteja publicado.
--
-- Caminho esperado no bucket privado:
-- <owner_id>/manuals/<training_id>/<filename>
--
-- Esta migration NÃO deve ser executada antes das migrations que criam
-- public.trainings, public.profiles e o bucket training-attachments-private.

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
    join public.profiles p
      on p.id = auth.uid()
     and p.active = true
    where t.owner_id::text = (storage.foldername(name))[1]
      and (storage.foldername(name))[2] = 'manuals'
      and t.id::text = (storage.foldername(name))[3]
      and t.status = 'published'
      and t.legacy_data ->> 'docType' = 'technical_manual'
      and t.legacy_data ->> 'path' = name
  )
);
