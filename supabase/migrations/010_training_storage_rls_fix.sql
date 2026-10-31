-- IRMEN RelatorioPro: corrigir RLS do Storage para uploads de treinamentos.
-- A função SECURITY DEFINER consulta o perfil ativo sem depender da RLS de profiles.
-- O acesso aos objetos permanece limitado à pasta do próprio usuário.

CREATE OR REPLACE FUNCTION public.is_active_storage_uploader()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_active_storage_uploader() TO authenticated;

DROP POLICY IF EXISTS "training_files_insert_owner_folder" ON storage.objects;
CREATE POLICY "training_files_insert_owner_folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'training-attachments-private'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.is_active_storage_uploader()
);

DROP POLICY IF EXISTS "training_files_update_owner_folder" ON storage.objects;
CREATE POLICY "training_files_update_owner_folder"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'training-attachments-private'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.is_active_storage_uploader()
)
WITH CHECK (
  bucket_id = 'training-attachments-private'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.is_active_storage_uploader()
);

-- Upsert do cliente pode consultar o objeto antes de inserir/atualizar.
DROP POLICY IF EXISTS "training_files_select_owner_folder" ON storage.objects;
CREATE POLICY "training_files_select_owner_folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'training-attachments-private'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.is_active_storage_uploader()
);
