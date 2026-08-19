DO $$ BEGIN
 CREATE TYPE "forma_pagamento" AS ENUM('pix', 'dinheiro', 'cartao', 'mesa');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "pedido_status" AS ENUM('recebido', 'em_preparo', 'saiu_entrega', 'entregue', 'cancelado');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "mesa_status" AS ENUM('livre', 'ocupada', 'reservada');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "comanda_status" AS ENUM('aberta', 'fechada');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "usuario_perfil" AS ENUM('admin', 'garcom');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "notificacao_tipo" AS ENUM('novo_pedido', 'pedido_atualizado', 'pix_confirmado', 'comanda_atualizada', 'mesa_atualizada', 'sistema');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categorias_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "produtos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"categoria_id" integer NOT NULL,
	"descricao" text,
	"preco" numeric(10, 2) NOT NULL,
	"foto" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adicionais" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"preco" numeric(10, 2) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "produto_adicionais" (
	"produto_id" integer NOT NULL,
	"adicional_id" integer NOT NULL,
	CONSTRAINT "produto_adicionais_produto_id_adicional_id_pk" PRIMARY KEY("produto_id","adicional_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clientes" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"telefone" text NOT NULL,
	"rua" text,
	"numero" text,
	"bairro" text,
	"complemento" text,
	"ponto_referencia" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clientes_telefone_unique" UNIQUE("telefone")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bairros" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"taxa_entrega" numeric(10, 2) DEFAULT '0' NOT NULL,
	"atendido" boolean DEFAULT true NOT NULL,
	CONSTRAINT "bairros_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pedido_item_adicionais" (
	"id" serial PRIMARY KEY NOT NULL,
	"pedido_item_id" integer NOT NULL,
	"adicional_nome" text NOT NULL,
	"preco" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pedido_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"pedido_id" integer NOT NULL,
	"produto_id" integer NOT NULL,
	"produto_nome" text NOT NULL,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"preco_unitario" numeric(10, 2) NOT NULL,
	"observacao" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pedidos" (
	"id" serial PRIMARY KEY NOT NULL,
	"cliente_id" integer NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"taxa_entrega" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"forma_pagamento" "forma_pagamento" NOT NULL,
	"status" "pedido_status" DEFAULT 'recebido' NOT NULL,
	"pix_confirmado" boolean DEFAULT false NOT NULL,
	"observacoes" text,
	"endereco_entrega" text,
	"bairro_entrega" text,
	"mesa_id" integer,
	"comanda_id" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mesas" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" integer NOT NULL,
	"nome" text,
	"capacidade" integer DEFAULT 4 NOT NULL,
	"status" "mesa_status" DEFAULT 'livre' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mesas_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comanda_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"comanda_id" integer NOT NULL,
	"produto_id" integer NOT NULL,
	"produto_nome" text NOT NULL,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"preco_unitario" numeric(10, 2) NOT NULL,
	"observacao" text,
	"adicionais_json" jsonb,
	"enviado_cozinha" boolean DEFAULT false NOT NULL,
	"pedido_item_id" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comandas" (
	"id" serial PRIMARY KEY NOT NULL,
	"mesa_id" integer NOT NULL,
	"cliente_nome" text,
	"status" "comanda_status" DEFAULT 'aberta' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"fechada_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "configuracoes" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer,
	"usuario_nome" text,
	"acao" text NOT NULL,
	"detalhes" jsonb,
	"ip" text,
	"user_agent" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"usuario" text NOT NULL,
	"senha_hash" text NOT NULL,
	"perfil" "usuario_perfil" DEFAULT 'garcom' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"trocar_senha" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_usuario_unique" UNIQUE("usuario")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notificacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" "notificacao_tipo" NOT NULL,
	"payload" jsonb NOT NULL,
	"lida" boolean DEFAULT false NOT NULL,
	"usuario_id" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "produto_adicionais" ADD CONSTRAINT "produto_adicionais_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "produto_adicionais" ADD CONSTRAINT "produto_adicionais_adicional_id_adicionais_id_fk" FOREIGN KEY ("adicional_id") REFERENCES "adicionais"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pedido_item_adicionais" ADD CONSTRAINT "pedido_item_adicionais_pedido_item_id_pedido_itens_id_fk" FOREIGN KEY ("pedido_item_id") REFERENCES "pedido_itens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_mesa_id_mesas_id_fk" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_comanda_id_comandas_id_fk" FOREIGN KEY ("comanda_id") REFERENCES "comandas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comanda_itens" ADD CONSTRAINT "comanda_itens_comanda_id_comandas_id_fk" FOREIGN KEY ("comanda_id") REFERENCES "comandas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comanda_itens" ADD CONSTRAINT "comanda_itens_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comanda_itens" ADD CONSTRAINT "comanda_itens_pedido_item_id_pedido_itens_id_fk" FOREIGN KEY ("pedido_item_id") REFERENCES "pedido_itens"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comandas" ADD CONSTRAINT "comandas_mesa_id_mesas_id_fk" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
