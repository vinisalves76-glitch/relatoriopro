# Relatório de Final de Turno — implantação

## Escopo desta entrega

- Novo perfil mecanico, provisionado exclusivamente pelo Super Admin.
- Vínculo obrigatório com uma mina/área operacional.
- Mina inicial cadastrada: ArcelorMittal Andradas (arcelormittal-andradas).
- Seleção de mina carregada da tabela operational_areas; novas áreas ativas aparecem no cadastro sem alterar o código do formulário.
- Super Admin pode alterar o vínculo de mina de mecânicos e supervisores.
- Mecânico acessa somente o formulário de Relatório de Final de Turno e o histórico da mina vinculada.
- Um relatório por equipamento/TAG/data. Os demais participantes são informados no mesmo registro.
- Fila offline em IndexedDB, isolada por UID e mina, com chave idempotente e confirmação do Supabase antes de remover o item local.
- Relatórios também aparecem no histórico do equipamento por TAG para os perfis administrativos/supervisores autorizados.

## Implantação do banco

1. Confirme que a migration 011_supervisor_area_operational_scope.sql já foi aplicada.
2. Execute manualmente supabase/migrations/016_mechanic_shift_reports.sql no SQL Editor do Supabase.
3. Confirme que a migration terminou sem erros antes de criar o primeiro perfil mecânico.
4. Não execute a migration 015_operational_write_guards.sql como parte desta implantação; ela possui pré-condições próprias e não é dependência da migration 016.

A migration 016 é aditiva. Ela adiciona o perfil mecânico, a tabela de relatórios de turno, índices, validação de vínculo equipamento/mina e políticas RLS. Não foi executada pelo desenvolvimento.

## Criar um mecânico

1. Entre com o Super Admin.
2. Abra Usuários e controle de acessos.
3. Em Cargo, selecione Mecânico.
4. Informe nome, e-mail e senha inicial.
5. Em Mina / área de atuação, selecione a mina.
6. Crie o usuário. No primeiro acesso, ele deverá cadastrar uma nova senha.
7. O mecânico verá apenas o módulo de Relatório de Final de Turno.

O vínculo de área é gravado em profiles.operational_area_id. A RLS valida o mesmo vínculo no servidor; esconder opções na interface não é a única barreira de segurança.

## Fluxo offline

- O mecânico deve abrir o PWA conectado pelo menos uma vez para carregar e armazenar a lista de equipamentos da sua mina.
- O relatório é gravado primeiro no IndexedDB do dispositivo.
- Ao retornar a conexão com o aplicativo aberto, a fila tenta sincronizar automaticamente.
- Ao reabrir o PWA com conexão, a fila também tenta sincronizar.
- Um item só sai da fila depois da confirmação de gravação no Supabase.
- Se outra pessoa já registrou a mesma TAG/data, o item fica em conflito e não sobrescreve o relatório existente.
- A fila nunca envia dados de outro UID ou de outra mina com a sessão atual.

O Background Sync com o aplicativo totalmente fechado não é garantido em todos os navegadores. Nesse caso, a sincronização ocorre quando o PWA for reaberto com conexão. A autenticação offline só pode restaurar uma sessão já existente no dispositivo; o primeiro login continua exigindo conexão.

## Testes recomendados antes da liberação

1. Criar um mecânico pelo Super Admin e validar a linha de perfil com role = mecanico e operational_area_id = arcelormittal-andradas.
2. Entrar com o mecânico e confirmar que não aparecem cadastros, manutenção 125h, gestão de equipamentos ou usuários.
3. Confirmar que o mecânico consulta somente os equipamentos da mina vinculada.
4. Criar um relatório online e verificar autor, TAG, data, horímetro, participantes e condição final.
5. Tentar criar outro relatório para a mesma TAG/data e confirmar o bloqueio.
6. Desconectar a rede, criar um relatório, fechar/reabrir o PWA mantendo a sessão e verificar a permanência na fila local.
7. Reconectar e confirmar que o item só passa a sincronizado após aparecer no Supabase.
8. Testar dois mecânicos tentando registrar a mesma TAG/data offline; o segundo envio deve ficar em conflito, sem sobrescrever o primeiro.
9. Alterar a mina de um mecânico e confirmar que a sessão precisa ser renovada e que pendências antigas não são enviadas para a nova mina.
10. Entrar como supervisor/Super Admin e confirmar o relatório na linha do tempo do equipamento.

## Estado de publicação

Esta implementação está na branch de desenvolvimento feature/limpeza-gestao-operacional. Nenhuma migration foi executada no Supabase e nenhum deploy em produção foi realizado.