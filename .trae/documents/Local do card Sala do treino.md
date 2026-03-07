## Onde está o card
- O card é o componente [TeamRoomCard.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/TeamRoomCard.js).
- Ele é renderizado dentro do treino ativo (tela de execução do treino) em [ActiveWorkout.js:L1678-L1686](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js#L1678-L1686), logo abaixo do contador “Equipe:” e acima do título do treino.

## Condições para aparecer na UI
- Precisa ter `featureTeamworkV2` ligado (porque o render é `teamworkV2Enabled ? <TeamRoomCard ... /> : null`).
- Além disso, o próprio card só renderiza se existir `teamSession.id` (o componente retorna `null` quando não há sessão).

## Como visualizar rapidamente
- No treino ativo, clique no botão **Link** (Convite por link/QR). Isso cria/atualiza a `teamSession` e aí o card passa a aparecer.
- Se o botão **Link** não estiver aparecendo no topo, a flag `featureTeamworkV2` está desligada (ou o kill switch está ligado) nas configurações do usuário.