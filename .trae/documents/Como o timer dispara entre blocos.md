## Diagnóstico (por que não dispara)
- No Rest-Pause o timer de 15s só dispara quando existe “próximo bloco” para descansar antes (ex.: Mini 1/2).
- Na sua tela, mesmo com Rest-Pause, **não aparecem os Minis** — isso indica que `mini_sets` está vindo como **0** no `advanced_config` daquele set.
- Com `mini_sets = 0`, a lógica entende que não há minis e por isso **não chama** `startTimer(15, ...)` ao preencher a Ativação.

## Correção
### 1) Normalizar Rest-Pause na tela ativa
- Em [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js), ao montar o `cfg` do Rest-Pause:
  - Se `method === 'Rest-Pause'` e `mini_sets` for `null/undefined/0` ou `< 1`, forçar default `mini_sets = 2`.
  - Se `rest_time_sec` for `null/undefined/0` ou `< 1`, forçar default `rest_time_sec = 15`.
- Resultado: os campos **Mini 1 / Mini 2** aparecem e o timer volta a ter “entre blocos”.

### 2) Disparo do timer
- Manter o disparo quando:
  - Ativação vira válida (>0) e Mini 1 está vazio → inicia 15s.
  - Mini i vira válido (>0) e Mini i+1 está vazio → inicia 15s.

## Validação
- Abrir um Rest-Pause antigo (que hoje tem mini_sets=0) e confirmar:
  - Renderiza Mini 1/2
  - Ao preencher Ativação, o overlay do timer aparece com 15s
  - Ao preencher Mini 1, dispara 15s antes do Mini 2

Se você confirmar, eu aplico esse ajuste (é um patch pequeno e resolve também treinos antigos com config errado).