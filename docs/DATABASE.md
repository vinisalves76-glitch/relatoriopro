# Banco de dados e Storage — Supabase

## Backend vigente

O backend atual do Relatório Pro é Supabase. O ponto central de integração no frontend é `js/core/supabase-adapter.js`.

O adaptador usa a chave pública/anon no cliente do navegador. Segredos e operações privilegiadas não devem ser movidos para o frontend.

## Tabelas identificadas no adaptador

| Tabela | Uso observado |
|---|---|
| `profiles` | Perfil, identificação, papel, permissões, status e área operacional |
| `reports` | Relatórios vinculados ao proprietário |
| `report_photos` | Fotos vinculadas a um relatório e proprietário |
| `user_settings` | Configurações por usuário e chave |
| `trainings` | Cadastro e fluxo de revisão/aprovação de treinamentos |
| `agenda` | Compromissos/atividades vinculados ao proprietário |

O adaptador também preserva campos adicionais em estruturas `legacy_data` em algumas tabelas para compatibilidade. Não remova ou reestruture esses campos sem mapear os dados existentes e os consumidores.

## Storage identificado

- Bucket utilizado pelo adaptador: `training-attachments-private`.
- O código solicita URLs assinadas para leitura, com validade de 3600 segundos.
- Uploads acima de 6 MB usam TUS; os demais usam upload padrão.
- Os anexos são tratados como privados. Não alterar visibilidade ou políticas sem revisão de segurança.

## Migrations e políticas

A definição efetiva do schema deve ser confirmada nos arquivos SQL de `supabase/migrations/` e no projeto Supabase conectado. As tabelas listadas acima foram identificadas no adaptador; esta documentação **não substitui** as migrations nem confirma, por si só, que o schema remoto está exatamente igual.

Antes de qualquer mudança de banco:
1. Liste e leia as migrations existentes em ordem.
2. Confira o schema e as políticas RLS efetivamente aplicadas no ambiente de desenvolvimento/homologação.
3. Identifique consultas, gravações e relacionamentos no adaptador, frontend e APIs.
4. Planeje compatibilidade com registros existentes.
5. Crie migration versionada e reversível sempre que possível.
6. Valide em ambiente não produtivo antes de qualquer promoção.

## Segurança

- Nunca versionar `service_role`, senhas, tokens ou URLs assinadas.
- Nunca usar `service_role` no navegador.
- Não desativar RLS como correção rápida.
- Não tornar bucket privado público para contornar erro de acesso.
- Não apagar dados ou colunas sem autorização explícita e plano de recuperação.
