## Recomendação (qual melhor)
- Para **assinatura recorrente** com melhor “padrão mercado” no Brasil, eu recomendo **Mercado Pago** (via conta Mercado Livre) como provedor principal para **cartão**.
- Para **PIX recorrente** (cobrança por ciclo com QR code), o que já existe hoje via **Asaas** é o caminho mais direto.
- Estratégia prática: **PIX = Asaas** + **Cartão recorrente = Mercado Pago** (sem reescrever tudo).

## O que eu deixo pronto no código (próximo passo após você liberar as credenciais)
- Padronizar uma camada `billing provider` (Asaas/MercadoPago).
- Criar endpoints Mercado Pago:
  - criar assinatura (preapproval) e/ou pagamento
  - webhook Mercado Pago com validação de assinatura
- Persistir IDs/status do Mercado Pago em `app_subscriptions/app_payments` via campos genéricos (`provider`, `provider_*_id`) + `metadata`.
- Atualizar o gate do VIP para aceitar assinaturas Mercado Pago (além do Asaas).

## Próximo passo: o que você precisa fazer na sua conta Mercado Livre/Mercado Pago (passo a passo)
### 1) Preparar a conta (uma vez)
1. Entrar com sua conta do **Mercado Livre** e ativar/usar o **Mercado Pago**.
2. Completar verificação/KYC (documentos) para habilitar recebimento e recursos completos.

### 2) Criar o “App” no Mercado Pago (credenciais)
1. Ir em **Mercado Pago Developers** e criar uma **Aplicação** (App).
2. Anotar:
   - **App ID**
   - **Public Key** (usada no front, se formos usar checkout/SDK)
   - **Access Token** (segredo, usado no backend)
3. Separar **credenciais de teste** e **credenciais de produção**.

### 3) Configurar Webhook (notificações)
1. Cadastrar a URL de webhook do seu app (que eu vou deixar pronta), por exemplo:
   - `https://SEU_DOMINIO/api/billing/webhooks/mercadopago`
2. Marcar eventos:
   - **Payments** (pagamentos)
   - **Subscriptions / Preapproval** (assinaturas), se disponível na sua conta
3. Configurar um **segredo/assinatura** (se o painel oferecer) para validarmos a origem.

### 4) Definir como será a recorrência
- Decisão recomendada:
  - **Cartão recorrente** via “Assinaturas / Preapproval” do Mercado Pago.
  - **PIX** fica via Asaas (porque recorrência via PIX no geral não é automática como cartão).

### 5) Testes (modo sandbox)
1. Ativar **modo teste** no Mercado Pago.
2. Criar um **usuário comprador de teste** (test user) e usar cartões de teste.
3. Confirmar que:
   - cria assinatura
   - webhook chega
   - VIP libera no app

## O que você precisa me entregar (checklist)
- **Access Token (produção)** do Mercado Pago (NÃO comitar; apenas colocar como env var no deploy).
- **Public Key (produção)** (se for necessário no front).
- **Access Token (teste)** e **Public Key (teste)** (para validação em dev/staging).
- **App ID**.
- **Webhook Secret/Signature key** (se o painel disponibilizar) ou o método de validação indicado pelo Mercado Pago.
- **Domínio final** onde o webhook vai receber (produção).

## Onde isso vai no projeto (sem executar agora)
- Variáveis de ambiente no deploy (Vercel/servidor):
  - `MERCADOPAGO_ACCESS_TOKEN`
  - `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` (se aplicável)
  - `MERCADOPAGO_WEBHOOK_SECRET` (se aplicável)
  - `BILLING_PROVIDER_DEFAULT=mercadopago`

Se você quiser, eu também preparo uma alternativa “Plano B” com **PagSeguro**, mas a minha recomendação para começar é Mercado Pago (cartão recorrente) + Asaas (PIX recorrente).