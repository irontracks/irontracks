## Status do Scanner (o que já existe)
- Já existe um Scanner por imagem via endpoint `/api/iron-scanner` que usa Gemini multimodal e retorna `[{ name, sets, reps, notes }]`: [iron-scanner-actions.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/iron-scanner-actions.ts) + [route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/iron-scanner/route.ts).
- Hoje ele NÃO retorna: título do treino, restTime, método (Cluster/Rest-Pause), RPE, cadência, nem trata PDF.

## 1) Normalização de exercícios (sinônimos → canônico)
- **Back-end**
  - Criar uma base de sinônimos (inicial em JSON no repo, depois migrar para tabela se quiser). Ex.: `exerciseAliases.json`.
  - Criar util `normalizeExerciseAlias(input) -> { canonicalName, confidence, source }`.
  - Integrar no salvamento do treino (create/update) e no import/scanner com modo “sugerir” (não forçar sem aprovação).
- **Front-end**
  - No ExerciseEditor: ao digitar nome, sugerir canônico e permitir aplicar.
  - Em Ferramentas: ação “Normalizar exercícios (lote)” com preview e confirmação.

## 2) Detecção de duplicados (quase iguais)
- **Cálculo (sem IA, determinístico)**
  - Criar uma “assinatura” por treino baseada em exercícios canônicos + sets/reps/método.
  - Calcular similaridade (Jaccard + pesos) e agrupar acima de um threshold.
- **UI**
  - Ferramentas → “Encontrar duplicados” (lista de grupos + abrir comparação).
  - Tela de comparação: lado a lado + ações: Renomear / Arquivar / Mesclar.
- **Ações**
  - Arquivar (sem deletar): adicionar `is_archived` ou `archived_at`.
  - Mesclar: escolher base + anexar exercícios únicos, salvar via update.

## 3) Recomendação de deload
- **Dados usados**
  - Logs de treino (reps/weight/RPE) + check-ins (energia/dor/sono) quando existirem.
- **Heurística inicial (sem IA)**
  - Alertar deload se:
    - 2–3 sessões seguidas com queda em exercícios-chave OU
    - RPE médio alto + performance estagnada + check-in ruim.
- **UX**
  - Card no dashboard + insight no relatório.
  - Botão “Aplicar deload” (gera sugestões: -10–20% carga ou -1 série).

## 5) Scanner avançado (melhorar o que já existe)
- **Melhorias no schema retornado**
  - Incluir: `method`, `restTime`, `rpe`, e “título sugerido” do treino.
- **Melhorias de parsing/qualidade**
  - Passar o resultado pelo normalizador (#1) antes de mandar pro editor.
  - Adicionar modo “revisão”: marcar itens com baixa confiança e pedir confirmação.
- **PDF**
  - Aceitar PDF (quando possível) e extrair páginas/imagem (ou usar endpoint separado).

## 6) Editor rápido de títulos/ordem (drag & drop + lote)
- **Dados**
  - Adicionar `sort_order` nos workouts (ou usar tabela auxiliar por user).
- **UI**
  - Modo “Editar lista” no dashboard:
    - arrastar e soltar
    - renomear inline
    - aplicar em lote
    - salvar.

## 7) Padronização por regra (A/B/C + (Segunda…)) configurável
- **Config**
  - Opção em Configurações: dia inicial + formato do nome.
- **Aplicação**
  - Wizard (program) usa essa regra.
  - Ferramentas: “Aplicar padronização (lote)” com preview.

## Ordem recomendada (pra ficar redondo)
1) Normalização de exercícios (base para duplicados e scanner)
2) Padronização por regra (títulos) + editor rápido de ordem
3) Duplicados (aproveita normalização + padronização)
4) Scanner: upgrade de schema + revisão + PDF
5) Deload (depende de logs/relatórios consistentes)

Se você confirmar, eu começo pela #1 + #7 (porque destravam o resto) e já coloco as ações no menu Ferramentas com telas de preview/confirmar.