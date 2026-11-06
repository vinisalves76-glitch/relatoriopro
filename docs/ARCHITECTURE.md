# Arquitetura do RelatorioPro

## Objetivo

Evoluir o RelatorioPro de uma aplicação HTML/JavaScript com módulos parcialmente separados para uma arquitetura modular por domínio, preservando o comportamento da versão de produção.

## Base de referência

- Repositório: `vinisalves76-glitch/relatoriopro`
- Base desta reorganização: branch `restore/gestao-operacional-manutencao-125h`
- Commit-base: `6397bc400eac75ff31d4fcdc09110d7a7cc9a351`
- Branch de trabalho: `refactor/architecture-baseline`

A branch `main` não deve ser considerada automaticamente a fonte de verdade funcional. A versão publicada em produção é a referência para esta reorganização.

## Estado atual observado

A aplicação já possui uma separação inicial:

- `index.html`: estrutura da interface e pontos de montagem dos módulos.
- `css/`: estilos globais e estilos por área.
- `js/app.js`: inicialização e grande parte da lógica da aplicação; arquivo ainda concentrado.
- `js/core/`: adaptador Supabase e permissões.
- `js/modules/`: módulos operacionais e manutenção de 125 horas.
- `js/shared/`: utilitários compartilhados.
- `api/`: funções serverless.
- `supabase/migrations/`: histórico versionado do banco.
- `firestore.rules`: arquivo legado; verificar dependência antes de qualquer remoção.

## Estrutura-alvo proposta

A estrutura abaixo é o destino planejado. Ela deve ser alcançada gradualmente, sem mover ou renomear arquivos de uma só vez.

```text
/
├── index.html
├── package.json
├── vercel.json
├── assets/
│   ├── images/
│   ├── video/
│   └── brand/
├── css/
│   ├── base/
│   ├── components/
│   ├── pages/
│   └── modules/
├── js/
│   ├── app.js
│   ├── core/
│   │   ├── auth/
│   │   ├── permissions/
│   │   ├── data/
│   │   └── config/
│   ├── shared/
│   │   ├── dom/
│   │   ├── format/
│   │   └── validation/
│   ├── services/
│   │   ├── reports/
│   │   ├── trainings/
│   │   ├── agenda/
│   │   └── users/
│   ├── modules/
│   │   ├── reports/
│   │   ├── trainings/
│   │   ├── agenda/
│   │   ├── users/
│   │   └── operations/
│   └── ui/
│       ├── components/
│       └── layout/
├── api/
├── supabase/
│   └── migrations/
├── docs/
└── tests/
```

## Responsabilidades dos módulos

- **Core:** autenticação, sessão, autorização, configuração e acesso ao Supabase.
- **Services:** operações de dados e regras de negócio; não devem manipular diretamente a interface.
- **Modules:** inicialização e coordenação de cada área funcional.
- **UI:** componentes visuais reutilizáveis, modais, notificações e navegação.
- **Shared:** funções puras e utilitários sem dependência de páginas.
- **API:** integrações server-side; segredos nunca devem ser colocados no navegador.
- **Migrations:** alterações de banco sempre incrementais e versionadas.

## Ordem recomendada de refatoração

1. Registrar a versão de produção como baseline e manter esta branch isolada.
2. Mapear eventos, inicialização, estado global e dependências existentes em `js/app.js`.
3. Extrair utilitários puros e componentes compartilhados, sem alterar regras de negócio.
4. Separar os domínios de relatórios, treinamentos, agenda e usuários.
5. Separar autenticação/permissões dos controladores de tela.
6. Organizar CSS por domínio e componentes, mantendo a ordem de carregamento.
7. Criar testes de regressão para autenticação, permissões, relatórios, treinamentos, agenda e gestão operacional.
8. Validar build, navegação e persistência em Preview antes de qualquer promoção.

## Regras obrigatórias de segurança e compatibilidade

- Não alterar o projeto Supabase, tabelas, políticas RLS, migrations ou variáveis de ambiente durante uma simples refatoração de arquivos.
- Não expor chaves secretas no frontend.
- Preservar o comportamento de todos os perfis e suas permissões.
- Não remover código legado sem provar que não há referências ou dependências.
- Não misturar dados reais com dados de demonstração.
- Não alterar nomes de IDs HTML usados pelo JavaScript sem atualizar todas as referências.
- Não alterar rotas, contratos de API ou formatos persistidos sem migração compatível.
- Manter a versão de produção intacta até que a versão refatorada seja validada.

## Critérios de conclusão

A reorganização só será considerada concluída quando:

- Cada domínio tiver responsabilidades e interfaces claras.
- `js/app.js` atuar principalmente como ponto de entrada/orquestrador.
- Não houver dependências circulares.
- Os fluxos críticos forem testados.
- O Preview passar por validação funcional.
- A produção continuar inalterada até autorização explícita de publicação.
