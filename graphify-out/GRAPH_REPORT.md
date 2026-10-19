# Graph Report - Lanchonete  (2026-09-05)

## Corpus Check
- 104 files · ~293,564 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 734 nodes · 1300 edges · 51 communities (35 shown, 12 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 85 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Cardapio Cliente & Carrinho
- Garcom Comandas & Mesas
- Painel Admin Core
- Rotas Clientes & Comandas
- Dependencias Producao
- Admin Catalogo CRUD
- Modal Pizza Sabores
- Config TypeScript
- Config Pix e Logo
- Paginas & Marketing
- Dependencias Dev
- Realtime Canais
- Admin Mesas e Usuarios
- API Auth Rotas
- Pedidos WhatsApp
- Config ESLint
- API Produtos Upload
- Bootstrap Servidor
- Database & Bairros
- Auth Criptografia
- Auth Cliente Fetch
- Gestao Pedidos Entrega
- Render Pizza Borda
- Auth Middleware Mesas
- Wrapper PgStatement
- Seletor Adicionais UI
- API Adicionais
- Sons Notificacao
- WhatsApp Quantidade
- Admin Adicionais Filtro
- Gerador Sons WAV
- API Categorias
- API Cron Demo
- API Motoboys
- Deploy Vercel
- Versionador Assets
- Plugin Graphify
- Branding Imagem 1
- Branding Imagem 2
- Material Marketing PDF 70x100
- Branding Preview 70x100
- Branding Imagem 70x100
- Material Marketing Folder
- Branding Folder PNG
- Branding Logo
- Material Panfleto PDF
- Branding Panfleto JPG

## God Nodes (most connected - your core abstractions)
1. `showToast()` - 50 edges
2. `escapeHtml()` - 29 edges
3. `Lanchonete / Business Management System` - 24 edges
4. `mostrarPagina()` - 17 edges
5. `mostrarToast()` - 17 edges
6. `showToast()` - 16 edges
7. `compilerOptions` - 16 edges
8. `showSection()` - 14 edges
9. `verificarResposta()` - 14 edges
10. `concluirPedido()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Image folder-1` --conceptually_related_to--> `Lanchonete / Business Management System`  [INFERRED]
  public/folder-1.jpg → public/admin.html
- `Image folder-2` --conceptually_related_to--> `Lanchonete / Business Management System`  [INFERRED]
  public/folder-2.jpg → public/admin.html
- `Image folder-70x100-preview` --conceptually_related_to--> `Lanchonete / Business Management System`  [INFERRED]
  public/folder-70x100-preview.png → public/admin.html
- `Image logo` --conceptually_related_to--> `Lanchonete / Business Management System`  [INFERRED]
  public/logo.jpeg → public/admin.html
- `Alterar Senha` --conceptually_related_to--> `Authentication & Roles`  [INFERRED]
  public/alterar-senha.html → public/admin.html

## Import Cycles
- None detected.

## Communities (51 total, 12 thin omitted)

### Community 0 - "Cardapio Cliente & Carrinho"
Cohesion: 0.07
Nodes (74): abrirProduto(), acompanharPedido(), adicionarAoCarrinho(), alterarQtd(), alterarQtdCarrinho(), alternarTipoEntrega(), aplicarLimitesDinamicos(), atualizarBotaoWhatsapp() (+66 more)

### Community 1 - "Garcom Comandas & Mesas"
Cohesion: 0.09
Nodes (46): abrirFecharComanda(), abrirListaProdutos(), abrirMesa(), abrirModalQuant(), adicionaisSelecionados, alterarQtdComanda(), alterarQuant(), aplicarLimitesGarcom() (+38 more)

### Community 2 - "Painel Admin Core"
Cohesion: 0.05
Nodes (37): abrirWhatsAppCliente(), adicionaisAdmin, allClientes, atualizarBadgeNotificacao(), atualizarBotaoLoja(), _BORDA_NOMES_SET, carregarConfigAdmin(), carregarLojaStatus() (+29 more)

### Community 3 - "Rotas Clientes & Comandas"
Cohesion: 0.06
Nodes (28): { criarValidador }, db, express, { middlewareAdmin }, rateLimit, router, validarCliente, db (+20 more)

### Community 4 - "Dependencias Producao"
Cohesion: 0.05
Nodes (36): bcryptjs, cors, dotenv, express, express-rate-limit, helmet, jsonwebtoken, multer (+28 more)

### Community 5 - "Admin Catalogo CRUD"
Cohesion: 0.09
Nodes (28): alternarProduto(), carregarBairrosAdmin(), carregarCategoriasAdmin(), carregarClientes(), carregarProdutosAdmin(), carregarRelatorioMotoboys(), carregarRelatorios(), editarBairroPrompt() (+20 more)

### Community 6 - "Modal Pizza Sabores"
Cohesion: 0.19
Nodes (26): abrir(), _adicionar(), aplicarLimiteSabores(), atualizarRodape(), cardHtml(), categoriasPizza(), classificarGrupoSabor(), contarExtrasPorTipo() (+18 more)

### Community 7 - "Config TypeScript"
Cohesion: 0.07
Nodes (27): dist, ES2022, node_modules, public, server.js, src/*, src/**/*.js, src/**/*.ts (+19 more)

### Community 8 - "Config Pix e Logo"
Cohesion: 0.10
Nodes (22): ALLOWED_EXTENSIONS_LOGO, ALLOWED_MIME_TYPES_LOGO, crc16ccitt(), { createClient }, crypto, db, express, gerarPayloadPix() (+14 more)

### Community 9 - "Paginas & Marketing"
Cohesion: 0.09
Nodes (26): admin, Authentication & Roles, Gestao Pedidos, Lanchonete / Business Management System, Painel Admin, Relatorios, Alterar Senha, Image folder-1 (+18 more)

### Community 10 - "Dependencias Dev"
Cohesion: 0.08
Nodes (25): eslint, devDependencies, eslint, supertest, @types/bcryptjs, @types/cors, @types/express, @types/jsonwebtoken (+17 more)

### Community 11 - "Realtime Canais"
Cohesion: 0.17
Nodes (21): channels, ensureTopic(), EVENTS, initRealtime(), joinAdmin(), joinGarcom(), joinMesa(), joinPedido() (+13 more)

### Community 12 - "Admin Mesas e Usuarios"
Cohesion: 0.12
Nodes (24): atualizarStatusMesa(), carregarMesasAdmin(), CarregarNomeLojaComanda(), carregarUsuariosAdmin(), copiarWebhookUrl(), editarMesaPrompt(), excluirMesa(), excluirUsuario() (+16 more)

### Community 13 - "API Auth Rotas"
Cohesion: 0.10
Nodes (15): { criarValidador }, db, express, { gerarHash, verificarSenha, gerarToken, gerarRefreshToken, verificarToken, isRefreshRevogado, revogarRefreshToken, middleware, middlewareAdmin }, rateLimit, { registrarAuditoria, AUDIT_ACTIONS }, router, SENHA_PADRAO_GARCOM (+7 more)

### Community 14 - "Pedidos WhatsApp"
Cohesion: 0.20
Nodes (18): abrirModalPedidoWhatsApp(), abrirSeletorCategorias(), adicionarItemWhatsApp(), alternarTipoWhatsApp(), carregarDadosWhatsApp(), enviarPedidoWhatsApp(), escapeHtml(), fecharModalPedidoWhatsApp() (+10 more)

### Community 15 - "Config ESLint"
Cohesion: 0.12
Nodes (16): env, es2021, node, extends, overrides, parserOptions, ecmaVersion, sourceType (+8 more)

### Community 16 - "API Produtos Upload"
Cohesion: 0.14
Nodes (14): ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES, { createClient }, crypto, db, express, getStorage(), { middlewareAdmin } (+6 more)

### Community 17 - "Bootstrap Servidor"
Cohesion: 0.16
Nodes (12): app, db, db, startServer(), buildApp(), cors, express, helmet (+4 more)

### Community 18 - "Database & Bairros"
Cohesion: 0.14
Nodes (8): db, fotosPorCategoria, dbWrapper, { Pool, types }, db, express, { middlewareAdmin }, router

### Community 19 - "Auth Criptografia"
Cohesion: 0.20
Nodes (13): bcrypt, crypto, db, gerarHash(), gerarRefreshToken(), gerarToken(), getJwtSecret(), hashToken() (+5 more)

### Community 20 - "Auth Cliente Fetch"
Cohesion: 0.28
Nodes (10): authDelete(), authFetch(), authPost(), authPut(), getPerfil(), getToken(), limparSessao(), redirecionarSemAuth() (+2 more)

### Community 21 - "Gestao Pedidos Entrega"
Cohesion: 0.18
Nodes (12): alternarMotoboy(), atribuirMotoboy(), atualizarStatus(), carregarMotoboys(), carregarPedidos(), confirmarPix(), converterParaEntrega(), editarMotoboy() (+4 more)

### Community 22 - "Render Pizza Borda"
Cohesion: 0.27
Nodes (10): _displayBordaNome(), _gerarHtmlComanda(), isBordaAdicional(), isPizzaComBordaItem(), isPizzaItemNome(), isRetiradaPedido(), itemTemBorda(), pedidoTemPizzaComBorda() (+2 more)

### Community 23 - "Auth Middleware Mesas"
Cohesion: 0.22
Nodes (8): extrairToken(), middleware(), middlewareAdmin(), middlewareGarcom(), db, express, { middlewareAdmin, middlewareGarcom }, router

### Community 25 - "Seletor Adicionais UI"
Cohesion: 0.33
Nodes (9): abrirSeletorProdutos(), atualizarBtnSelecao(), atualizarLabelCategorias(), atualizarLabelProdutos(), cancelarEdicaoAdicional(), editarAdicional(), fecharSeletorCategorias(), fecharSeletorProdutos() (+1 more)

### Community 26 - "API Adicionais"
Cohesion: 0.25
Nodes (5): db, express, { middlewareAdmin }, router, TIPOS_VALIDOS

### Community 27 - "Sons Notificacao"
Cohesion: 0.33
Nodes (6): Audio Notifications, Sound alert, Sound bell, Sound chime, Sound classic, Sound notification

### Community 28 - "WhatsApp Quantidade"
Cohesion: 0.40
Nodes (6): abrirModalWhatsAppQtd(), confirmarAddWhatsApp(), fecharModalWhatsAppQtd(), isPorPeso(), whatsappAlterarQtd(), whatsappAtualizarTotal()

### Community 29 - "Admin Adicionais Filtro"
Cohesion: 0.40
Nodes (6): atualizarFiltroProdutosAdicionais(), carregarAdicionais(), excluirAdicional(), filtrarAdicionaisAdmin(), renderizarAdicionais(), toggleAdicional()

### Community 30 - "Gerador Sons WAV"
Cohesion: 0.33
Nodes (4): fs, path, sounds, soundsDir

### Community 31 - "API Categorias"
Cohesion: 0.33
Nodes (4): db, express, { middlewareAdmin }, router

### Community 32 - "API Cron Demo"
Cohesion: 0.33
Nodes (3): db, express, router

### Community 33 - "API Motoboys"
Cohesion: 0.33
Nodes (4): db, express, { middlewareAdmin }, router

### Community 34 - "Deploy Vercel"
Cohesion: 0.33
Nodes (5): builds, crons, headers, routes, $schema

### Community 35 - "Versionador Assets"
Cohesion: 0.50
Nodes (3): dir, fs, path

## Knowledge Gaps
- **239 isolated node(s):** `root`, `node`, `es2021`, `eslint:recommended`, `ecmaVersion` (+234 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 307 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `middlewareAdmin()` connect `Auth Middleware Mesas` to `API Motoboys`, `Rotas Clientes & Comandas`, `Config Pix e Logo`, `API Auth Rotas`, `API Produtos Upload`, `Database & Bairros`, `Auth Criptografia`, `API Adicionais`, `API Categorias`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `PgStatement` connect `Wrapper PgStatement` to `Database & Bairros`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `showToast()` (e.g. with `carregarDadosWhatsApp()` and `renderProdutosWhatsApp()`) actually correct?**
  _`showToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 24 inferred relationships involving `Lanchonete / Business Management System` (e.g. with `admin` and `Gestao Pedidos`) actually correct?**
  _`Lanchonete / Business Management System` has 24 INFERRED edges - model-reasoned connections that need verification._
- **What connects `root`, `node`, `es2021` to the rest of the system?**
  _239 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Cardapio Cliente & Carrinho` be split into smaller, more focused modules?**
  _Cohesion score 0.06653683868873743 - nodes in this community are weakly interconnected._
- **Should `Garcom Comandas & Mesas` be split into smaller, more focused modules?**
  _Cohesion score 0.08780841799709724 - nodes in this community are weakly interconnected._