# Assinaturas Stripe → licenças automáticas

Quando um cliente paga pelo Stripe, um webhook cria uma licença (o mesmo
documento `licenses/{chave}` que o app já ativa) e envia a chave por e-mail.
Clientes de cortesia continuam recebendo a licença manualmente pela página
`/license-admin` — nada muda ali.

## 1. Produto e preços no Stripe

1. No painel do Stripe, crie **um produto** ("Halex Istar CRM").
2. Adicione **dois preços recorrentes**: um **mensal** e um **anual**.
3. Copie os dois **Price IDs** (começam com `price_...`).

## 2. Configuração não-secreta (`functions/.env`)

Adicione ao arquivo `functions/.env` (ele já existe e é ignorado pelo git):

```
STRIPE_PRICE_MONTHLY=price_xxxxxxxxxxxx
STRIPE_PRICE_ANNUAL=price_yyyyyyyyyyyy
APP_PUBLIC_URL=https://halex-istar-crm.web.app
```

`APP_PUBLIC_URL` é onde ficam as páginas de sucesso/cancelamento (Firebase
Hosting deste projeto). Se usar outro domínio, ajuste aqui.

## 3. Segredos (Secret Manager)

Defina cada um com `firebase functions:secrets:set NOME` (como você já fez com
`LICENSE_SIGNING_KEY`):

- `STRIPE_SECRET_KEY` — a chave secreta da API (`sk_live_...` ou `sk_test_...`).
- `STRIPE_WEBHOOK_SECRET` — o segredo de assinatura do webhook (passo 5, `whsec_...`).
- `LICENSE_EMAIL_USER` — o Gmail que envia a chave (ex.: `licencas@suaempresa.com`).
- `LICENSE_EMAIL_PASSWORD` — uma **senha de app** do Gmail (não a senha normal).
  Gere em: Conta Google → Segurança → Verificação em duas etapas → Senhas de app.

Se você não definir os dois `LICENSE_EMAIL_*`, o e-mail é simplesmente pulado e
o cliente ainda recebe a chave na página de sucesso.

## 4. Deploy

```
firebase deploy --only functions,hosting
```

Anote a URL impressa para a função **stripeWebhook** (algo como
`https://southamerica-east1-halex-istar-crm.cloudfunctions.net/stripeWebhook`).

## 5. Webhook no Stripe

1. Painel do Stripe → **Developers → Webhooks → Add endpoint**.
2. URL = a URL do `stripeWebhook` do passo 4.
3. Selecione os eventos:
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Salve, copie o **Signing secret** (`whsec_...`) e defina-o como
   `STRIPE_WEBHOOK_SECRET` (passo 3). Faça `firebase deploy --only functions`
   novamente para o novo segredo entrar em vigor.

## 6. Teste (modo de teste do Stripe)

1. Use as chaves `sk_test_...` e um endpoint de webhook de teste.
2. No app, tela de ativação → escolha um plano → **Assinar agora**.
3. Pague com o cartão de teste `4242 4242 4242 4242`, validade futura, CVC qualquer.
4. A página de sucesso mostra a chave; o e-mail chega em seguida.
5. Cole a chave no app e ative.

## Como os estados se comportam

- **Pagou** → licença `active`, `expiresAt` = fim do período da assinatura.
- **Renovou** (`invoice.paid`) → `expiresAt` estende automaticamente.
- **Falha de pagamento** (`past_due`) → licença `suspended`.
- **Cancelou** → licença `expired`.

O app revalida online a cada abertura, então esses estados chegam ao cliente
sem precisar reenviar chave.
