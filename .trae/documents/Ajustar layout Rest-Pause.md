## Diagnóstico
- O “REST-P” está quebrando em 2 linhas ("REST-" + "P") porque o label pode encolher e **não tem `whitespace-nowrap`/`shrink-0`**.
- A linha do Rest-Pause tem muitos itens de largura fixa (nº da série, input, botão Abrir, notas, Concluir), então no mobile ela estoura e começa a “apertar”/quebrar elementos.

## Plano de correção
### 1) Impedir quebra do label “REST-P”
- Em `renderRestPauseSet` (ActiveWorkout), aplicar no label:
  - `shrink-0 whitespace-nowrap`
- Resultado: nunca mais vai ficar “REST-\nP”.

### 2) Deixar a linha responsiva no mobile
- Reestruturar a linha principal para:
  - `flex flex-col gap-2 sm:flex-row sm:items-center`
  - Agrupar: (set + peso + Abrir) | (texto Rest-P) | (ações)
- Ajustar larguras responsivas:
  - `w-20 sm:w-24` no input de peso
  - `px-2 sm:px-3` e esconder texto “Abrir” no xs (`hidden sm:inline`) se necessário
  - Manter descrição com `min-w-0` e `truncate` só em telas maiores (`sm:truncate`), permitindo quebra natural no mobile.

### 3) Validar visualmente
- Testar em viewport mobile (375px) e desktop:
  - Rest-P não quebra
  - Botões não empurram layout
  - Sem overflow horizontal

## Arquivo que vou mexer
- [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js#L700-L856)

## Verificação
- Rodar `npm run lint` e abrir o treino no mobile simulator para confirmar o layout.