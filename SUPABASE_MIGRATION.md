# RelatorioPro — preparação da migração para Supabase

## Estado desta alteração

Esta branch adiciona apenas a base inicial de banco e o roteiro de migração. Ela **não muda o app em produção**, não troca a autenticação e não importa nem exclui dados do Firebase.

## Projeto de destino

- Project URL: `https://vwvesygsudhbaqmayhsz.supabase.co`
- A chave `sb_publishable_...` é pública e pode ser usada pelo cliente web. Não coloque chave `service_role`, chave `secret`, senha do banco ou credenciais administrativas no navegador ou no Git.

## Arquivos

- `supabase/migrations/001_initial_schema.sql`: tabelas e políticas iniciais com Row Level Security (RLS).

## Tabelas previstas

- `profiles`: perfil, papel, permissões, status e vínculo opcional ao UID antigo do Firebase.
- `reports`: dados dos relatórios, mantendo `legacy_data` para campos antigos.
- `report_photos`: fotos associadas aos relatórios. O campo `data` permite uma etapa transitória para os dados antigos em data URI; a etapa recomendada é transferir arquivos para Supabase Storage.
- `user_settings`: configurações do modelo visual por usuário.
- `trainings` e `training_attachments`: conteúdo, fluxo de aprovação e metadados dos anexos.
- `agenda`: compromissos atribuídos ao profissional.

## Sequência segura

1. Faça backup/exportação do Firestore e do Firebase Storage.
2. Crie/valide as tabelas em um projeto Supabase de teste antes de executar a migração de dados.
3. Migre/crie as contas no Supabase Auth e faça o mapeamento entre os UIDs antigos e os novos IDs. O ID de Firebase **não** é igual ao UUID do Supabase Auth.
4. Cadastre perfis; o perfil mestre deve receber o papel `super_admin` por procedimento administrativo controlado.
5. Migre relatórios, fotos, configurações, treinamentos, anexos e agenda; valide contagens e amostras.
6. Atualize o app para Supabase em uma branch separada e teste cada papel.
7. Só então faça o corte para produção. Mantenha Firebase intacto até concluir a validação e definir rollback.

## Atenção à autenticação

Não se deve presumir que os hashes de senha do Firebase possam ser importados diretamente para o Supabase. Antes de decidir o método, verifique a configuração de exportação do Firebase Auth. Se não houver importação compatível, planeje redefinição de senha ou um fluxo controlado de reautenticação.

## Revisões antes de usar em produção

- Confirmar as permissões reais e os papéis que podem criar, aprovar, desativar e excluir usuários.
- Implementar políticas de Storage para arquivos privados; não usar URLs públicas para documentos internos sem aprovação.
- Fazer testes de RLS com usuários de cada papel.
- Implementar migração idempotente com logs e validação; não migrar dados diretamente no navegador.
- A migração ainda não está executada no Supabase.
