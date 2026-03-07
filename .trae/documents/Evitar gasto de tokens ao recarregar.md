## Respostas (o que está acontecendo hoje)
### Tokens de IA
- Recarregar a página **não gasta tokens sempre**: existe cache no Supabase por **6 horas**; nesse período o endpoint só lê `muscle_weekly_summaries` e retorna (sem IA).
- Vai gastar tokens quando:
  - o cache estiver velho/ausente (após 6h), ou
  - você clicar em **Atualizar** (hoje isso força recalcular).

### “Tenho 4 treinos e está baixo” / “está correto não aparecer nada?”
- O número de treinos não garante volume alto: o mapa mede **sets concluídos por músculo** na semana.
- Se parte dos treinos não tem `session.logs` (ou seja, treino não foi “concluído” com sets registrados), o volume fica **subestimado**.
- No seu print, aparece “IA + dados reais” e alertas, então o endpoint está rodando; o “não aparecer nada” normalmente é só porque nenhum músculo foi selecionado em “Detalhes” (fica pedindo tocar). Posso melhorar isso auto-selecionando o músculo mais fraco do lado (frente/costas).

### Deltoide lateral = 0
- Pode ser **real** (sem elevação lateral/press com ênfase lateral), ou pode ser falta de mapeamento (exercícios não foram atribuídos a `delts_side`).
- Além disso, o desenho atual do corpo (SVG) não tem uma área específica de “deltoide lateral”, então não dá para “bater o olho” nele no mapa.

## O que vou ajustar (para ficar do jeito que você pediu)
### 1) Controle total do gasto de tokens
- Página abrindo/recarregando → **não chama IA**.
- O mapa sempre calcula **determinístico** (sem IA) e usa cache.
- Botões no card:
  - **Atualizar**: recalcula e atualiza cache **sem IA**.
  - **Gerar com IA**: aí sim roda IA (auto-tag de exercícios sem mapeamento + insights), e salva no cache.

### 2) Mapa muscular mais “confiável” mesmo sem logs completos
- Se não existir `session.logs` em alguns treinos, vou estimar sets usando `session.exercises[].sets` quando disponível (marcando como “estimado”) para não ficar tudo “baixo” injustamente.
- Vou retornar também um diagnóstico “Exercícios sem mapeamento” e “Exercícios que não tiveram logs”, para você entender o porquê de algum músculo zerado.

### 3) Deltoide lateral (visual e cálculo)
- Ajustar o SVG para ter área/identificação de **deltoide lateral** (ou agrupar ombro em uma área que considere deltoide frontal + lateral com prioridade no lateral).
- No “Detalhes”, mostrar top exercícios que mais contribuem para aquele músculo (para você validar na prática).

### 4) Integrar com “criar treino automático” (baseado no que precisa de atenção)
- Adicionar no card do mapa um botão: **“Criar treino para equilibrar”**.
- Ele vai:
  - identificar os 1–2 músculos mais abaixo da meta (ex.: deltoide lateral),
  - abrir o **WorkoutWizardModal** já com as “Restrições/Observações” preenchidas com foco nesses músculos (ex.: “priorizar deltoide lateral; incluir 2–4 exercícios/variações; não estourar tempo”),
  - e a IA do wizard vai montar os exercícios em cima disso.
- Importante: isso não exige você preencher nada manualmente; é automático.

### 5) (MAPA MUSCULAR) abrir/fechar igual (NOVOS RECORDES)
- Vou transformar o card do mapa em um “accordion” igual ao componente de “Novos Recordes”: clique no header expande/recolhe, com setinha animada.
- Quando recolhido, mostra um resumo curto (ex.: “músculos mais baixos: deltoide lateral, peitoral…”).

## Validação
- Testar no mobile (layout + abrir/fechar).
- Garantir: reload não chama IA; só “Gerar com IA” chama.
- Garantir: botão “Criar treino para equilibrar” abre wizard já focado no músculo faltando.

Se você confirmar, eu implemento tudo isso agora.