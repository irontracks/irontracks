## Diagnóstico pelo print
- Sim: os “deltoides laterais” ficaram no lugar errado.
- Eles estão aparecendo como duas cápsulas na região da clavícula/peito. Deltoide lateral deveria ficar no “cap” do ombro, na lateral externa, acima do bíceps.

## Por que aconteceu
- No SVG, o `delts_side` foi desenhado dentro do tronco (coordenadas próximas do peito), então o highlight fica “no lugar errado”.

## Correção proposta
- Mover a área clicável do `delts_side` para o topo/lado externo dos braços (região do ombro), mantendo `delts_front` onde está.

## Arquivo que vou mexer
- `src/components/muscle-map/BodyMapSvg.tsx`

## Passos que vou executar (se você confirmar)
1) Remover os 2 retângulos atuais do `delts_side` (os que ficam embaixo do `delts_front`).
2) Criar 2 retângulos novos para `delts_side` nas laterais do ombro:
   - Ombro esquerdo (aprox.): `x≈52, y≈102, w≈26, h≈26, rx≈12`
   - Ombro direito (simétrico): `x≈182, y≈102, w≈26, h≈26, rx≈12`
3) Rodar e conferir visualmente no dashboard (mobile/desktop) e ajustar 1–2 vezes se necessário para ficar natural.

## Resultado esperado
- Quando selecionar `Deltoide (lateral)`, o highlight fica no ombro externo (não no peito).