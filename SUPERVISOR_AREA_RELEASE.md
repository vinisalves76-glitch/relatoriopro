# Liberação do Supervisor de Área — RelatorioPro

## Escopo desta entrega

- Cargo `supervisor_area`.
- Área inicial: `arcelormittal-andradas` / **ArcelorMittal Andradas**.
- O supervisor entra diretamente no Setor Operacional.
- O menu é limitado ao Setor Operacional; Treinamentos, relatórios, agenda, usuários e ADM Master não são acessíveis por navegação.
- A criação do cargo é restrita ao ADM Master.
- A autorização por área é validada no Supabase por RLS, não apenas pela interface.

## Pré-requisito obrigatório do banco

Antes de cadastrar um supervisor, executar uma única vez o arquivo:

`supabase/migrations/011_supervisor_area_operational_scope.sql`

Projeto Supabase configurado no aplicativo: `vwvesygsudhbaqmayhsz`.

Procedimento:
1. Abrir o projeto no Supabase Dashboard.
2. Acessar SQL Editor.
3. Revisar e executar o conteúdo integral da migração.
4. Confirmar que a execução terminou sem erro.
5. Conferir a existência da área `arcelormittal-andradas` e das tabelas operacionais.

A migração é incremental, usa transação e não apaga dados existentes. Não executar novamente as migrações 001–010.

## O que o banco prepara

- Vínculo de área no perfil.
- Catálogo de áreas, com ArcelorMittal Andradas ativa.
- Tabelas de equipamentos, ordens de serviço, eventos de manutenção e leituras de horímetro.
- RLS para que o supervisor só leia e altere registros da área vinculada.
- Verificação de integridade para impedir que uma OS ou evento associe equipamento de outra área.

## Limite funcional que precisa ser respeitado

O painel de Gestão Operacional herdado da versão aprovada ainda é uma **preview demonstrativa**. Seus indicadores e equipamentos são fictícios; os botões de cadastro e OS ainda não gravam nas novas tabelas. A migração prepara a persistência e a segurança, mas não transforma automaticamente os controles demonstrativos em operações reais.

Portanto, não liberar a rotina operacional como produção até concluir a integração CRUD do painel com as tabelas acima e testar com uma conta de Supervisor de Área.

## Testes obrigatórios antes de produção

1. ADM Master cria supervisor e seleciona ArcelorMittal Andradas.
2. Supervisor autentica e é direcionado ao Setor Operacional.
3. Supervisor não acessa Treinamentos, relatórios, agenda, usuários nem ADM Master.
4. Supervisor consegue operar somente registros com `area_id = 'arcelormittal-andradas'`.
5. Tentativa de consultar ou alterar outra área é negada pelo RLS.
6. Usuários administrativos e master mantêm os acessos anteriores.
7. Validar criação, edição, exclusão e histórico de equipamentos, OS, manutenção e horímetros após integração do painel.

## Publicação

Esta branch é de teste. Não mesclar em `main` nem promover para produção antes da migração do banco, integração CRUD, validação da preview e aprovação explícita.
