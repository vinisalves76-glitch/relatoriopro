# Política de branches — Relatório Pro

## Branches oficiais

| Branch | Finalidade | Regra |
|---|---|---|
| `main` | Produção | Somente versões aprovadas; não fazer commits diretos durante desenvolvimento. |
| `develop` | Desenvolvimento e homologação | Branch padrão de trabalho; validar localmente e em preview. |
| `feature/*` | Funcionalidades | Criar a partir de `develop`; integrar após teste. |
| `fix/*` | Correções | Criar a partir de `develop`; integrar após teste. |
| `backup/*` | Recuperação | Preservar snapshots; nunca usar como branch de trabalho. |

## Fluxo de promoção

`feature/*` ou `fix/*` → `develop` → validação → autorização explícita → `main` → produção.

A branch `main` pode estar conectada à produção na Vercel. Qualquer atualização deve ser tratada como potencial deploy de produção.

## Limpeza segura

Branches antigas não devem ser excluídas apenas por estarem atrás de `develop`. Se uma branch divergiu e contém commits exclusivos, esses commits precisam ser avaliados e preservados antes da exclusão. Backups devem ser mantidos até a validação da nova organização.
