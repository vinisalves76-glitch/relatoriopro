# Contexto do projeto

## Identificação

- **Nome:** Relatório Pro
- **Escopo atual:** sistema de gestão operacional e relatórios da operação ArcelorMittal.
- **Objetivo da fase atual:** estabilizar, corrigir e aperfeiçoar os processos que já existem na operação atual antes de ampliar o produto.

## Direção do produto

O sistema reúne fluxos de relatórios operacionais/técnicos, gestão de usuários e permissões, agenda e conteúdos de treinamento. A implementação deve ser entendida pelo código atual antes de se assumir que uma tela, guia ou fluxo informativo já está funcional.

A prioridade é resolver necessidades reais da operação ArcelorMittal. Não antecipar uma plataforma multiempresa nem introduzir abstrações que não sejam necessárias à operação validada.

## Regras que devem sobreviver à troca de equipe ou IA

1. A preventiva é identificada como **125h**. Esta nomenclatura e ciclo não podem ser alterados sem autorização explícita.
2. Preservar processos, permissões, dados e terminologia existentes.
3. Supabase é o backend atual; Firebase é legado, não uma alternativa a ser reativada.
4. Não publicar em produção sem autorização explícita.
5. Testar primeiro em ambiente local e/ou homologação.
6. Não tratar conteúdo planejado ou texto de orientação da interface como funcionalidade já implementada. Confirmar no código.

## Contexto para agentes

Este conjunto de documentos existe para que Codex, Copilot, ChatGPT ou outra ferramenta consiga retomar o trabalho sem depender do histórico de uma conversa. As instruções centrais estão em `/AGENTS.md`; a arquitetura, banco, regras e desenvolvimento estão nos documentos relacionados desta pasta.

**Importante:** estes arquivos são contexto para desenvolvimento. Não são a biblioteca de manuais, anexos ou documentos técnicos que os usuários cadastram no Relatório Pro.
