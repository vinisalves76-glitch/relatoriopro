-- RelatorioPro / IRMEN — arquivamento idempotente antes da exclusão de usuários.
-- A API consulta user_deletion_audit antes de chamar esta função.
-- O bloqueio da linha de profiles serializa tentativas concorrentes para o mesmo usuário.

CREATE OR REPLACE FUNCTION public.archive_user_business_data(
  p_target_uid uuid,
  p_master_uid uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF p_target_uid IS NULL OR p_master_uid IS NULL OR p_target_uid = p_master_uid THEN
    RAISE EXCEPTION 'Identificador de usuário inválido ou protegido';
  END IF;

  IF p_master_uid <> '5c6800f9-426b-44b3-842d-ba6485cc017e'::uuid THEN
    RAISE EXCEPTION 'Conta mestre inválida';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_target_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_master_uid) THEN
    RAISE EXCEPTION 'Conta de arquivamento não encontrada';
  END IF;

  -- Uma auditoria existente significa que a etapa de arquivamento já foi concluída.
  IF EXISTS (
    SELECT 1
    FROM public.user_deletion_audit
    WHERE deleted_user_id = p_target_uid
      AND archived_to = p_master_uid
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_deletion_audit
    WHERE deleted_user_id = p_target_uid
  ) THEN
    RAISE EXCEPTION 'Usuário já possui auditoria de arquivamento para outra conta';
  END IF;

  INSERT INTO public.user_deletion_audit
    (deleted_user_id, email, name, role, archived_to)
  VALUES
    (p_target_uid, coalesce(v_profile.email, ''), coalesce(v_profile.name, ''),
     coalesce(v_profile.role, ''), p_master_uid);

  UPDATE public.reports
  SET owner_id = p_master_uid,
      legacy_data = coalesce(legacy_data, '{}'::jsonb) ||
        jsonb_build_object('archived_owner', jsonb_build_object(
          'id', p_target_uid, 'email', v_profile.email,
          'name', v_profile.name, 'role', v_profile.role,
          'archived_at', now()
        )),
      updated_at = now()
  WHERE owner_id = p_target_uid;

  UPDATE public.trainings
  SET owner_id = p_master_uid,
      legacy_data = coalesce(legacy_data, '{}'::jsonb) ||
        jsonb_build_object('archived_owner', jsonb_build_object(
          'id', p_target_uid, 'email', v_profile.email,
          'name', v_profile.name, 'role', v_profile.role,
          'archived_at', now()
        )),
      updated_at = now()
  WHERE owner_id = p_target_uid;

  UPDATE public.agenda
  SET owner_id = p_master_uid,
      legacy_data = coalesce(legacy_data, '{}'::jsonb) ||
        jsonb_build_object('archived_owner', jsonb_build_object(
          'id', p_target_uid, 'email', v_profile.email,
          'name', v_profile.name, 'role', v_profile.role,
          'archived_at', now()
        )),
      updated_at = now()
  WHERE owner_id = p_target_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_user_business_data(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_user_business_data(uuid, uuid) TO service_role;
