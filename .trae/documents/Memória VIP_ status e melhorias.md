## Diagnóstico (isso está certo?)
- Sim. Esse card “MEMÓRIA VIP … Ainda não configurado” aparece quando **não existe nenhum registro salvo** na tabela `vip_profile` (ou seja, `profile=null` / sem `updated_at`).
- Quando você clicar em **Editar** e **Salvar**, o backend faz `upsert` em `vip_profile` e aí:
  - o card deixa de mostrar “Ainda não configurado” (passa a ter `updated_at`)
  - o prompt do VIP Coach passa a incluir o bloco `MEMÓRIA VIP (prioridade alta)`.

## O que é a “Memória VIP”
- É um conjunto de **preferências/restrições persistentes** (goal/equipment/constraints/preferences) que entram no contexto do coach.
- Sem configurar, o coach continua funcionando, mas **sem essas regras fixas**.

## Onde isso acontece no código (referência)
- UI do card “Memória VIP”: `VipHub.js`.
- API que lê/salva: `GET/PUT /api/vip/profile`.
- Inclusão no prompt: `/api/ai/vip-coach` (só inclui se existir `vip_profile`).

## Plano (duas opções)
### Opção A — Manter como está (recomendado agora)
1. Não mudar código.
2. Orientar o usuário: abrir **Editar** → preencher → **Salvar**.

### Opção B — Melhorar UX (se você quiser)
1. Auto-criar um `vip_profile` com defaults na 1ª visita (evita “Ainda não configurado” confundindo).
2. Mostrar no card a diferença entre “nunca salvou” vs “salvo em …”.
3. Garantir que o prompt sempre tenha um bloco de memória (mesmo que default) quando VIP estiver ativo.
4. Testar o fluxo end-to-end.
