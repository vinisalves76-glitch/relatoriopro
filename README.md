# Relatório Pro

Sistema de gestão operacional e relatórios da operação ArcelorMittal.

## Estrutura de branches

- `main`: versão oficial de produção. Só recebe alterações após validação e autorização de publicação.
- `develop`: branch principal de desenvolvimento e homologação. Novas alterações partem daqui.
- `feature/<assunto>`: trabalho isolado para uma funcionalidade; integrar em `develop` após validação.
- `fix/<assunto>`: correções isoladas; integrar em `develop` após validação.
- `backup/<identificador>`: snapshots de segurança; não usar para desenvolvimento.

## Fluxo de trabalho

1. Desenvolver em `develop` ou em uma branch `feature/*`/`fix/*` criada a partir de `develop`.
2. Testar localmente antes de integrar.
3. Integrar em `develop` e validar a preview.
4. Promover `develop` para `main` somente com autorização explícita. A atualização de `main` pode disparar deploy de produção na Vercel.

## Regras operacionais

- O foco atual é a operação ArcelorMittal; não introduzir multi-clientes nesta fase.
- Preservar os ciclos e nomenclaturas operacionais definidos. A preventiva permanece identificada como `125h`.
- Supabase é a linha atual de backend; arquivos Firebase podem existir apenas como legado documentado até a remoção planejada.
- Não colocar chaves, senhas ou segredos no repositório.


## Contexto para desenvolvimento e IAs

Antes de alterar o sistema, leia [AGENTS.md](./AGENTS.md). Ele contém as regras centrais que devem ser respeitadas por qualquer IA ou pessoa que trabalhe no repositório.

Documentação complementar:

- [Contexto e objetivo do projeto](./docs/PROJECT_CONTEXT.md)
- [Arquitetura atual](./docs/ARCHITECTURE.md)
- [Banco de dados e Storage](./docs/DATABASE.md)
- [Regras operacionais e de negócio](./docs/BUSINESS_RULES.md)
- [Desenvolvimento e validação local](./docs/DEVELOPMENT.md)
- [Política de branches e publicação](./docs/BRANCHING.md)
- [Histórico de decisões](./docs/CHANGELOG.md)
- [Instruções do GitHub Copilot](./.github/copilot-instructions.md)

Esses documentos são contexto para desenvolvimento; não são a biblioteca de manuais e anexos técnicos cadastrados pelos usuários no sistema.
