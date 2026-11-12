# Engenharia de software assistida por IA

## Objetivo
Padronizar o trabalho de Codex e outros agentes para que atuem como uma equipe de engenharia: entendam o produto, planejem, deleguem análises, implementem com foco, testem e documentem. A IA não recebe autoridade implícita para publicar em produção ou executar mudanças destrutivas.

## Camadas
| Camada | Responsabilidade | Local |
|---|---|---|
| Instruções do repositório | Regras, limites, fluxo e contexto mínimo | AGENTS.md |
| Skills | Procedimentos especializados carregados sob demanda | .agents/skills/*/SKILL.md |
| Subagentes | Especialistas para tarefas delimitadas | .codex/agents/*.toml |
| MCP | Conexão com ferramentas e serviços externos | .codex/config.toml + setup local |
| Evidências e decisões | Arquitetura e procedimentos confirmados | docs/ |

## Ciclo de trabalho recomendado
1. **Entender:** ler AGENTS, README e documentação relacionada; inspecionar código e estado Git.
2. **Planejar:** descrever objetivo, arquivos/áreas afetadas, riscos, critérios de aceite e estratégia de teste.
3. **Delegar:** quando útil, pedir análises paralelas a architect, supabase_engineer, frontend_engineer ou qa_reviewer. Agentes de revisão não editam.
4. **Implementar:** carregar Skills pertinentes; alterar somente o escopo aprovado.
5. **Validar:** executar verificações existentes; revisar diff; testar caminhos principais, falhas e permissões.
6. **Concluir:** documentar arquivos, testes, riscos, branch/PR e situação de deploy.
7. **Publicar:** somente após autorização explícita do responsável.

## Política de autonomia
- Autonomia alta para leitura, análise, planejamento, alterações locais não destrutivas e testes com dados fictícios.
- Pode criar migrations e preparar SQL em branch de desenvolvimento, mas deve revisar o SQL e identificar claramente o ambiente antes de aplicar.
- Nenhuma escrita em banco remoto até confirmar que o alvo é um projeto/branch de desenvolvimento isolado e que a ação está autorizada.
- Produção Supabase: MCP read-only por padrão.
- Nenhuma exclusão de dados, mudança destrutiva de schema, alteração de RLS sensível ou deploy de produção sem aprovação explícita.
- Não guardar tokens no repositório. OAuth e segredos ficam no ambiente local/gerenciador seguro.

## Como pedir trabalho ao Codex
> Leia AGENTS.md e use as Skills relevantes. Analise a tarefa, planeje os arquivos afetados, delegue uma revisão independente se houver risco, implemente em branch de trabalho, execute os testes disponíveis, revise o diff e informe evidências. Não aplique alterações no Supabase remoto nem publique em produção sem minha autorização.

## Limites
Skills e subagentes orientam o agente, mas não garantem correção. MCP concede capacidades reais e deve ser configurado com privilégio mínimo. O agente principal permanece responsável pelo resultado e deve verificar o trabalho delegado.
