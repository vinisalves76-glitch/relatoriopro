# Instruções para agentes de IA — Relatório Pro

Este arquivo é a fonte central de instruções para qualquer IA ou pessoa que altere este repositório. Leia-o antes de editar código e consulte os documentos indicados abaixo.

## 1. Entenda o projeto antes de agir

1. Leia `README.md`, este arquivo e os documentos relevantes de `docs/`.
2. Confira a branch atual, o estado do Git e os arquivos modificados antes de qualquer alteração.
3. Inspecione o código real, as migrations do Supabase, as políticas RLS e as funções de API relacionadas à tarefa. A documentação orienta; o código e o schema efetivamente aplicados confirmam o comportamento.
4. Se houver conflito entre documentação e implementação, não escolha silenciosamente: identifique a divergência e atualize a documentação somente depois de confirmar a regra correta.

## 2. Contexto e prioridades do produto

- Produto: Relatório Pro / Gestão Operacional.
- Prioridade atual: estabilizar e melhorar a operação existente da ArcelorMittal.
- Não introduzir arquitetura multi-clientes, novos clientes ou fluxos genéricos nesta fase sem solicitação explícita.
- Não confundir a documentação para agentes de programação (`AGENTS.md` e `docs/`) com os manuais, anexos e documentos técnicos cadastrados pelos usuários dentro do sistema.

## 3. Regras operacionais que não podem regredir

- O ciclo de manutenção preventiva definido é **125h**. Não trocar por 250h, não renomear e não criar ciclos alternativos por iniciativa própria.
- Preserve os nomes, etapas, permissões, campos e fluxos operacionais existentes.
- Não invente regras de negócio quando elas não estiverem documentadas ou confirmadas. Sinalize dúvidas antes de alterar comportamentos sensíveis.
- Priorize compatibilidade com os dados já cadastrados e com a operação real.

## 4. Stack e dados

- O backend atual é **Supabase**.
- O adaptador atual está em `js/core/supabase-adapter.js` e oferece uma camada de compatibilidade com chamadas e formatos legados.
- Não reintroduza Firebase como backend ativo. Arquivos Firebase ainda presentes devem ser tratados como legado até que dependências e histórico sejam avaliados.
- Nunca exponha chaves secretas, tokens, credenciais ou dados pessoais em código, logs, documentação ou commits.
- Nunca coloque a chave `service_role` no navegador. O cliente web deve usar somente a chave pública apropriada; operações privilegiadas precisam permanecer no servidor e respeitar as políticas de segurança.
- Não altere tabelas, migrations, RLS, Storage ou autenticação sem rastrear todos os consumidores e avaliar impacto nos dados existentes.

## 5. Segurança e preservação

- Não apague arquivos, tabelas, buckets, políticas, branches ou dados sem autorização explícita e análise de dependências.
- Não enfraqueça RLS, autenticação, autorização por perfil ou validações para “fazer funcionar”.
- Não use dados reais em testes destrutivos. Prefira dados fictícios e ambiente local/preview.
- Não faça migrações destrutivas nem mudanças irreversíveis sem plano de recuperação.

## 6. Git, validação e publicação

- `main`: produção. Nunca faça commits diretos nem force-push nesta branch.
- `develop`: desenvolvimento e homologação.
- `feature/*`, `fix/*` ou branches de documentação: trabalho isolado criado a partir de `develop`.
- Faça alterações pequenas e focadas; não misture refatorações sem relação com a tarefa.
- Execute as verificações disponíveis no projeto e valide os fluxos afetados localmente. Não afirme que testou algo que não executou.
- A Vercel pode publicar automaticamente quando branches conectadas são atualizadas. Não altere configurações nem promova deploy sem autorização.
- **Produção só pode ser atualizada após autorização explícita do responsável.** Uma solicitação para corrigir, desenvolver, testar ou gerar preview não autoriza publicar em produção.

## 7. Comunicação obrigatória

Ao concluir uma tarefa, informe:
- arquivos alterados;
- comportamento alterado e motivo;
- testes realmente executados e resultados;
- riscos, limitações ou pontos ainda não confirmados;
- branch e commit/PR resultante;
- se houve ou não deploy (por padrão, não houve).

Em caso de dúvida que possa afetar dados, segurança, permissões ou regras operacionais, pare e pergunte antes de tomar uma decisão irreversível.
