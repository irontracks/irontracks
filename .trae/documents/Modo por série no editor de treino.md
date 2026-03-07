## Como ficaria na UI
- No editor de treino (mesmo componente usado no criar/editar), cada card de **Série** ganha um seletor **“Modo da série”**:
  - Normal
  - Drop-set
  - Rest-Pause
  - Cluster
- Ao escolher **Drop-set** na série (ex.: Série 4), aparece a configuração de Drop-set só daquela série.
- Para o exemplo “4 drop-set”, a UX mais direta é:
  - Campo **“Qtd. drops”** (default 2) + botão **“Aplicar”** que cria automaticamente 4 etapas (vazias) no `advanced_config`.

## Onde implementar (sem mexer no banco)
- O app já suporta modo por série via `sets[].advanced_config`.
- A UI atual só mostra o editor de Drop/Rest/Cluster se o exercício estiver no método ou se o `advanced_config` já existir.
- Vamos adicionar a escolha do modo por série no editor, criando/limpando `advanced_config` automaticamente.

## Implementação (passo a passo)
### 1) Adicionar seletor “Modo da série”
- Arquivo: [ExerciseEditor.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ExerciseEditor.js#L1219-L1438)
- Em cada série (`setDetails.map`), inserir um `<select>` que deriva o modo atual por:
  - `advanced_config` array → Drop-set
  - `advanced_config` objeto com `mini_sets/rest_time_sec/initial_reps` → Rest-Pause
  - `advanced_config` objeto com `cluster_size/intra_rest_sec/total_reps` → Cluster
  - `advanced_config` null → Normal

### 2) Aplicar o modo selecionado na série
- Ao trocar o modo:
  - Normal → `advanced_config: null`
  - Drop-set → `advanced_config: [{ weight:null, reps:'' }]` (ou vazio e criar via preset)
  - Rest-Pause → `advanced_config: { weight:null, initial_reps:null, rest_time_sec:null, mini_sets:null }`
  - Cluster → `advanced_config: { weight:null, total_reps:null, cluster_size:null, intra_rest_sec:null }`

### 3) Preset “Qtd. drops” (para o caso “4 drop-set”)
- Dentro do bloco de Drop-set, adicionar um input numérico `qtdDrops` (ex.: 4) e um botão que reescreve `advanced_config` com N itens.

### 4) Garantir compatibilidade no treino ativo
- O treino ativo já renderiza o modo por série (Normal/Drop/Cluster/Rest-P) baseado na configuração do set.
- Só validar que:
  - Série com `advanced_config` Drop-set abre modal de drop-set
  - Demais séries continuam normais

## Validação
- Criar/editar um treino, marcar a **Série 4** como Drop-set e setar **Qtd. drops = 4**.
- Salvar, iniciar treino e confirmar que apenas a Série 4 usa Drop-set.
- Rodar lint/build.
