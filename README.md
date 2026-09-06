# Doce é Ser — código completo com Supabase e PIX

Loja virtual para doces e bolos com pedidos exclusivamente para retirada. O cliente escolhe a data, paga por PIX e o pedido só aparece para a proprietária depois da confirmação automática do Mercado Pago.

## O que você controla

- código-fonte completo;
- banco PostgreSQL, autenticação e fotos no seu Supabase;
- produtos, categorias, combos, adicionais, pedidos, clientes e configurações;
- capacidade diária e antecedência mínima para encomendas;
- painel instalável da proprietária com atualização em tempo real e alarme;
- conta do cliente com histórico e códigos curtos de seis dígitos.

## 1. Preparar o Supabase

1. Em **Authentication > Users**, crie o e-mail e a senha da proprietária.
2. Abra **SQL Editor** no projeto Supabase.
3. Copie e execute todo o arquivo `supabase/schema.sql`.
4. O script cria ou atualiza tabelas, índices, políticas RLS, funções transacionais, Realtime e o bucket `product-images`.

O primeiro usuário existente quando o script é executado é registrado como proprietária. Contas adicionais precisam ser incluídas na tabela `admins`.

## 2. Variáveis do Supabase

Em **Project Settings > API**, copie a URL, a chave pública e uma chave secreta. No Vercel, cadastre:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_sua-chave-publica
SUPABASE_SECRET_KEY=sua-chave-secreta
```

`SUPABASE_SECRET_KEY` é usada apenas nas rotas do servidor para criar cobranças pendentes com segurança. Nunca use essa chave em uma variável `NEXT_PUBLIC_*` nem no navegador. A aplicação ainda aceita temporariamente `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` em projetos antigos, mas as chaves novas são preferidas.

## 3. Deixar o PIX preparado, mas desligado

Enquanto o acesso ao Mercado Pago não estiver disponível, mantenha:

```env
NEXT_PUBLIC_SITE_URL=https://doceeser.vercel.app
PIX_PAYMENT_ENABLED=false
```

Nesse estado, o cardápio e o painel continuam disponíveis, mas o botão de pagamento informa que o PIX está em configuração. Nenhum pedido sem pagamento é enviado para a proprietária.

## 4. Conectar o Mercado Pago por último

Quando recuperar a conta:

1. Acesse **Mercado Pago Developers > Suas integrações** e crie ou abra a aplicação da loja.
2. Copie o **Access Token de produção**.
3. Cadastre uma notificação do tipo **Order** apontando para `https://doceeser.vercel.app/api/payments/mercado-pago/webhook`.
4. Copie a assinatura secreta do webhook.
5. No Vercel, adicione:

```env
MERCADO_PAGO_ACCESS_TOKEN=APP_USR-seu-token
MERCADO_PAGO_WEBHOOK_SECRET=seu-segredo-do-webhook
PIX_PAYMENT_ENABLED=true
```

6. Faça um novo deploy e teste primeiro com uma compra de valor baixo.

O fluxo usa idempotência, cobrança PIX com validade de 30 minutos, validação da assinatura do webhook e conferência do valor no servidor. Uma cobrança pendente não aparece no painel, no alarme nem no histórico; somente pagamentos aprovados são liberados para produção.

## 5. Executar no computador

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev
```

Loja: `http://localhost:3000`  
Painel: `http://localhost:3000/admin`

## Toques finais no painel

1. Ajuste endereço, WhatsApp, Instagram e telefone.
2. Configure abertura, fechamento, antecedência e limite diário.
3. Revise preços, descrições, categorias, combos e adicionais.
4. Envie as fotos reais pela galeria do celular ou computador.
5. Ative o som e use **Testar novo alarme**. O toque se repete até o pedido ser aceito.
6. Use **Instalar painel** dentro da área autenticada no celular da proprietária.

## Banco de dados

| Tabela | Finalidade |
| --- | --- |
| `admins` | usuários autorizados no painel |
| `customers` | cadastro dos clientes por telefone |
| `customer_profiles` | perfil da conta do cliente |
| `categories` | categorias e ordem do cardápio |
| `products` | produtos, preços, combos, opções, fotos e disponibilidade |
| `orders` | pedido, data de retirada, pagamento e status |
| `order_items` | itens, preços congelados e adicionais do pedido |
| `store_settings` | dados, funcionamento e capacidade diária da loja |

O checkout usa `create_pix_checkout`, que valida preços, disponibilidade, opções, data e capacidade em uma única transação. O cliente não escolhe horário exato: a doceria avisa quando a encomenda estiver pronta.
