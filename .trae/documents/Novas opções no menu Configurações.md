Hoje o menu **Configurações** tem 4 controles principais: densidade do dashboard, unidades (kg/lb), sons do app e convites de treino em equipe. Eles já são persistidos em `user_settings.preferences` via Supabase + fallback em localStorage (bom para evoluir sem migrations).

## Sugestões (alto impacto) para dar mais controle
### Aparência & Acessibilidade (quick wins)
- **Tamanho de texto da interface**: Normal / Grande (melhora muito leitura em mobile).
- **Reduzir animações**: Desliga `transition/blur` mais pesados para quem sente desconforto/quer performance.
- **Alto contraste**: Ajusta neutros (bordas/texto) para legibilidade.

### Treino (controle operacional)
- **Incremento rápido de carga**: 1kg / 2,5kg / 5kg (para botões +/− de carga ficarem “do jeito do usuário”).
- **Descanso padrão**: valor inicial do timer (ex.: 60/90/120s).
- **Confirmações**: “Confirmar antes de finalizar treino” e “Confirmar antes de apagar”.

### Relatórios & Compartilhamento (muito valorizado)
- **Privacidade do relatório**: ocultar nome do aluno / ocultar data/hora / ocultar comparativo (%).
- **Layout do PDF**: Compacto / Padrão (define paddings e tamanho de fonte para impressão).
- **Título do relatório**: manter “somente nome do treino” (o que você pediu) ou mostrar completo.

### Notificações & Som
- **Preferências por tipo**: chat direto, convites, agenda, atualizações.
- **Modo silencioso** (horário): não tocar sons/notificações em determinado período.

### Dados & Segurança
- **Exportar dados**: export “todos treinos” (JSON/CSV) em 1 clique.
- **Limpar cache local**: reset de `irontracks.userSettings...` e outros caches.
- **Encerrar sessões**: sair de todos os dispositivos (se houver suporte no auth).

## O que eu recomendo implementar primeiro (Batch 1, sem infra pesada)
1) Tamanho de texto (Normal/Grande)
2) Reduzir animações (toggle)
3) Privacidade do relatório (ocultar nome do aluno + ocultar data/hora)
4) Layout do PDF (Compacto/Padrão)
5) Confirmação antes de deletar/finalizar (toggle)
6) Reset de configurações + limpar cache

## Implementação (como faremos)
- Expandir a UI do modal em [SettingsModal.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/SettingsModal.js).
- Adicionar chaves novas com defaults em [useUserSettings.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/hooks/useUserSettings.js).
- Aplicar essas preferências nos pontos de uso:
  - Dashboard (densidade/text size)
  - Relatório/PDF (privacidade/layout)
  - Ações críticas (confirmar)
- Validar em mobile e rodar build.

Se você confirmar, eu implemento esse Batch 1 inteiro mantendo o estilo premium do modal.