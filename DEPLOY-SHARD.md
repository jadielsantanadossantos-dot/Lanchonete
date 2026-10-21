# Deploy no Shard Cloud (Nova Aplicação)

Este documento resume o que já foi feito no banco e o passo a passo para colocar o sistema no ar na Shard Cloud.

## 1. O que já está pronto

- Banco PostgreSQL da Shard (`postgres.sharddatabases.app`, banco ativo **`lanchonete_db`**) com:
  - schema completo (migrations aplicadas);
  - clone integral do Supabase: **3.478 pedidos, 992 clientes, 1.082 comandas, 86 produtos, 163 adicionais, 5 usuários, configurações, bairros e motoboys**;
  - sequences ajustadas e contagens conferidas.
- O banco `/database` existe no mesmo servidor e tem o mesmo clone, mas é uma cópia anterior. **Não use `/database` no deploy**; o `.env` e o `.env.shard` apontam para `/lanchonete_db`.
- 64 imagens de produtos migradas do Supabase Storage para `public/uploads/migrados` em **WebP** (76,4 MB → 8,1 MB) e URLs do banco ativo atualizadas.
- Realtime migrado de Supabase Broadcast para **Socket.io** (salas `admin`, `garcom`, `mesa-*`, `pedido-*`, com JWT para admin/garçom).
- Uploads de produtos/logo agora vão para **disco local** (`UPLOADS_DIR`, padrão `public/uploads`).
- Sessão do admin/garçom corrigida para não deslogar ao atualizar a página ou abrir nova aba.
- Arquivos de deploy: `.shardcloud`, `Dockerfile`, `.dockerignore`, `.shardignore`.
- `.env.shard` gerado localmente com `DATABASE_URL`, `SHARD_SSL`, `JWT_SECRET` e `CRON_SECRET` (não versionado).

> **Importante:** o arquivo `.env.shard` contém segredos. Ele está no `.gitignore`; não envie esse arquivo para o GitHub.

## 2. Antes de subir: GitHub

O repositório já foi limpo (o token antigo que estava embutido na URL do `git remote` foi removido). Se você ainda não revogou esse token no GitHub, revogue agora em **Settings → Developer settings → Personal access tokens**.

Para deploy via Git, faça commit e push das alterações:

```powershell
git add .
git commit -m "Prepara deploy no Shard Cloud: Socket.io, uploads locais e imagens migradas"
git push origin main
```

O Push pode pedir credenciais. Use o Git Credential Manager ou um token novo — nunca deixe o token na URL do remote.

## 3. Criar a aplicação no Shard Cloud

No painel: **Aplicações → Nova Aplicação**.

### Opção A — Git (recomendada)

1. Conecte sua conta GitHub em **Config → Integrations**.
2. Selecione o repositório `jadielsantanadossantos-dot/Lanchonete`.
3. Branch: `main`.
4. O Shard lê o arquivo `.shardcloud` da raiz:
   - `LANGUAGE=node`
   - `MEMORY=512` (mínimo para site; se o plano permitir, use 1024)
   - `VERSION=recommended`
   - `SUBDOMAIN=andersonlanches` (troque se já estiver em uso)
   - `CUSTOM_COMMAND=PORT=80 npm start`
5. Ative **Acesso web público** (Enable public web access). Isso exige pelo menos 512 MB.
6. Se o painel pedir a porta, use **80**.

### Opção B — ZIP

1. Gere um ZIP da pasta do projeto **sem** `node_modules`, `.git`, `.env`, `.env.shard`, `tests`, `android`, `app/build`, `twa-manifest.json` e `public/uploads/produtos`.
2. **Inclua** `public/uploads/migrados` (8 MB de imagens).
3. Inclua `.shardcloud`, `package.json`, `package-lock.json`, `server.js`, `src/`, `public/`, `api/`.
4. Envie em **Nova Aplicação → Upload ZIP**.
5. Se o ZIP passar de 100 MB, use Git ou remova arquivos não usados.

## 4. Variáveis de ambiente

No painel da aplicação, em **Environment Variables**, cadastre:

| Chave | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `80` |
| `TZ` | `America/Sao_Paulo` |
| `TRUST_PROXY` | `1` |
| `CORS_ORIGIN` | `https://andersonlanches.shardweb.app` (ajuste para o subdomínio/domínio real) |
| `DATABASE_URL` | copie de `.env.shard` (já aponta para `/lanchonete_db`) |
| `SHARD_SSL` | `true` (o `.env.shard` já inclui; mantenha igual) |
| `JWT_SECRET` | copie de `.env.shard` (64 caracteres) |
| `CRON_SECRET` | copie de `.env.shard` |
| `UPLOADS_DIR` | `public/uploads` |

Comandos para copiar os valores sem exibi-los no terminal:

```powershell
# DATABASE_URL
(Get-Content .env.shard | Where-Object { $_ -like 'DATABASE_URL=*' }) -replace '^DATABASE_URL=', '' | Set-Clipboard

# SHARD_SSL
(Get-Content .env.shard | Where-Object { $_ -like 'SHARD_SSL=*' }) -replace '^SHARD_SSL=', '' | Set-Clipboard

# JWT_SECRET
(Get-Content .env.shard | Where-Object { $_ -like 'JWT_SECRET=*' }) -replace '^JWT_SECRET=', '' | Set-Clipboard

# CRON_SECRET
(Get-Content .env.shard | Where-Object { $_ -like 'CRON_SECRET=*' }) -replace '^CRON_SECRET=', '' | Set-Clipboard
```

> Não configure `SUPABASE_*` no novo ambiente. O realtime usa Socket.io e as imagens antigas já foram migradas para o disco local.

## 5. Primeiro deploy e validação

1. Faça o deploy e acompanhe os **Logs**.
2. Confirme que o processo escutou na porta 80 e que `GET /health` responde:
   ```text
   https://andersonlanches.shardweb.app/health
   ```
3. Abra:
   - Site: `https://andersonlanches.shardweb.app/`
   - Admin: `https://andersonlanches.shardweb.app/login-admin`
   - Garçom: `https://andersonlanches.shardweb.app/login-garcom`
4. Os usuários e senhas foram clonados do Supabase. Use o login de admin que você já usava.
5. No admin, confira:
   - cardápio com fotos;
   - pedidos históricos;
   - configurações da loja (a loja foi clonada como **fechada**; abra quando estiver pronto).
6. Teste o realtime: abra o admin e o garçom em dispositivos/abas diferentes e faça um pedido de teste. As notificações devem chegar sem recarregar.
7. Teste upload: troque a logo ou a foto de um produto. A imagem deve ir para `/uploads/...`.

## 6. Cron de limpeza

A Shard não executa os `crons` do `vercel.json`. Configure um agendador externo (cron-job.org, GitHub Actions ou uma VPS) para chamar diariamente:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://andersonlanches.shardweb.app/api/cron/cleanup
```

Sem `CRON_SECRET`, a rota responde `401` em produção. O `reset-demo` não é necessário neste ambiente.

## 7. Domínio próprio e HTTPS

1. No painel da aplicação, adicione o domínio (ex.: `pedidos.sualanchonete.com.br`).
2. Aponte o DNS conforme o Shard indicar (CNAME).
3. Aguarde o certificado SSL automático.
4. Atualize `CORS_ORIGIN` para o domínio final e faça um novo deploy.
5. Atualize o `SUBDOMAIN` no `.shardcloud` somente se for usar o subdomínio `*.shardweb.app`.

## 8. Uploads: persistência

O código salva em `public/uploads` (ou em `UPLOADS_DIR`). A Shard informa 10 GB de storage por aplicação, mas **confirme a persistência após um redeploy**:

1. Envie uma logo/foto de teste.
2. Faça um redeploy (Git push ou botão Redeploy).
3. Verifique se a imagem continua acessível.

Se as imagens sumirem no redeploy, existem três caminhos:

- usar um volume persistente da Shard (se disponível no seu plano);
- usar o CDN da Shard para uploads;
- rodar em uma VPS com Docker e volume (`docker-compose` com volume em `/app/public/uploads`).

As 64 imagens antigas estão versionadas em `public/uploads/migrados`, então elas sobrevivem a qualquer redeploy. O risco é apenas para uploads novos.

## 9. Segurança e backup

### 9.1 Ação urgente: rotacionar as senhas de banco

Os arquivos locais `.env`, `.env.shard`, `.env.demo`, `.env.local` e `.env.vercel` usam **a mesma senha de banco (12 caracteres) no Shard e no Supabase**. Essa senha já esteve em scripts locais e deve ser considerada comprometida.

Procedimento:

1. **Shard:** abra o banco `lanchonete_db` → **Reset password** (ou equivalente). Gere uma senha longa e aleatória (32+ caracteres).
2. Atualize `DATABASE_URL` no `.env` e no `.env.shard` com a nova senha.
3. Atualize a variável `DATABASE_URL` na aplicação do Shard e faça redeploy.
4. **Supabase:** se for manter o projeto como backup, troque a senha em **Settings → Database → Reset database password**. Se for desativar, ignore esta etapa.
5. Não reutilize a mesma senha entre Shard, Supabase, GitHub ou e-mail.
6. Se ainda existir o usuário antigo `9f710969...` no Shard (credencial que estava no script `migrate-supabase-to-shard.js`), remova-o ou rotacione a senha dele também.

> O script `scripts/migrate-supabase-to-shard.js` foi descontinuado e não contém mais credenciais. O remote do Git foi limpo, mas a rotação acima é necessária porque a senha circulou localmente.

### 9.2 Outros itens

- Ative **Backups automáticos** do banco no painel da Shard (aba Backups).
- Não versione `.env`, `.env.shard`, `android.keystore` ou `*.jks` (já estão no `.gitignore`).
- Revogue o token GitHub antigo que estava embutido na URL do remote.
- Mantenha o projeto Supabase antigo apenas como backup de leitura até validar o novo ambiente. Pedidos criados após o corte não existirão nele.

## 10. Rollback

Se precisar voltar ao Supabase:

1. No painel da Shard, altere `DATABASE_URL` para a connection string do Supabase (painel do Supabase → **Settings → Database → Connection string**). O `.env` atual não guarda mais `SUPABASE_DB_URL`.
2. Remova o `JWT_SECRET` ou use o mesmo segredo do ambiente antigo para os tokens continuarem válidos.
3. Faça redeploy.

O código atual continua compatível com PostgreSQL/Supabase. O realtime, porém, usa Socket.io; no Supabase/Vercel ele cai no polling (o fallback de broadcast existe, mas o cliente atual é Socket.io).

## 11. Comandos úteis

```powershell
# Conferir o schema/dados do banco novo
node scripts/preparar-shard.js --migrate

# Reclonar tudo do Supabase (CUIDADO: limpa o banco ativo /lanchonete_db)
# Requer SUPABASE_DB_URL no .env; faça backup antes de rodar.
node scripts/preparar-shard.js --clone --yes

# Migrar imagens restantes do Supabase
node scripts/migrar-imagens.js

# Rodar localmente contra o banco da Shard
npm start

# Testes e lint
npm test
npx eslint src api server.js
```

## 12. Checklist final

- [ ] Deploy concluído e logs sem erro
- [ ] `/health` respondendo
- [ ] Login admin funcionando
- [ ] Cardápio e fotos carregando
- [ ] Pedido de teste no site
- [ ] Notificação em tempo real no admin/garçom
- [ ] Upload de imagem funcionando
- [ ] Loja aberta no admin
- [ ] Backups do banco ativados
- [ ] Cron de limpeza agendado
- [ ] Domínio/SSL configurado
- [ ] Token GitHub antigo revogado
- [ ] Teste de persistência de upload após redeploy
