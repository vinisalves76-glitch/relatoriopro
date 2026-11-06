# Desenvolvimento e validação

## Preparação

1. Abra a pasta raiz do repositório no VS Code.
2. Leia `AGENTS.md`, `README.md` e os documentos relacionados em `docs/`.
3. Confira `git status`, branch atual e sincronização com o remoto.
4. Confirme os arquivos de ambiente necessários sem copiar segredos para o repositório.
5. Inspecione os módulos e dependências diretamente relacionados à tarefa.

## Execução local

O repositório contém uma interface web e funções de API. Para inspeção visual simples da interface estática, pode-se iniciar um servidor local na raiz:

```bash
python -m http.server 4173
```

Acesse `http://localhost:4173`. Esse servidor estático **não executa** as funções serverless de `api/` nem substitui a autenticação, o banco ou o Storage do Supabase. Para validar fluxos que dependem dessas partes, use o ambiente local adequado e credenciais de desenvolvimento, sem apontar testes destrutivos para produção.

O `package.json` verificado declara a dependência do Supabase JS, mas não declara scripts de build, lint ou teste. Não presuma que `npm test`, `npm run build` ou outro comando exista: confira o arquivo antes de executar e informe com precisão quais verificações foram feitas.

## Estratégia de testes

- Reproduzir o problema antes de alterar.
- Testar o caminho principal e os estados de erro relevantes.
- Validar permissões com perfis apropriados, não apenas com a conta mestre.
- Para mudanças em banco, validar migrations e RLS em ambiente não produtivo.
- Para mudanças de interface, verificar layout responsivo e console do navegador.
- Para mudanças em API, validar autenticação, autorização, entradas inválidas e erros.
- Não declarar testes como aprovados se não foram executados.

## Organização das alterações

- Uma tarefa por conjunto de commits.
- Evitar refatorações amplas junto com correções pontuais.
- Atualizar a documentação quando uma regra, arquitetura ou procedimento mudar.
- Não incluir arquivos temporários, dados reais, credenciais ou artefatos de build sem necessidade.
