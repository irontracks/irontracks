# Plano de testes PWA iOS (11/12/13)

## Objetivo
Validar cache, atualização automática, persistência de login e recuperação de sessão após deploy.

## Dispositivos
- iPhone 11 (iOS 16)
- iPhone 12 (iOS 16/17)
- iPhone 13 (iOS 16/17)

## Cenários críticos
1. Instalação PWA e login inicial
   - Instalar no Home Screen
   - Fazer login
   - Fechar PWA completamente
   - Reabrir e validar sessão ativa

2. Deploy com nova versão
   - Com PWA aberto, publicar nova versão
   - Verificar banner de atualização
   - Atualizar e confirmar novo build

3. Offline e fallback
   - Ativar modo avião
   - Abrir PWA e validar tela offline
   - Voltar online e confirmar recuperação automática

4. Cache e assets
   - Validar que HTML não fica preso após deploy
   - Validar que /sw.js atualiza
   - Validar que /_next/static mantém cache imutável

5. Persistência de sessão
   - Fechar PWA por 24h
   - Reabrir e validar refresh automático

6. Erros e métricas
   - Checar eventos sw_update_available, sw_update_applied
   - Checar auth_refresh e auth_refresh_fail

## Critérios de aprovação
- Sem necessidade de limpar cache manualmente
- Sessão persistente após fechar PWA
- Atualização automática após deploy
