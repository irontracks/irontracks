## Decisão de UX
- Adicionar **VIP como 4º botão** na barra de tabs do Dashboard, **ao lado de “Comunidade”** (Treinos | Avaliações | Comunidade | VIP).

## Mudanças necessárias (arquivos)
### 1) Dashboard tabs
- Alterar [StudentDashboard3.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard3.tsx) para:
  - incluir o botão “VIP” na mesma row dos tabs
  - expandir o tipo `view` e `onChangeView` para aceitar `vip`

### 2) Navegação do app
- Alterar [IronTracksAppClient 3.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient%203.js) para:
  - permitir `view === 'vip'` no bloco que renderiza `StudentDashboard`
  - repassar `vipContent`/callback de mudança de view

### 3) Tela VIP (MVP)
- Criar um componente de tela VIP (placeholder premium) com:
  - cabeçalho “VIP Coach”
  - quick prompts (bloco 4 semanas, próximo treino, diagnóstico)
  - área de chat (placeholder por enquanto)

### 4) Gate (pago)
- Se o usuário não tiver acesso:
  - ao clicar em VIP, abrir um modal paywall simples (benefícios + botão assinar)
- Se tiver acesso:
  - abrir a tela VIP.

## Critérios de pronto
- Botão VIP aparece ao lado de Comunidade.
- Navegação não quebra tabs atuais.
- Paywall aparece para não-VIP; VIP abre a tela.
- Lint/build passando + teste manual de navegação.