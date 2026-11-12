# Configuração MCP — Codex / IRMEN ONE

## O que já fica versionado
O arquivo .codex/config.toml registra servidores públicos de documentação (OpenAI Developer Docs e Context7). Eles não recebem credenciais do Supabase nem acesso ao banco.

Depois de atualizar a branch no VS Code, abra um terminal na raiz do repositório e execute:

~~~bash
codex mcp list
~~~

Se o projeto estiver marcado como confiável, o Codex carrega a configuração local do projeto.

## Supabase MCP — configuração segura
O servidor oficial remoto é https://mcp.supabase.com/mcp e usa autenticação OAuth. Configure-o com o identificador do projeto (Project Ref) correto; não conecte sem escopo a todos os projetos da conta.

### 1. Primeiro conectar somente para leitura
Obtenha o Project Ref no painel do projeto Supabase de desenvolvimento. Não copie tokens ou chaves para este repositório.

~~~bash
codex mcp add supabase-dev --url "https://mcp.supabase.com/mcp?project_ref=SEU_PROJECT_REF&read_only=true&features=database,docs,debugging,development"
codex mcp login supabase-dev
codex mcp list
~~~

A autenticação abre o fluxo OAuth do Supabase. Confira no cliente que o servidor está conectado e que o projeto selecionado é o correto.

### 2. Habilitar escrita apenas em ambiente isolado
Antes de escrita, crie/identifique um projeto ou branch de banco **exclusivo para desenvolvimento/homologação**, separado dos dados reais de produção. Confirme backup e restauração.

Depois de obter o Project Ref do ambiente de desenvolvimento, remova a conexão somente leitura e registre uma conexão separada:

~~~bash
codex mcp remove supabase-dev
codex mcp add supabase-dev-write --url "https://mcp.supabase.com/mcp?project_ref=PROJECT_REF_DE_DESENVOLVIMENTO&features=database,docs,debugging,development"
codex mcp login supabase-dev-write
~~~

Mantenha as confirmações manuais do Codex para ferramentas de escrita. Revise cada migration/SQL antes de aprovar. Não use skip_elicitations para operações de escrita.

### 3. Produção
Se for indispensável consultar produção, use conexão separada, escopada ao Project Ref de produção, sempre com read_only=true e somente os grupos de ferramentas necessários. Nunca configure escrita MCP para produção como padrão.

## Outros MCPs
- **Context7:** já está configurado em .codex/config.toml para consultar documentação de bibliotecas.
- **OpenAI Developer Docs:** já está configurado para documentação oficial de Codex, API e produtos OpenAI.
- **GitHub:** o Codex pode trabalhar com o repositório local via Git. Se instalar um MCP GitHub adicional, use autenticação local/OAuth ou variável de ambiente; nunca grave PAT no Git.
- **Vercel:** mantenha autenticação e operações de deploy sob controle local. Não adicione token Vercel em arquivo versionado.
- **Playwright:** pode ser adicionado quando o projeto tiver testes E2E definidos; prefira execução local e dados fictícios.

## Diagnóstico
~~~bash
codex mcp list
codex mcp get supabase-dev
~~~

No Codex TUI, use /mcp. No VS Code, reinicie a extensão/servidor Codex se a nova configuração não aparecer.

## Segurança
O MCP executa ações com a identidade e permissões concedidas. Escopo por projeto, modo read-only, grupos mínimos de ferramentas e confirmação manual reduzem risco, mas não substituem revisão humana. Nunca use MCP de escrita contra produção.
