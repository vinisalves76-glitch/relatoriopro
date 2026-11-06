# Instruções do GitHub Copilot

Antes de sugerir ou editar código neste repositório:

1. Leia `/AGENTS.md` e os documentos pertinentes em `/docs/`.
2. Trate `main` como produção e não faça alterações nela durante o desenvolvimento.
3. Mantenha o foco atual na operação ArcelorMittal; não introduza multi-clientes sem solicitação.
4. Preserve o ciclo de manutenção preventiva **125h**. Não o altere para 250h.
5. Use Supabase como backend atual. Não reintroduza Firebase como backend ativo.
6. Inspecione o código, migrations e políticas RLS antes de mudar banco, permissões ou autenticação.
7. Não exponha segredos nem use a chave `service_role` no navegador.
8. Não apague dados/arquivos nem faça alterações destrutivas sem autorização.
9. Teste localmente e descreva somente os testes realmente executados.
10. Nunca publique em produção nem promova alterações para `main` sem autorização explícita.

Em caso de conflito ou regra operacional incerta, interrompa a alteração e peça confirmação.
