# Post-mortem e prevenção — loop de login / inicialização de sessão

**Projeto:** RelatorioPro (IRMEN)  
**Backend de autenticação:** Supabase Auth + tabela `profiles`  
**Arquivo principal:** `index.html`  
**Branch de trabalho:** `supabase-runtime-switch`  
**Data da análise:** 2026-11-03  
**Status:** causa adicional identificada no código e correção preventiva registrada; validação com conta real ainda pendente.

## 1. Resumo executivo

O loop de login voltou a ocorrer apesar de várias alterações anteriores. A análise do código da branch identificou um defeito concreto no caminho em que o listener de autenticação recebe `user = null`.

Esse caminho limpava a interface manualmente, mas não invalidava uma execução de `initializeUser()` que ainda estivesse aguardando uma consulta ao Supabase. Com isso, o marcador `initializingUserId` podia permanecer preso ao UID anterior. Se a mesma conta entrasse novamente, a proteção single-flight:

```js
if (initializedUserId === uid || initializingUserId === uid) return;
```

podia bloquear a nova inicialização, mesmo que a execução anterior já tivesse sido abandonada.

**Esta é uma causa de código confirmada e compatível com o sintoma recorrente.** Não é possível afirmar que seja a única causa da ocorrência reportada sem logs da sessão real e sem um teste E2E com a conta afetada.

## 2. Defeito identificado

### Antes

O listener tinha este comportamento para `user = null`:

- definia `activeUser = null`;
- definia `currentProfile = null`;
- escondia `appShell`;
- mostrava `authGate`;
- retornava sem invalidar `authInitializationRun`;
- não limpava `initializingUserId` nem `initializedUserId` por meio do fluxo central de inicialização.

Enquanto isso, `initializeUser(user)` podia estar aguardando `getDoc(profiles)`, `getDoc(model)` ou `getDocs(reports)`.

Quando a consulta antiga terminava, a checagem de UID podia interromper a execução, mas sem necessariamente liberar o marcador single-flight. Uma nova tentativa com o mesmo UID encontrava o marcador antigo e retornava imediatamente.

### Correção aplicada

O evento `user = null` agora chama:

```js
manualLoginRequested = false;
initializeUser(null);
```

O caminho central `initializeUser(null)` incrementa `authInitializationRun`, limpa `initializingUserId` e `initializedUserId`, limpa o usuário ativo e retorna a interface ao login. Assim, uma inicialização antiga não deve bloquear a tentativa seguinte.

Commit da correção: `18b240775598e15502ed5398d7e81ae04c347e21`.

## 3. Histórico de correções que não devem ser repetidas isoladamente

O histórico recente mostra várias correções feitas em camadas do mesmo fluxo:

- Remoção de handlers duplicados do formulário de login.
- Remoção da consulta paralela `getSession()` junto ao evento inicial do listener.
- Proteção single-flight por UID para evitar cargas concorrentes.
- Deduplicação de eventos de autenticação do mesmo UID.
- Despacho da inicialização para fora do callback síncrono de `onAuthStateChange`, evitando executar consultas Supabase enquanto o callback do Auth ainda está ativo.
- Alteração do tratamento de exceções para não converter falha de leitura de perfil/modelo/relatórios em logout automático.

Essas medidas tratam riscos reais, mas não substituem a invalidação correta de tarefas pendentes quando a sessão muda para null. Não reaplicar essas mesmas alterações sem primeiro reproduzir e localizar o ponto de falha.

## 4. Regras obrigatórias para futuras alterações de autenticação

1. **Um único fluxo de estado:** toda transição de sessão, inclusive `user = null`, deve passar por uma função central que invalide tarefas antigas e limpe os marcadores de inicialização.
2. **Nunca limpar somente a interface:** não alterar apenas `activeUser`, `currentProfile`, `authGate` e `appShell` sem invalidar `authInitializationRun` e limpar os marcadores single-flight.
3. **Não iniciar consultas dentro do callback de `supabase.auth.onAuthStateChange`:** o callback deve atualizar o estado mínimo e retornar; o trabalho assíncrono deve ser despachado depois que o callback terminar.
4. **Não adicionar `getSession()` em paralelo ao listener inicial sem uma justificativa testada:** o evento `INITIAL_SESSION` já fornece o estado inicial.
5. **Deduplicação não pode suprimir transições reais:** deduplicar eventos repetidos do mesmo UID, mas sempre permitir transições null → UID, UID → null e UID A → UID B.
6. **Single-flight precisa ser cancelável:** qualquer mudança de sessão deve invalidar a execução anterior; toda saída antecipada deve deixar os marcadores coerentes.
7. **Erro de dados não é logout:** erro ao ler `profiles`, configurações, modelo ou relatórios não deve chamar `signOut()` automaticamente.
8. **Perfil inexistente/inativo é uma decisão de autorização separada:** registrar o resultado real da consulta e diferenciar perfil inexistente de falha de leitura/RLS antes de encerrar a sessão.
9. **Não mascarar erro:** registrar etapa, evento Auth, UID não sensível (ou identificador truncado), nome da tabela, código e mensagem de erro. Nunca registrar access token, refresh token, senha ou chave.
10. **Não considerar Preview READY como teste funcional:** build concluído não comprova login, leitura de perfil ou navegação.

## 5. Matriz mínima de regressão antes de publicar

Executar em Preview com contas de teste reais e dados de teste controlados:

| Cenário | Resultado obrigatório |
|---|---|
| Abrir página sem sessão | Tela de login; sem inicialização de usuário |
| Login válido com perfil ativo | Entrar uma vez e carregar a área de trabalho |
| Login inválido | Mensagem de credencial; sem loop |
| Perfil inexistente | Mensagem de autorização clara; não confundir com erro de rede/RLS |
| Perfil inativo | Acesso negado de forma explícita |
| Leitura de perfil retorna erro/RLS | Diagnóstico preservado; não tratar como logout silencioso |
| Evento null enquanto consulta de perfil está pendente | Execução anterior invalidada e marcadores limpos |
| Sair e entrar novamente com o mesmo usuário | Segundo login inicializa normalmente |
| Alternar usuário A → sair → usuário B | Nenhum dado/cache do usuário A aparece para B |
| TOKEN_REFRESHED para o mesmo UID | Não reinicializar toda a aplicação |
| Falha ao carregar modelo/relatórios | Sessão mantida e erro identificado por etapa |
| Atualizar a página com sessão válida | Restaurar uma única vez, sem duplicidade |

**Critério de aceite:** todos os cenários aplicáveis passam; logs não mostram inicializações simultâneas para o mesmo UID nem execução antiga alterando a interface depois de uma mudança de sessão.

## 6. Procedimento obrigatório de diagnóstico quando voltar a ocorrer

Coletar antes de modificar o código:

- evento emitido pelo Supabase Auth (`INITIAL_SESSION`, `SIGNED_IN`, `TOKEN_REFRESHED`, `SIGNED_OUT`);
- presença/ausência de usuário em cada evento;
- início e fim de cada `initializeUser`, número da execução e UID truncado;
- etapa atual: perfil, modelo, relatórios ou outra;
- resultado de `profiles.maybeSingle()`: linha encontrada, nenhuma linha ou erro;
- código e mensagem de erro Supabase/PostgREST;
- chamadas de `signOut()` e motivo;
- versão/commit exato da Preview testada.

Nunca solicitar senha, tokens ou chaves. Se necessário, pedir captura da mensagem visível e logs com dados sensíveis removidos.

## 7. Estado desta correção

- [x] Defeito no caminho `user = null` identificado no código.
- [x] Listener alterado para chamar `initializeUser(null)` e invalidar a execução anterior.
- [x] Regra e histórico documentados neste arquivo.
- [ ] Fazer revisão estática e validar sintaxe/build.
- [ ] Criar Preview do commit que contém a correção.
- [ ] Testar login, logout e novo login com a conta afetada.
- [ ] Confirmar que a regressão não ocorre mais.

**Atenção:** não declarar o problema resolvido antes de completar os testes pendentes. Não promover para produção sem autorização expressa.


## 8. Comparação direta: produção funcional × desenvolvimento

Comparação realizada em 2026-11-03 entre:

- Produção: `1a5f2590c712e5b7e44d06520692bd600f818503`.
- Desenvolvimento: branch `supabase-runtime-switch`.

### O que permaneceu igual

- URL e chave pública do mesmo projeto Supabase.
- Criação do cliente principal com `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`.
- Cliente separado de criação de usuário com persistência desativada.
- `normalizeUser()`.
- `signInWithEmailAndPassword()`, que chama `supabase.auth.signInWithPassword()`.
- Consulta de perfil via `getDoc(doc(db,'userProfiles',uid))`, traduzida para `profiles.select('*').eq('id',uid).maybeSingle()`.
- Handler de submit do formulário de login.

### Diferenças relevantes encontradas

**A. Listener de autenticação**

Produção chama `callback(currentSupabaseUser)` diretamente dentro do callback de `supabase.auth.onAuthStateChange`.

Desenvolvimento passou a:
- deduplicar eventos apenas pelo UID;
- descartar eventos sucessivos quando o UID não muda;
- agendar o callback com `setTimeout(...,0)`.

Essa mudança altera a ordem e o tratamento dos eventos de autenticação. É uma diferença de comportamento relevante e deve ser isolada em teste A/B controlado. A implementação da produção é a referência conhecida como funcional, mas executar consultas assíncronas dentro do callback do Supabase pode contrariar a recomendação do SDK e provocar deadlock. Portanto, não copiar cegamente sem teste.

**B. Novo controle single-flight em initializeUser**

Desenvolvimento adicionou:
```js
if (initializedUserId === uid || initializingUserId === uid) return;
```

Também adicionou contador de execução e verificações de UID para invalidar tarefas antigas. Produção não possui esse bloqueio.

**C. Saída antecipada sem liberar o bloqueio**

No desenvolvimento, existe o caminho:
```js
if(currentProfile.mustChangePassword){
  $('authGate').hidden=true;
  $('appShell').hidden=true;
  $('changePasswordGate').hidden=false;
  return;
}
```

Esse retorno ocorre antes de:
```js
if(run===authInitializationRun){
  initializedUserId=uid;
  initializingUserId=null;
}
```

Consequência confirmada por inspeção estática: `initializingUserId` permanece com o UID. Após a troca obrigatória de senha, o código chama `initializeUser(auth.currentUser)` novamente, mas a proteção single-flight pode retornar imediatamente por encontrar o mesmo UID ainda marcado como inicializando. Isso pode impedir a conclusão do fluxo após a troca de senha.

**D. Tratamento de falhas**

Produção mostra novamente o login em qualquer erro capturado na inicialização. Desenvolvimento mantém a sessão e mostra uma tela `startupErrorGate`. Essa diferença muda a apresentação do erro, mas não prova que seja a causa do login não avançar.

### Conclusão da comparação

A autenticação primária (credenciais e cliente Supabase) não apresenta diferença textual relevante. As mudanças de maior risco estão no listener de eventos e no novo estado single-flight de `initializeUser`.

O defeito do caminho `mustChangePassword` está confirmado, mas só explica a falha quando a conta passa por esse caminho. Para o login normal, a principal suspeita a testar é a interação entre deduplicação por UID, agendamento com `setTimeout` e o controle single-flight.

### Próxima investigação recomendada — sem tocar em produção

1. Reproduzir com a mesma conta de teste na Preview e verificar se `mustChangePassword` está ativo no perfil.
2. Registrar eventos Auth com nome do evento e UID truncado, sem tokens.
3. Registrar entrada/saída de `initializeUser`, valor de `authInitializationRun`, `initializingUserId` e resultado da leitura de `profiles`.
4. Em Preview isolada, testar uma alteração por vez: primeiro corrigir a liberação do single-flight no caminho `mustChangePassword`; depois comparar o listener com a implementação de produção.
5. Não promover qualquer mudança para produção sem autorização expressa e sem teste funcional com a conta afetada.
