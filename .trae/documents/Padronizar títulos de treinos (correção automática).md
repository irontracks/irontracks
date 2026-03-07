## Diagnóstico
- Hoje o sistema trata o título como texto livre (`workouts.name`). Por isso você pode acabar com variações como:
  - `E - Posterior...` vs `Posterior...`
  - `Treino E ...` vs `E-...` vs `E – ...`
- A deduplicação atual no painel compara o texto “cru”, então essas variações aparecem como itens diferentes.

## Objetivo
- Ter um “sistema de correção de título” para que os nomes fiquem sempre no mesmo padrão (ex.: `E - Posterior de Coxa & Abdominal`) e para que variações não criem duplicatas visuais.

## O que vou implementar
### 1) Função única de padronização
- Criar um util `normalizeWorkoutTitle()` que:
  - remove espaços duplicados
  - normaliza hífen/traço (–, —, -) para ` - `
  - detecta prefixos como `Treino E`, `Treino (E)`, `E-`, `e -` e padroniza para `E - ...`
  - mantém o restante do título intacto (sem inventar letra quando ela não existe).

### 2) Chave de comparação que ignora o prefixo (para “igualar” variações)
- Criar `workoutTitleKey()` que gera uma chave removendo o prefixo de letra (A/B/C/D/E...) e `Treino X`, para comparar “o mesmo treino” mesmo que escrito diferente.
- Usar essa chave na deduplicação das listas do painel para que:
  - se existir `E - Posterior...` e `Posterior...`, a UI mostre **apenas um**
  - o item escolhido para exibição seja preferencialmente o que tem a letra (`E - ...`).

### 3) Aplicar a correção na UI e no salvamento
- UI (AdminPanel e listas do dashboard): exibir `normalizeWorkoutTitle(name)`.
- Salvamento (quando criar/editar template): aplicar `normalizeWorkoutTitle(title)` antes de enviar para o RPC, garantindo padrão daqui pra frente.

### 4) (Opcional, mas recomendado) Botão “Padronizar títulos”
- Criar um endpoint admin/teacher que percorre templates do usuário e atualiza `workouts.name` aplicando `normalizeWorkoutTitle()`.
- Isso “conserta o passado” (os títulos já salvos) sem depender de editar um por um.

## Validação
- Confirmar que a lista deixa de mostrar “Posterior…” separado quando já existe `E - Posterior…`.
- Criar/editar um treino digitando `treino e posterior...` e validar que salva como `E - Posterior...`.
- Rodar `npm run build`.
