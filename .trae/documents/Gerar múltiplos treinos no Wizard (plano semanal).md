## Resposta direta
- Sim, **do jeito que o Wizard está hoje**, ele gera **um treino por vez**. Isso é consistente com a UI atual: o modal retorna um único `WorkoutDraft` e o botão “Abrir no editor” abre um único treino para você editar/salvar.
- Observação importante: apesar de existir `daysPerWeek` no modal, **ele não é usado para gerar vários treinos** — hoje ele está mais “informativo” do que funcional.

## O que eu recomendo (melhor UX)
- Transformar o Wizard em 2 modos:
  - **Treino único** (como está hoje)
  - **Plano semanal**: gerar **N treinos (2–6)** baseado em `daysPerWeek` + `split/focus/objetivo/restrições`.

## Plano de implementação
### 1) Expandir o contrato do Wizard
- Atualizar `WorkoutWizardModal` para suportar:
  - `draft` (treino único)
  - `drafts` (lista de treinos) quando modo “Plano semanal” estiver ativo
- Ajustar o preview para listar “Dia 1, Dia 2…” e permitir selecionar qual abrir no editor.

### 2) Endpoint de IA gerar múltiplos treinos
- Reusar a rota `/api/ai/workout-wizard` para aceitar `mode: 'single' | 'program'`.
- Quando `mode='program'`, pedir para a IA retornar JSON com `drafts[]` (cada um um treino diferente) respeitando:
  - variação real (não repetir mesmos exercícios)
  - restrições/obs com prioridade máxima
  - coerência com split (ex.: PPL → push/pull/legs; full body → full A/B etc.)

### 3) Persistência (salvar todos de uma vez)
- Ao clicar “Salvar” no editor, mantém igual (salva 1).
- Para “Plano semanal”, adicionar um botão “Salvar todos como templates” que cria N templates automaticamente:
  - Nome: `Hipertrofia • PPL (Dia 1)`, `... (Dia 2)` etc.

### 4) Validação
- Garantir que todos os drafts vêm com RPE numérico e sem ranges.
- Testar:
  - `daysPerWeek=2/3/4/5/6`
  - com restrições (ex.: ombro) + preferência por máquinas
  - salvar individual e salvar todos

Se você confirmar, eu implemento o modo **Plano semanal** mantendo o modo atual **Treino único** exatamente como está.