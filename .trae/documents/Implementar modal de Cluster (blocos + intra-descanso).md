## Entendimento (ajuste com sua sugestão)
- Sim: no Cluster a UX ideal é ter **botõezinhos com ícone de relógio** para cada descanso intra-set.
- Ex.: `4 reps > 15s > 4 reps > 15s > 4 reps` → **3 blocos** (kg+reps) e **2 descansos**, logo **2 botões de relógio** (um para cada 15s).

## Plano
### 1) Fonte da prescrição (sem IA)
- Prioridade 1: `advanced_config` do set (`total_reps`, `cluster_size`, `intra_rest_sec`) para montar automaticamente:
  - `plannedBlocks` (reps por bloco)
  - `intraRestSec` (ex.: 15s)
- Fallback: parsear o texto do exercício (observação/descrição) se vier no formato `Cluster: ...`.

### 2) Modal “Cluster”
- Abrir ao tocar na série Cluster (em [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js#L877-L1067)).
- Dentro do modal:
  - **Bloco i**: input `kg` + input `reps` (com placeholder do planejado).
  - **Descanso após bloco i** (exceto o último):
    - Exibir `15s` (ou o valor planejado) como label
    - Um **botão com ícone de relógio** (1 por descanso) que dispara o timer.
    - Opcional: permitir editar os segundos (se você quiser manter flexível). Se não, fica fixo e sem campo.

### 3) Timer por descanso (1 botão = 1 descanso)
- Cada botão chama o timer já existente do app:
  - `startTimer(intraRestSec, { kind: 'cluster', key, blockIndex: i })`
- Visualmente, o botão do descanso “ativo” pode ficar destacado enquanto o timer estiver rodando (usando `activeSession.timerContext`).

### 4) Persistência dos dados (compatível)
- Salvar no log algo como:
  - `cluster.blocksDetailed = [{ weight, reps }, ...]`
  - manter `cluster.blocks = [reps,...]` para compatibilidade.
  - manter `log.reps` = soma das reps.
  - manter `log.weight` = peso do último bloco (compatibilidade com telas legadas).

### 5) Integração com “Concluir”
- No modal: botão **Salvar**.
- Ao salvar, habilita “Concluir” da série (ou opcionalmente o modal já ter “Salvar e Concluir”).

### 6) Verificação
- Testar exatamente o caso do print (3 blocos / 2 relógios).
- Finalizar treino e confirmar que o relatório não acusa falta de reps.

Se você confirmar esse desenho (segundos fixos + botão relógio por descanso), eu implemento o modal e substituo o preenchimento inline do Cluster por esse fluxo.