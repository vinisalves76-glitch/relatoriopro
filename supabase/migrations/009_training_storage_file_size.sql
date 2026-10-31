-- IRMEN RelatorioPro: remover limite específico de tamanho do bucket.
-- O limite global permitido pelo plano Supabase continua valendo.
UPDATE storage.buckets
SET file_size_limit = NULL
WHERE id = 'training-attachments-private';
