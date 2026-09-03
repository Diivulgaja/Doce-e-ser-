# Doce é Ser — código completo com Supabase

Loja virtual para doces e bolos com pedidos exclusivamente para retirada. Esta versão usa Next.js e Supabase e pode ser executada no computador ou publicada em serviços compatíveis com Next.js.

## O que você controla

- código-fonte completo;
- banco PostgreSQL no seu Supabase;
- usuários e senhas do painel pelo Supabase Auth;
- fotos dos produtos pelo Supabase Storage;
- produtos, categorias, pedidos, clientes e configurações;
- regras de horários, capacidade por faixa de retirada e tempo de preparo.

## 1. Criar o Supabase

1. Crie uma conta em https://supabase.com e um novo projeto.
2. No projeto, abra **SQL Editor**.
3. Abra o arquivo `supabase/schema.sql` deste projeto, copie todo o conteúdo e execute no SQL Editor.
4. O script cria as tabelas, regras de segurança, cardápio inicial, função transacional de pedidos, atualização em tempo real e o armazenamento `product-images`.

## 2. Criar o administrador

1. No Supabase, abra **Authentication > Users**.
2. Clique em **Add user** e crie o e-mail e a senha da pessoa que administrará a loja.
3. Guarde o mesmo e-mail para a variável `BOOTSTRAP_ADMIN_EMAIL`.
4. No primeiro login em `/admin`, esse usuário será registrado como administrador. Depois disso, apenas usuários presentes na tabela `admins` terão acesso.

## 3. Configurar as chaves

No Supabase, abra **Project Settings > API** e copie:

- Project URL;
- chave pública `anon`/`publishable`;
- chave secreta `service_role`.

Duplique `.env.example`, renomeie a cópia para `.env.local` e preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-publica
SUPABASE_SERVICE_ROLE_KEY=sua-chave-secreta
BOOTSTRAP_ADMIN_EMAIL=seu-email@exemplo.com
```

Nunca publique ou envie a chave `SUPABASE_SERVICE_ROLE_KEY`. O arquivo `.env.local` já está ignorado pelo Git.

## 4. Executar no computador

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. O painel fica em `http://localhost:3000/admin`.

## 5. Toques finais no painel

Depois de entrar em `/admin`:

1. ajuste endereço, WhatsApp, Instagram e telefone;
2. configure abertura, fechamento, intervalo, limite e tempo de preparo;
3. revise preços, descrições e categorias;
4. envie as fotos reais pela galeria do celular ou computador;
5. ative o som e use **Testar alarme**.

## Banco de dados

| Tabela | Finalidade |
| --- | --- |
| `admins` | usuários autorizados no painel |
| `customers` | cadastro automático dos clientes por telefone |
| `categories` | categorias e ordem do cardápio |
| `products` | produtos, preços, opções, fotos e estoque |
| `orders` | pedidos, retirada, pagamento e status |
| `order_items` | itens e adicionais de cada pedido |
| `store_settings` | dados, horários e regras da loja |

O fechamento do pedido usa a função `create_pickup_order`, que valida produtos, horário, antecedência e limite por faixa antes de gravar tudo em uma única transação.

## Publicação futura

O projeto está pronto para uma hospedagem compatível com Next.js. Cadastre as mesmas quatro variáveis de ambiente na hospedagem antes de publicar. O banco e as fotos continuam na sua conta Supabase.
