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
