# Relatório Pro

Sistema de gestão operacional e relatórios da Irmen para a operação ArcelorMittal Andradas.

## Branches e publicação
- main: produção; somente recebe versões validadas e explicitamente autorizadas.
- develop: desenvolvimento e homologação.
- feature/*, fix/*, chore/*: trabalho isolado criado a partir de develop.
- backup/*: snapshots de recuperação; não usar para desenvolvimento.

Fluxo: branch de trabalho → testes locais → PR para develop → preview/homologação → autorização explícita → promoção para main. Não publicar em produção sem autorização.

## Regras essenciais
- Foco atual: estabilizar a operação ArcelorMittal Andradas; não implementar multi-clientes nesta fase.
- Preservar o ciclo de inspeção/manutenção **125h**.
- Supabase é o backend vigente; Firebase é legado.
- Não versionar segredos nem executar operações destrutivas sem autorização e plano de recuperação.

## Guia para engenharia assistida por IA

**Antes de qualquer alteração, leia [AGENTS.md](./AGENTS.md).** Ele define as regras obrigatórias para Codex e demais agentes.

### Estrutura de IA
- [AGENTS.md](./AGENTS.md) — instruções gerais e limites de atuação.
- [docs/AI_ENGINEERING.md](./docs/AI_ENGINEERING.md) — arquitetura de trabalho com IA, Skills, subagentes e MCP.
- [.agents/skills/](./.agents/skills/) — Skills reutilizáveis do projeto.
- [.codex/agents/](./.codex/agents/) — definições dos subagentes especializados do Codex.
- [.codex/MCP_SETUP.md](./.codex/MCP_SETUP.md) — configuração segura de servidores MCP.
- [.codex/config.toml](./.codex/config.toml) — MCPs de documentação sem credenciais.

### Documentação do produto
- [Contexto do projeto](./docs/PROJECT_CONTEXT.md)
- [Arquitetura atual](./docs/ARCHITECTURE.md)
- [Banco de dados e Storage](./docs/DATABASE.md)
- [Regras operacionais](./docs/BUSINESS_RULES.md)
- [Desenvolvimento e validação](./docs/DEVELOPMENT.md)
- [Política de branches](./docs/BRANCHING.md)
- [Histórico de decisões](./docs/CHANGELOG.md)

A documentação de engenharia não é a biblioteca de manuais e anexos técnicos cadastrados pelos usuários no sistema.
