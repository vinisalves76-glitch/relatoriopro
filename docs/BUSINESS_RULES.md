# Regras de negócio e operação

## Escopo atual

A prioridade é a operação existente da **ArcelorMittal**. Não criar neste momento uma estrutura multi-clientes ou adaptar fluxos para outros clientes sem solicitação explícita.

## Ciclo de manutenção

- A manutenção preventiva definida para o processo é **125h**.
- Não alterar para 250h.
- Não renomear, recalcular, substituir ou criar ciclos alternativos por inferência.
- Qualquer mudança futura exige confirmação explícita e avaliação de impacto em telas, filtros, históricos, relatórios, agenda, indicadores e dados existentes.

## Preservação dos fluxos

- Manter nomenclaturas operacionais já adotadas.
- Preservar perfis, permissões e etapas de aprovação.
- Não assumir que um texto de planejamento ou guia informativo representa uma funcionalidade implementada.
- Não mudar regras de criação, edição, aprovação ou exclusão de registros sem confirmar o processo esperado.

## Perfis e permissões

O código contém perfis e controles de acesso, inclusive distinção entre usuário mestre e perfis administrativos/operacionais. A lista exata de papéis e permissões deve ser conferida no código e nas políticas RLS antes de qualquer alteração. Não conceder privilégios adicionais por conveniência.

## Regra de decisão

Quando uma regra operacional não estiver explícita no código ou nesta documentação, não invente. Registre a dúvida e peça confirmação antes de alterar o comportamento.
