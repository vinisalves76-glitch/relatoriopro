# Auditoria da Gestão Operacional e plano de evolução

**Data da auditoria:** 06/11/2026<br>
**Escopo:** versão de produção (`origin/main`) e referência de desenvolvimento (`origin/develop`).<br>
**Status do diagnóstico:** a auditoria inicial abaixo permanece como registro do estado anterior à implementação. A branch local agora contém uma implementação não commitada da migration 014, da migration 015 (separada e não aplicada) e da integração frontend. Esta revisão foi estática; nenhuma migration, SQL remoto, deploy ou alteração de produção foi executada.

## Estado atual da implementação local

- A migration 014 adiciona histórico de status, atividades de OS, validações de vínculo, RLS, triggers de compatibilidade com clientes antigos e as RPCs `create_operational_equipment`, `transition_operational_equipment_status` e `close_operational_work_order`.
- A migration 014 cria snapshots somente para equipamentos sem qualquer linha de histórico. Esses snapshots não atribuem autoria (`actor_id` nulo e nome vazio) e informam que alterações anteriores não estão disponíveis. Registros identificados pelo texto de snapshot de um rascunho anterior também têm autoria removida e origem marcada como `initial_snapshot`.
- O frontend atualizado usa as três RPCs nos fluxos correspondentes, grava atividades/pendências/impedimentos na tabela de atividades e mantém o caminho de compatibilidade legado durante a etapa 014. Os controles, agendamentos e execuções 125h continuam usando as tabelas e RPC existentes das migrations 012–013.
- A migration 015 permanece separada. Ela instala bloqueios de alterações diretas de status/encerramento e não deve ser aplicada junto com a 014. Sua aplicação depende da validação da 014 e da confirmação de que clientes antigos e sessões abertas deixaram de ser usados.
- A checagem de código não encontrou incompatibilidade de assinatura entre os payloads frontend e as três RPCs da 014. Isso não valida o schema remoto, permissões efetivamente aplicadas, concorrência real ou comportamento em runtime.
- Pendências remanescentes no fechamento da OS são guardadas como notas do evento de encerramento; não são convertidas em novos registros `pending`. Isso corresponde ao contrato atual do frontend e da RPC.
- Não há ferramentas locais `node`, `npm`, `psql`, `supabase`, `docker` ou `pg_format` disponíveis nesta sessão. O `package.json` não define scripts de teste e não foram localizados arquivos de teste. Portanto, sintaxe JS, parsing/aplicação SQL e build não foram validados por ferramentas executáveis.

### Sequência de implantação controlada

1. Antes de qualquer escrita, obter backup recuperável e criar/confirmar ambiente descartável ou de homologação; comparar nele o schema, policies, funções e migrations aplicadas com as dependências 001–013. Não usar a produção como primeiro teste.
2. Revisar e aprovar o SQL final da 014 e executar a migration 014 isoladamente em homologação. Verificar tabelas, constraints, índices, triggers, grants, RLS, snapshots sem autoria inventada, rollback e compatibilidade de clientes antigos.
3. Publicar o frontend correspondente à 014 somente após validar a migration no ambiente de ensaio. Exercitar cadastro, mudança de status, histórico, atividades/pendências/impedimentos, fechamento e liberação, além dos fluxos 125h.
4. Monitorar erros e confirmar que versões antigas ainda em uso funcionam com a 014. Em produção, só avançar após existir backup/recuperação e janela aprovada; aplicar a 014 isoladamente e validar os fluxos reais sob observação operacional.
5. Não aplicar a 015 no mesmo lote. Após confirmar a estabilidade da 014 e comprovar que não há clientes antigos nem sessões antigas em uso, avaliar e testar a 015 separadamente; ela não faz parte desta preparação da 014.

**Estado para implantação:** a 014 está preparada em código para revisão e ensaio controlado, mas ainda não está liberada para aplicação direta em produção. Faltam parser/execução local ou descartável do SQL, validação do schema remoto em ambiente seguro, testes funcionais de integração e plano de recuperação comprovado.

## 1. Referências e limitações

- `origin/main`: `ddffb77b4ad5619064ab420839e979d7e04ec004`.
- `origin/develop`: `afa2b1928073a85eaa3664e063018f0079b9b36a`.
- A comparação dos arquivos `index.html`, `js/`, `css/`, `api/`, `supabase/`, `package.json` e `vercel.json` não encontrou diferenças entre produção e desenvolvimento.
- As diferenças entre os commits consultados são documentais: `develop` removeu `AGENTS.md`, `.github/copilot-instructions.md` e parte da documentação de contexto presente em `main`. Isso é uma lacuna de governança documental, não uma divergência funcional comprovada.
- O checkout de trabalho é `feature/limpeza-gestao-operacional`, baseado no commit de `origin/develop`, e contém alterações visuais locais anteriores ainda não commitadas. Essas alterações foram preservadas; a comparação funcional deste relatório usa as referências Git acima, não o estado visual alterado do checkout.
- Foram inspecionados o código e as migrations versionadas. Não houve conexão ou leitura do schema efetivamente aplicado no Supabase. Portanto, a existência e o estado atual das tabelas, policies, funções e dados remotos precisam ser confirmados em homologação antes de qualquer plano de migração. Uma migration versionada não prova, por si só, que foi aplicada.
- Não foram consultados nem copiados dados reais. Não foram executados testes funcionais nem migrations; esta etapa foi uma auditoria estática.

## 2. Diagnóstico executivo

A aplicação é uma interface web estática com módulos JavaScript, autenticação e dados no Supabase. A operação atual cobre cadastro de equipamentos, ordens de serviço, eventos, leituras de horímetro e manutenção preventiva/agendamento de 125h. O escopo por área já existe no banco e a área inicial cadastrada nas migrations é ArcelorMittal Andradas.

Ainda não foi encontrada implementação operacional para relatório de fim de turno, registro de DF por equipamento/turno, histórico de alterações do status da frota ou acesso operacional de mecânicos. Os indicadores de DF, MTBF, MTTR e downtime no painel são explicitamente indisponíveis por falta de dados; o percentual de equipamentos com status “disponível” não é DF.

O principal risco de autorização nesta evolução é que o acesso operacional atual é concedido em bloco a `super_admin` e `supervisor_area`, enquanto as policies permitem CRUD amplo na área. Não há papel `mecanico` nem autorização granular para mecânicos. A biblioteca regular de treinamentos tem fluxo de aprovação; o caminho de manuais é separado no frontend e tenta gravar o documento já como publicado, mas as policies versionadas só permitem inserir treinamentos em rascunho ou pendentes. Além disso, a policy de leitura do Storage para objetos de outros usuários não corresponde claramente ao caminho usado pelo upload de manuais. Esses pontos exigem validação e desenho explícito antes de introduzir a área dos mecânicos.

## 3. Arquitetura e módulos atuais

### Camada de interface

- [`index.html`](../index.html): shell da aplicação, navegação, páginas de relatório, treinamentos, agenda, usuários e Gestão Operacional. Em produção contém também markup antigo de demonstração da Gestão Operacional com números fictícios; ao abrir a página, o módulo JS substitui o conteúdo da raiz. A inicialização assíncrona pode deixar esse conteúdo antigo visível durante a transição ou em caso de falha.
- [`js/app.js`](../js/app.js): inicialização da aplicação, sessão, autorização visual, relatórios genéricos, treinamentos/manuais, agenda, cadastro de usuários e roteamento das páginas. Chama `initOperationalModule` ao abrir Gestão Operacional.
- [`js/modules/operational-crud.js`](../js/modules/operational-crud.js): carrega a área, frota, OS, eventos, horímetros e resumo operacional; implementa formulários de equipamento, OS, evento e leitura. Cria o conteúdo da tela com templates locais.
- [`js/modules/maintenance-125h.js`](../js/modules/maintenance-125h.js): consulta controles, serviços e agenda 125h; configura controle, agenda/reprograma, registra execução e pausa/ativa controles.
- [`js/checklist-trem-forca.js`](../js/checklist-trem-forca.js): checklist fotográfico local/offline, assinatura e geração de documento pela janela de impressão. Não grava no Supabase.
- CSS: [`css/styles.css`](../css/styles.css) fornece a folha principal; [`css/gestao-operacional.css`](../css/gestao-operacional.css) estiliza o protótipo antigo; [`css/checklist-trem-forca.css`](../css/checklist-trem-forca.css) estiliza o checklist. Os módulos dinâmicos também injetam regras de estilo próprias em seus templates.

### Componentes compartilhados e pontos de acoplamento

- Não foi identificado um framework ou catálogo de componentes reutilizáveis para os módulos operacionais. Cada módulo constrói seus templates e comportamento localmente.
- O acoplamento principal é o elemento `#gestaoOperacional`: `operational-crud.js` cria os painéis e passa equipamento/área ao módulo 125h e equipamento ao checklist.
- A navegação dos painéis usa botões `.operational-main-tab` declarados no HTML e uma função de troca de painel no módulo de CRUD.
- Helpers de escape, data, status e nomes de equipamento são locais aos módulos; há duplicação de apresentação e convenções entre telas.
- [`js/core/supabase-adapter.js`](../js/core/supabase-adapter.js) adapta parte do acesso legado a relatórios, perfis, agenda, treinamentos e Storage para Supabase. Os módulos operacionais usam o cliente Supabase diretamente.
- [`js/core/permissions.js`](../js/core/permissions.js) contém permissões padrão para relatórios/modelo e defaults do supervisor operacional; não existe default para mecânico.

## 4. Dados existentes e relacionamentos

As tabelas abaixo estão declaradas nas migrations locais, não verificadas diretamente no projeto remoto.

| Tabela | Uso e relacionamentos observados |
|---|---|
| `profiles` | Perfil vinculado a `auth.users`; papel, permissões, ativo e troca de senha. `operational_area_id` foi adicionado na migration 011. |
| `operational_areas` | Catálogo de áreas. Migration 011 cria `arcelormittal-andradas`; o modelo admite outros IDs, embora UI e cadastros atuais estejam concentrados nessa área. |
| `operational_equipment` | Cadastro persistente por área; identificação única dentro da área, marca/modelo/categoria, status e horímetro atual. Pode ser inserido com status `maintenance`. |
| `operational_work_orders` | OS vinculada à área e ao equipamento; número, título, descrição, prioridade, status, abertura e fechamento. |
| `operational_maintenance_events` | Evento vinculado ao equipamento, opcionalmente a uma OS; tipo, descrição e data. |
| `operational_horimeter_readings` | Leituras históricas por equipamento, valor, data, observação e autor. |
| `operational_125h_control` | Controle único por equipamento, área, intervalo fixo de 125h, último horímetro de serviço e habilitado/pausado. |
| `operational_125h_services` | Histórico de execuções 125h por equipamento, horímetro, data, texto de checklist e observações. |
| `operational_125h_schedules` | Agenda por equipamento, data e horímetro planejados, responsável em texto, observações e status. |
| `reports` / `report_photos` | Relatórios genéricos por proprietário, com campos livres de equipamento, atividades, observações, resultados e conclusão; fotos dependem do relatório. Não há vínculo estruturado com `operational_equipment` ou turno. |
| `trainings` / `training_attachments` | Treinamentos com estado de revisão e metadados; o adaptador também guarda campos legados em `legacy_data`. Manuais são representados pelo mesmo domínio `trainings` via `docType` em dados legados. |
| `agenda` | Compromissos vinculados ao proprietário/usuário e a equipamento em texto; não é a agenda de inspeções 125h. |

Migration 011 adiciona triggers que conferem se equipamento e OS pertencem à área informada. As tabelas operacionais mantêm `area_id` e índices de consulta. O vínculo `equipment_id` em várias tabelas referencia equipamento; a regra de área é complementada por trigger. A migration 013 cria índice parcial para limitar a uma agenda ativa 125h por equipamento.

## 5. RLS, autorização e autenticação

### Gestão Operacional

- `is_master()` reconhece perfil ativo `super_admin`; `is_system_admin()` reconhece `super_admin`, `auxiliar_administrativo`, `gerente` e `coordenador`.
- `is_area_supervisor(area_id)` verifica perfil ativo `supervisor_area` vinculado à área ativa.
- `has_operational_access(area_id)` atualmente equivale a mestre **ou supervisor da área**.
- Migration 011 ativa RLS em áreas, equipamentos, OS, eventos e leituras e concede `SELECT`, `INSERT`, `UPDATE` e `DELETE` nas policies de área para quem passa por `has_operational_access`. As migrations 012–013 usam a mesma função para controles, execuções e agenda 125h.
- No frontend, `initOperationalModule` só inicializa para `super_admin` ou `supervisor_area`. As permissões de `supervisor_area` incluem `operational.view`, `equipment.manage`, `work_orders.manage`, `maintenance.manage`, `horimeter.manage` e `operational.reports.view`, mas o escopo das policies operacionais não separa essas operações por permissão.
- Consequência: nem a camada atual nem a RLS oferecem acesso restrito a mecânicos para consulta/execução atribuída. Esconder botões não será suficiente para implementar esse perfil.

### Autenticação e criação de usuários

- O login usa Supabase Auth por e-mail/senha; o perfil da aplicação é carregado de `profiles`.
- O frontend cria a conta com `creatorClient.auth.signUp` usando o cliente público e, em seguida, insere o perfil. Não foi identificada uma chamada de criação administrativa via `service_role` no navegador.
- A tela de usuários lista auxiliar administrativo, gerente, coordenador, instrutor técnico, consultor técnico e supervisor de área; o supervisor só pode ser cadastrado pelo ADM Master, com área vinculada.
- A constraint de `profiles.role` da migration 011 também não inclui `mecanico`. A migration 001 e a migration 003 limitam criação de perfil a regras específicas; a migration 011 permite supervisor de área somente pelo ramo de mestre na policy de criação.
- O fluxo `must_change_password` exige troca inicial e a migration 005 oferece RPC restrita para concluir a troca. Nenhuma alteração de autenticação ou dos papéis deve ser feita sem atualizar e testar conjuntamente frontend, constraints e policies.

### Manuais e POPs

- Treinamentos regulares têm estados `draft`, `pending`, `published` e `returned`. O frontend apresenta fila de aprovação/devolução apenas para `isSystemAdmin()`; publicação e revisão passam por `trainingAdmin()`.
- A leitura de treinamentos publicados é prevista para usuários ativos; rascunhos/retornados ficam limitados ao autor e administradores pela RLS de `trainings`.
- Manuais usam outro caminho: o frontend grava `docType: technical_manual` nos dados legados da tabela `trainings`, envia o arquivo ao bucket privado e tenta criar o registro já com `status: published`. `trainingCanCreate()` permite vários perfis operacionais, sem etapa de aprovação específica para esse fluxo.
- **Divergência a resolver antes de qualquer alteração:** policies de insert das migrations 001 e 003 exigem `status in ('draft','pending')`, inclusive para o fluxo de criação, enquanto o caminho de manual envia `published`. O banco versionado tende a rejeitar esse insert. O upload precede o registro; portanto, uma falha pode deixar objeto sem registro se a limpeza não puder ser autorizada.
- O caminho de upload de manual é `<uid>/manuals/<id>/<arquivo>`. A policy de leitura geral da migration 002 procura o ID do treinamento no segundo segmento do caminho; nesse fluxo, o segundo segmento é `manuals`. A migration 010 também define leitura de Storage na pasta do próprio usuário. Assim, leitura por outro usuário ativo, como um mecânico que consulta o manual de outro autor, não está demonstrada pelas policies versionadas.
- O bucket `training-attachments-private` é privado. Policies de Storage e geração de URL assinada continuam sendo controles necessários; não devem ser enfraquecidos para contornar os conflitos acima.
- O código inspecionado oferece cadastro de manuais, mas não identificou um módulo específico para POP nem um estado/ciclo de publicação separado para esse tipo documental.

## 6. Funcionalidades reaproveitáveis

- Cadastro permanente de equipamento, unicidade de identificação por área, status atual e horímetro.
- Scoping por área e integridade de vínculos entre equipamentos, OS e eventos.
- OS básica com prioridade, estado, data de abertura e fechamento.
- Eventos de manutenção/inspeção/ocorrência e histórico de horímetro.
- Controle preventivo 125h, agenda por equipamento, histórico de execução e RPC transacional `complete_operational_125h_service`.
- Framework de autenticação por perfil, criação pelo ADM Master, `active`, troca inicial de senha e policies de Storage.
- Relatórios genéricos como referência de campos narrativos e fluxo de impressão; não como vínculo operacional pronto.
- Workflow aprovado de treinamentos como referência para preservar a liberação controlada dos materiais.

## 7. Funcionalidades a complementar e conflitos

| Requisito | Situação observada | Complementação necessária |
|---|---|---|
| Status de frota com histórico | Status atual fica em `operational_equipment`; edição sobrescreve o valor. Não há tabela de transição/autoria/motivo. | Histórico append-only de mudanças, autoria, horário, estado anterior/novo e motivo; definir quem pode alterar. |
| Equipamento iniciado em manutenção | O formulário de equipamento aceita o status `maintenance`. | Reaproveitável; definir se exige OS de manutenção ao cadastrar já parado e como validar consistência. |
| Fechamento de turno por equipamento | Não foi encontrada tabela/tela/API de fechamento de turno. O relatório genérico é por proprietário e usa equipamento em texto. | Novo vínculo de fechamento, turno, equipamento, autor e participantes; atividades, pendências, programação, observações e impedimentos. Definir unicidade e correção/reabertura. |
| Participantes mecânicos | Não há entidade estruturada de participantes nos relatórios operacionais existentes. | Relação N:N com perfis mecânicos; distinguir autor/preenchedor dos colegas participantes. |
| DF informada pelo cliente | Não há campo/registro de DF. O painel tem apenas placeholder “Disponibilidade física — Dados insuficientes”. | Valor informado manualmente pelo supervisor, associado ao fechamento/equipamento/turno; histórico de versões, autor, data e correção. Sem fórmula automática ou confusão com status da frota. |
| Gestão de manutenção | OS e eventos são simples. Não há atividade/tarefa, responsável, paralisação, previsão, pendência estruturada ou timeline de alterações. Mudar OS para concluída grava `closed_at`, mas não há fechamento transacional que atualize o status do equipamento nem histórico desse status. | Complementar OS/eventos e atividade histórica; fechar manutenção em transação que registra saída e mudança de status. Definir se uma OS pode incluir várias intervenções e responsáveis. |
| Agenda 125h atribuída | A agenda usa `responsible_name` (texto), sem `profile_id`, e edição/execução é disponibilizada no painel atual de supervisor/mestre. | Associar responsável a perfil; política de leitura por atribuição e registro de execução pelo mecânico sem conceder administração do controle. Preservar registros e ciclo de 125h. |
| Área do mecânico | Papel inexistente na constraint, defaults e UI de cadastro; módulo operacional não admite esse perfil. | Novo papel e permissões mínimas, tela de trabalho e RLS própria, sem acesso genérico de CRUD operacional. |
| Indicadores | Há contagens de frota, status, OS, prioridades, eventos, leituras e alertas 125h; backlog aparece apenas por quantidade. DF, MTBF, MTTR, downtime e cumprimento preventivo são placeholders sem cálculo. | Especificar a fonte e os limites de cada indicador. Exibir DF do cliente sem fórmula de consolidação inventada. |
| Manuais/POPs para mecânico | Treinamento publicado é legível pelo perfil ativo; o fluxo legado de manuais conflita com as policies de status e Storage descritas acima. | Preservar aprovação obrigatória e validar leitura de conteúdo e arquivo por autor, gerente/ADM aprovador e mecânico, inclusive URLs assinadas. |

### Conflitos entre módulos

1. A frota e as OS estão no módulo operacional; relatórios genéricos ficam em `reports` e agenda de equipe em `agenda`. Não há entidade comum de turno nem relacionamento entre esses domínios.
2. O painel já expõe estado atual de frota e indicadores de manutenção, mas esses dados não equivalem a DF fornecida pelo cliente.
3. O módulo 125h tem seus próprios controles, serviços e agenda; a OS/eventos não são a fonte única de execução preventiva.
4. A agenda 125h registra nome de responsável, não identidade do usuário, tornando impossível aplicar RLS de atribuição de forma confiável.
5. Treinamentos regulares e manuais usam o mesmo domínio lógico com fluxos de autorização divergentes.
6. `index.html` em produção contém conteúdo demonstrativo antigo, enquanto a tela dinâmica é reconstruída pelo JavaScript; confirmar qual conteúdo realmente é exibido em carregamento lento/falha antes de substituir a tela.

## 8. Proposta de relacionamentos

Proposta conceitual para validação do negócio; não é migration nem decisão final de colunas:

```text
operational_areas
  └── operational_equipment
        ├── operational_equipment_status_history
        ├── operational_work_orders
        │     └── operational_work_order_updates / activities
        ├── operational_horimeter_readings
        ├── operational_125h_control
        ├── operational_125h_schedules ── assigned_profile_id → profiles
        │     └── operational_125h_services (execução/autor)
        └── operational_shift_reports (equipamento + área + turno)
              ├── operational_shift_report_participants → profiles
              └── operational_shift_df_history
                    (valor fornecido, versão/correção, autor e data)
```

- Manter `equipment_id` e `area_id` consistentes com as validações já existentes.
- `created_by`/autor do fechamento deve ser independente da lista de mecânicos participantes.
- A DF deve ser um valor fornecido, associado ao turno e ao equipamento; não derivar da proporção de status da frota. Guardar versões ou eventos de correção em vez de sobrescrever o valor anterior.
- As atividades e mudanças de manutenção devem preservar histórico. Pode-se evoluir `operational_work_orders` e usar tabela filha de atualizações, evitando reescrever a funcionalidade existente.
- A execução 125h existente deve ser reaproveitada. O vínculo ao responsável deve usar identidade autenticada, mantendo um rótulo histórico se necessário, e preservar agenda/serviços existentes.
- Antes de escolher cardinalidades ou chaves únicas do turno, confirmar a definição operacional de “turno”, possibilidade de mais de um fechamento por equipamento/turno e regras de correção.

## 9. Necessidade de banco e impacto RLS

**Conclusão preliminar: alterações aditivas no banco provavelmente serão necessárias** para status histórico, fechamento de turno, participantes, DF versionada, tarefas/histórico de manutenção e identidade do mecânico responsável. A estrutura atual não possui esses relacionamentos. Reutilizar apenas campos legados JSON ou relatórios genéricos não atende bem a integridade, histórico, consulta e RLS exigidos.

As policies também precisarão de extensão coordenada:

- adicionar o papel de mecânico às constraints e padrões de permissão, se aprovado;
- separar capacidade de visualizar equipamentos/turnos e executar inspeções atribuídas da capacidade de cadastrar/editar frota, manutenção ou agenda;
- limitar supervisor à sua área e atribuir ao mecânico somente registros designados, com verificações tanto em `USING` quanto em `WITH CHECK`;
- permitir ao supervisor criar relatório para qualquer equipamento da área sem conceder leitura de relatórios de outras áreas;
- restringir DF a lançamento/correção pelo supervisor e preservar versões anteriores e autoria;
- proteger mudanças de status e finalização da manutenção com autoria e vínculo à área; preferir RPC transacional para alterações que precisam ocorrer juntas;
- preservar policies existentes de `trainings` e Storage e testar explicitamente fluxo de revisão/publicação de manuais/POPs antes de alterá-las;
- não tornar bucket público nem conceder políticas amplas por conveniência.

Não é possível concluir quais mudanças remotas serão necessárias até verificar o schema, as policies e o histórico de migrations efetivamente aplicados em ambiente não produtivo.

## 10. Plano de implementação proposto

Cada etapa depende da aprovação do diagnóstico e das decisões operacionais pendentes.

1. **Fechar definições e matriz de acesso.** Definir identificação de turno, unicidade/reabertura, campos obrigatórios, correção de DF, eventos de status e acesso de cada perfil. Confirmar quais cargos são aprovadores de manuais e POPs.<br>
   **Teste:** revisar casos de uso/matriz supervisor, mecânico, gerente, ADM de treinamento e Master; nenhum cálculo automático de DF.
2. **Validar ambiente e desenhar migrations incrementais.** Comparar schema/RLS remotos de homologação com `supabase/migrations/001–013`; verificar dados existentes e dependências. Preparar migrations somente aditivas e plano de recuperação.<br>
   **Teste:** aplicar em banco local/homologação descartável; confirmar constraints, FKs, triggers, grants, RLS e compatibilidade sem dados reais.
3. **Histórico e ciclo de status da frota/manutenção.** Reaproveitar cadastro/OS; adicionar histórico e campos/atualizações de manutenção aprovados; finalizar manutenção atomicamente com status operacional e saída registrada. Para a migration 014 preparada neste trabalho, fazer rollout aditivo sem bloqueios diretos; validar/deployar o frontend que usa as RPCs e somente depois considerar a migration 015, que ativa as proteções. Não aplicar 014 e 015 no mesmo lote.<br>
   **Teste:** criar equipamento já em manutenção; transições válidas/inválidas; autoria; concorrência; rollback; preservar OS/eventos/leituras/controles antigos; confirmar compatibilidade da versão antiga após 014 e bloqueio das escritas diretas apenas após 015.
4. **Relatório de fim de turno e participantes.** Criar registro vinculado ao equipamento/área/turno e relações de participantes, mantendo dados de atividades, pendências, programação, observações e impedimentos.<br>
   **Teste:** mecânico registra apenas conforme regra aprovada; um preenchimento inclui vários participantes; supervisor vê/cria para qualquer equipamento autorizado; isolamento entre áreas; edição/reabertura auditável.
5. **DF informada pelo cliente.** Associar valor manual de DF ao fechamento correto; registrar autoria, horário e correções sem substituir histórico.<br>
   **Teste:** verificar valor informado e versões; confirmar ausência de cálculo derivado e ausência de confusão com percentual de status da frota; validar autorização supervisor/mecânico.
6. **Atribuição e execução de agenda 125h.** Estender agenda/execução atual com identidade de responsável e RLS para consulta/execução atribuída. Preservar tabelas e registros existentes.<br>
   **Teste:** agendar, reprogramar, consultar como responsável, impedir consulta/execução de inspeção não atribuída conforme regra aprovada, concluir e confirmar limite fixo de 125h e histórico.
7. **Área autenticada do mecânico e biblioteca técnica.** Somente após aprovação do papel, integrar navegação/perfil e corrigir de forma controlada os contratos de aprovação, leitura de Storage e URLs assinadas para treinamentos, manuais e POPs.<br>
   **Teste:** ciclo de submissão/aprovação/devolução; item não aprovado inacessível; mecânico ativo acessa apenas conteúdo publicado e permitido; usuário inativo e não autorizado não obtêm metadados, objeto ou URL; verificar remoção/recuperação de objetos.
8. **Painéis, relatórios e consolidações aprovadas.** Conectar indicadores às fontes corretas; não definir consolidação mensal de DF sem regra confirmada. Remover ou marcar indisponíveis os placeholders que ainda não tiverem fonte validada.<br>
   **Teste:** amostras sintéticas em homologação, rastreio de cada valor à origem, filtros por período/área/equipamento, consistência com relatórios de turno e ausência de fórmula não aprovada.
9. **Homologação integrada e regressão.** Validar ponta a ponta por perfil e dispositivos, comparar com a produção sem escrever nela e revisar documentação.<br>
   **Teste:** desktop/mobile, erros JS, login/perfil, RLS, 125h, agenda, fechamento, DF, manutenção, manuais/POPs, dados antigos e consultas de produção somente leitura.

## 11. Riscos de regressão e controles

- **Acesso excessivo:** reaproveitar `has_operational_access` para mecânicos daria mais privilégios do que a necessidade. Criar/verificar políticas de menor privilégio e testar chamadas diretas à API, não apenas botões.
- **Perda de histórico:** sobrescrever status, DF ou manutenção eliminaria trilha operacional. Preferir registros históricos imutáveis e migrações aditivas.
- **Regressão 125h:** a constraint atual fixa `interval_hours = 125`; preservar esse ciclo e testar agendamento, execução e cálculo da próxima revisão.
- **Bloqueio de documentos:** alterar treinamento/Storage pode expor material não revisado ou impedir leitura de documentos liberados. Testar os dois lados: não publicado negado; publicado aprovado autorizado.
- **Inconsistência entre módulo e RLS:** permissões do frontend não substituem as policies. Validar papel ativo/inativo e área por acesso direto às tabelas, RPCs e Storage.
- **Duplicação e números divergentes:** OS, eventos, fechamento de turno e relatório genérico podem registrar versões diferentes da mesma intervenção. Definir qual registro é fonte de cada campo e relacionar entidades.
- **Migração de usuários existentes:** novo papel e atribuições devem preservar perfis e contas existentes; não alterar Auth nem desativar usuários por default.
- **Referência de produção não confirmada em runtime:** o repositório não confirma schema/policies remotos nem o que foi efetivamente publicado. Fazer comparação de homologação antes de qualquer DDL.
- **Demonstração antiga no HTML:** dados estáticos de exemplo na seção de produção podem ser confundidos com dados reais caso a inicialização dinâmica falhe ou demore.

## 12. Arquivos e estruturas inspecionados

- UI e orquestração: [`index.html`](../index.html), [`js/app.js`](../js/app.js), [`css/styles.css`](../css/styles.css).
- Operação e 125h: [`js/modules/operational-crud.js`](../js/modules/operational-crud.js), [`js/modules/maintenance-125h.js`](../js/modules/maintenance-125h.js), [`js/checklist-trem-forca.js`](../js/checklist-trem-forca.js), [`css/gestao-operacional.css`](../css/gestao-operacional.css), [`css/checklist-trem-forca.css`](../css/checklist-trem-forca.css).
- Auth/dados/permissões: [`js/core/supabase-adapter.js`](../js/core/supabase-adapter.js), [`js/core/permissions.js`](../js/core/permissions.js), [`api/delete-user.js`](../api/delete-user.js).
- Schema e políticas: [`001_initial_schema.sql`](../supabase/migrations/001_initial_schema.sql), [`002_private_training_storage.sql`](../supabase/migrations/002_private_training_storage.sql), [`003_training_creation_permissions.sql`](../supabase/migrations/003_training_creation_permissions.sql), [`005_complete_password_change_rpc.sql`](../supabase/migrations/005_complete_password_change_rpc.sql), [`006_role_default_permissions.sql`](../supabase/migrations/006_role_default_permissions.sql), [`008_training_storage_upload_rls.sql`](../supabase/migrations/008_training_storage_rls.sql), [`010_training_storage_rls_fix.sql`](../supabase/migrations/010_training_storage_rls_fix.sql), [`011_supervisor_area_operational_scope.sql`](../supabase/migrations/011_supervisor_area_operational_scope.sql), [`012_operational_125h_maintenance.sql`](../supabase/migrations/012_operational_125h_maintenance.sql), [`013_operational_125h_scheduling_and_horimeter_fix.sql`](../supabase/migrations/013_operational_125h_scheduling_and_horimeter_fix.sql), [`014_operational_equipment_status_and_work_order_history.sql`](../supabase/migrations/014_operational_equipment_status_and_work_order_history.sql), [`015_operational_write_guards.sql`](../supabase/migrations/015_operational_write_guards.sql).

## 13. Decisão pendente

Este relatório não autoriza implementação funcional ou estrutural. Aguardar aprovação do diagnóstico, definição dos itens operacionais ainda abertos e autorização para a próxima etapa. Não houve deploy nem alteração de produção.
