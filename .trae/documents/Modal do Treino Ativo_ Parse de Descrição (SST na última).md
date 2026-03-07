## Entendi (e sim, dá)
Você quer um sistema onde a **OBS do exercício vira “comando”**: ao digitar algo como `SST na 3ª: ...` ou `Drop-set na última: ...`, o editor **já reestrutura as séries em tempo real** e, no treino ativo, o modal **executa exatamente aquele formato por série**.

## Estratégia (pra ficar pronto para qualquer combinação)
Vamos tratar a OBS como uma mini-linguagem (“IronSyntax”) com regras previsíveis. Isso permite suportar **várias abordagens** sem depender de “IA” ou heurísticas fracas.

### Sintaxe suportada (V1)
Cada regra pode ser uma linha (ou separada por `;`):
- `CLUSTER na 2ª: 4 reps > 15s > 4 reps > 15s > 4 reps`
- `SST na 3ª: Falha > 10s > Falha > 10s > Falha`
- `REST-P na 1ª: Falha > 15s > Falha > 15s > Falha`
- `DROP-SET na última: Falha > -20% > Falha > -20% > Falha`

Alvos suportados:
- `na primeira`, `na última`
- `na 3ª` (ou `na 3`)
- `nas 2 últimas` (range)
- `em todas` (ou omitido → default configurável por método)

## Como o sistema vai funcionar
### 1) Editor (onde você digita OBS) — tempo real
Em [ExerciseEditor.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ExerciseEditor.js):
- Ao alterar `exercise.notes`, rodar um parser e gerar **configs por série** (`setDetails[setIdx].advanced_config`).
- Isso permite “REST-P na 1ª e resto normal”, “SST na 3ª de 4”, “DROP-SET só na última”, etc.
- Não vamos sobrescrever o que você ajustou manualmente: só aplicamos automaticamente quando:
  - a série ainda não tem config, ou
  - o config daquela série foi marcado como “auto-gerado da OBS”.

### 2) Treino ativo (execução) — modal se adapta
Em [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js):
- O modal já adapta por série para **Cluster** e **Rest-Pause** quando existe config.
- Vamos completar para:
  - **SST**: usar a UI de minis (mesma base do Rest-Pause), mas com rótulo **SST**.
  - **Drop-set**: implementar um renderer simples (por série) para executar os “drops” (peso+reps em etapas).

## O que exatamente será gerado por método
- **CLUSTER**: parser transforma `4 reps > 15s > 4 reps...` em config objeto (cluster_size/intra/total) para a(s) série(s) alvo.
- **REST-P / SST**: parser transforma `Falha > 10s > Falha > 10s > Falha` em config com `rest_time_sec=10` e `mini_sets=2` (ativação + 2 minis). O usuário registra as reps reais.
- **DROP-SET**: parser cria uma lista de etapas (drops) e a UI permite registrar peso/reps por etapa. (Percentual `-20%` vira sugestão visual; não calculamos peso automaticamente se o peso base não existir.)

## Arquivos impactados (somente o necessário)
- [ExerciseEditor.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ExerciseEditor.js) (parser + aplicação em tempo real nos setDetails)
- [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js) (suporte SST + Drop-set por série)
- Novo util pequeno (ex.: `src/utils/training/notesMethodParser.ts`) para não duplicar parser.

## Validação
- Criar 3 exercícios teste no editor:
  - `REST-P na 1ª: Falha > 15s > Falha > 15s > Falha`
  - `SST na 3ª: Falha > 10s > Falha > 10s > Falha`
  - `DROP-SET na última: Falha > -20% > Falha > -20% > Falha`
- Confirmar no editor que as séries alvo mudam imediatamente.
- Iniciar treino e confirmar que cada série abre no modo correto.

Se aprovar, eu implemento essa base V1 (já preparada para adicionar novos métodos/targets só expandindo o parser).