## Por que a IA ainda não está funcionando
- A aba VIP que colocamos agora é **um MVP de UI**: ela só salva o prompt na tela (estado local) e **não chama nenhum endpoint de IA**.
- Os endpoints de chat existentes (`/api/chat/*`) são para mensagens entre pessoas (inserem/consultam `messages`) e **não geram resposta da IA**.
- A parte de IA do app hoje roda em rotas `/api/ai/*` usando **Gemini** (ex.: [workout-wizard](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/ai/workout-wizard/route.ts)). A aba VIP ainda não foi integrada a isso.

## Plano para ligar a IA no VIP
### 1) Criar endpoint de IA do VIP
- Criar `POST /api/ai/vip-coach` (ou `vip-chat`) no App Router.
- Reusar o mesmo padrão de auth do projeto (`requireUser`) e o mesmo provider (`@google/generative-ai`).
- Validar env: se `GOOGLE_GENERATIVE_AI_API_KEY` não existir, retornar erro claro “IA não configurada”.

### 2) Montar “contexto do atleta” (dados reais)
- No endpoint, buscar no Supabase:
  - últimos treinos (ex.: 20–50), volume por grupamento, exercícios mais frequentes
  - PRs / RPs (se já existe tabela/derivação)
  - avaliações (se houver)
  - check-ins (energia, humor, dor)
- Gerar um resumo compacto (“Dados usados”) + anexar IDs para links internos.

### 3) Prompt e formato de saída
- Definir um system prompt fixo: coach pt-BR, segurança primeiro, não inventar dados, pedir confirmação quando faltar.
- Resposta em JSON (ex.: `answer`, `dataUsed`, `actions[]`), para a UI renderizar bonito.

### 4) Conectar a UI (VipHub)
- Trocar o “Enviar” para:
  - mostrar estado loading
  - chamar `/api/ai/vip-coach`
  - renderizar resposta da IA + cards “Dados usados”
  - oferecer botões de ação (ex.: “Criar bloco 4 semanas”, “Aplicar no treino”) conforme `actions`.

### 5) Gate de assinatura
- Trocar o gate atual (role) por um flag real (ex.: vindo do Marketplace/Asaas), mantendo fallback para admin/teacher.

### 6) Verificação
- Testar 3 casos:
  - sem API key → erro amigável
  - com API key e poucos dados → IA pede confirmação
  - com histórico → resposta com referências e ações

Se você aprovar, eu implemento o endpoint + integração do VipHub e já deixo a primeira versão respondendo de verdade (com seus dados).