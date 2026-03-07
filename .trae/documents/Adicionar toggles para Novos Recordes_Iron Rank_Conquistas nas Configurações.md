## Objetivo
- Transformar **Novos Recordes**, **Iron Rank** e **Conquistas** em opções configuráveis no **menu Configurações**, controlando se aparecem no dashboard.

## Onde isso será implementado
- Preferências do usuário já são persistidas em `user_settings.preferences` via [useUserSettings.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/hooks/useUserSettings.js).
- UI do menu Configurações em [SettingsModal.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/SettingsModal.js).
- Dashboard do aluno em [StudentDashboard.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard.tsx).
- Componente de conquistas/iron rank em [BadgesGallery.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/BadgesGallery.tsx).

## Mudanças planejadas
### 1) Criar novas chaves de preferência (defaults)
- Adicionar ao `DEFAULT_SETTINGS`:
  - `showNewRecordsCard: true`
  - `showIronRank: true`
  - `showBadges: true`
- Isso não exige migration no banco, porque as prefs são JSON e fazem merge com defaults.

### 2) Expor as opções no SettingsModal
- Criar um novo bloco no modal (ex.: “Dashboard / Ferramentas”) com 3 toggles:
  - Novos Recordes
  - Iron Rank
  - Conquistas
- Cada toggle usa o mesmo padrão visual de botão “Ativo/Desligado”.

### 3) Respeitar as preferências no dashboard
- Em `StudentDashboard.tsx`, ler as flags do `props.settings` e:
  - Renderizar `RecentAchievements` apenas se `showNewRecordsCard` estiver ligado.
  - Renderizar `BadgesGallery` apenas se pelo menos `showIronRank` ou `showBadges` estiver ligado.

### 4) Separar Iron Rank vs Conquistas dentro do BadgesGallery
- Ajustar `BadgesGallery` para receber flags (ex.: `showIronRank`, `showBadges`) e:
  - Mostrar o card do Iron Rank (nível + botão) só quando `showIronRank`.
  - Mostrar a grid de “Conquistas” só quando `showBadges`.
  - Se ambos estiverem off, retornar `null`.

### 5) Validação
- Rodar lint/build e verificar no dashboard:
  - Desligar cada opção e confirmar que o respectivo card some e volta ao religar.
  - Confirmar que o layout permanece estável.
