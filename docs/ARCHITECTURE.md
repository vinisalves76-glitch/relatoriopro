# Arquitetura atual — Relatório Pro

> Documento baseado na estrutura e nos arquivos verificados nesta revisão. Confirme a implementação antes de mudanças estruturais; este documento não substitui a inspeção do código.

## Visão geral

- Interface web composta principalmente por `index.html`, arquivos CSS e módulos JavaScript em `js/`.
- Integração com Supabase por meio de `js/core/supabase-adapter.js`.
- Funções de backend/API em `api/`, executadas no ambiente Vercel quando configurado.
- Configuração de funções e duração no arquivo `vercel.json`.
- Dependência declarada no `package.json`: `@supabase/supabase-js`. O adaptador também importa bibliotecas ESM por URL, incluindo o cliente TUS para upload resumível.

## Camada de dados

O adaptador Supabase centraliza autenticação, acesso a tabelas e Storage. Ele traduz estruturas e nomes legados para tabelas/colunas do Supabase, mantendo compatibilidade com partes da aplicação que ainda usam uma interface de dados anterior.

Entre os mapeamentos observados no adaptador estão:
- perfis: `profiles`;
- relatórios: `reports`;
- fotos de relatórios: `report_photos`;
- configurações: `user_settings`;
- treinamentos: `trainings`;
- agenda: `agenda`.

O adaptador contém também conversões de campos, como `ownerUid` para `owner_id`, `createdAt` para `created_at` e `reportDate` para `report_date`. Não contorne o adaptador sem avaliar as chamadas existentes e o formato dos dados.

## Autenticação e autorização

O adaptador usa Supabase Auth e mantém o perfil da aplicação em `profiles`. A interface aplica controles por perfil/permissão. A autorização real também depende das políticas RLS e das funções de servidor; ocultar um botão na interface não é controle de segurança suficiente.

Antes de alterar permissões, confira:
- funções de verificação de perfil e permissão no frontend;
- políticas RLS atuais no Supabase;
- endpoints em `api/` e validações no servidor;
- regras de criação, edição e exclusão de usuários.

## Arquivos e anexos

O adaptador observado utiliza o bucket privado `training-attachments-private`. Uploads acima de 6 MB usam upload resumível TUS no navegador; arquivos menores usam o método padrão do Storage. O download é obtido por URL assinada com validade de 1 hora.

Não torne o bucket público nem amplie permissões sem revisar RLS/Storage e a necessidade operacional.

## Limites desta documentação

A lista acima descreve o que foi confirmado no adaptador. Ela não afirma que todas as telas, APIs, políticas ou recursos estão concluídos. Para cada tarefa, inspecione os módulos específicos, migrations SQL, configuração da Vercel e políticas aplicadas no ambiente antes de concluir como o fluxo funciona.
