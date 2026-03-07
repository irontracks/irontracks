## O que está errado no print (treino ativo)
- O exercício está como **Rest-Pause**, mas a tela não mostra **Mini 1 / Mini 2…** (só Ativação). Isso acontece quando o treino tem só o texto no `notes`, mas não tem `advanced_config` com `mini_sets/rest_time_sec`.
- As **Observações da série** aparecem abertas em todas as séries (polui e deixa a tela enorme).
- **Concluir** fica bloqueado sem indicar o motivo.

## Correção proposta (incluindo o timer entre blocos)
### 1) Fallback de config do Rest-Pause (para sempre ter minis + timer)
- Quando `ex.method === 'Rest-Pause'` e o `cfg` vier vazio/incompleto:
  - aplicar defaults: `mini_sets = 2`, `rest_time_sec = 15`.
- Isso garante que a UI sempre renderiza minis e o timer tem um valor para contar.

### 2) Timer de descanso entre blocos (Rest-Pause)
- Manter/garantir o comportamento:
  - após preencher **Ativação** → iniciar timer de `rest_time_sec` antes do Mini 1.
  - após preencher **Mini i** → iniciar timer antes do **Mini i+1**.
- Ajuste planejado: disparar o timer de forma mais confiável quando o usuário digitar (onBlur e, se necessário, também quando o valor “vira válido”), evitando “não disparou” em mobile.
- Exibir na linha do set algo como “Descanso: 15s” para ficar claro.

### 3) Observações com toggle (como no set normal)
- Reusar o mesmo padrão do set normal (botão para abrir/fechar) também em Rest-Pause/Cluster.

### 4) Mensagem quando Concluir estiver desativado
- Mostrar feedback direto:
  - “Preencha Ativação e Minis para concluir.”

## Onde mexer
- [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js)
  - `renderRestPauseSet`: fallback cfg + timer + UI
  - `renderClusterSet`/`renderRestPauseSet`: toggle de observações

## Validação
- Abrir um Rest-Pause sem advanced_config e confirmar:
  - aparecem Mini 1/2
  - timer de 15s dispara entre ativação e minis
  - Concluir libera só quando tudo preenchido e mostra motivo quando não
  - observações ficam recolhidas por padrão

Se aprovar, eu implemento isso agora na tela do treino ativo.