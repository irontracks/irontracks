## Diagnóstico
- No treino ativo, séries “normais” são editadas inline (não existe modal), então o usuário precisa repetir o peso em cada set.
- Já os métodos avançados têm modais (Cluster/Drop-set) com múltiplos campos de peso que também ficam repetitivos.

## Objetivo
- Adicionar um botão “Linkar pesos” para aplicar o mesmo peso em todas as séries, evitando digitação repetida.

## Plano de implementação
### 1) Botão por exercício (principal)
- Em [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js#L1188-L1323), dentro do bloco expandido do exercício (onde ficam as séries + “Série extra”), adicionar um botão:
  - Texto: “Linkar pesos”
  - Ação: copiar um “peso fonte” para todas as séries daquele exercício.
- Regra do “peso fonte” (determinística):
  - Primeiro peso não vazio encontrado nos logs desse exercício (`getLog(\`${exIdx}-${setIdx}\`)?.weight`).
  - Se nenhum existir, tentar `getPlanConfig(ex, 0)?.weight`.
  - Se ainda vazio: mostrar alerta “Preencha pelo menos 1 série com peso antes de linkar”.
- Aplicação:
  - Iterar `setIdx` de `0..setsCount-1` e chamar `updateLog(key, { weight: pesoFonte, advanced_config: cfgExistenteOuPlanejado })`.
  - Preservar `advanced_config` existente e demais campos do log (reps/done/notas).

### 2) Linkar pesos dentro dos modais (qualidade extra)
- **Cluster modal**: adicionar botão “Aplicar kg em todos os blocos” no modal (perto do primeiro campo de peso) que seta `blocks[*].weight` no estado `clusterModal`.
- **Drop-set modal**: adicionar botão “Aplicar kg em todas as etapas” que seta `stages[*].weight` no estado `dropSetModal`.
- **Rest-Pause modal**: não precisa (já existe um único campo de peso no modal).

### 3) Validação
- Testar em mobile e desktop:
  - Preencher 1 série com peso → clicar “Linkar pesos” → todas as séries do exercício recebem o mesmo kg.
  - Cluster/Drop-set: preencher 1 bloco/etapa → aplicar → todos os blocos/etapas recebem o kg.
- Rodar `npm run lint`.

## Arquivo que vou alterar
- [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js)
