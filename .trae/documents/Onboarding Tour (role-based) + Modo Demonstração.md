## Decisão
- Implementar um **tour completo no primeiro acesso**, separado por **role (Aluno/Professor)**.

## Escopo do tour (v1)
### Aluno
- Dashboard (visão geral + progresso)
- Abrir/registrar treino ativo
- Histórico/relatórios
- Comunidade/extra (se o aluno tiver acesso)

### Professor
- Dashboard (visão geral)
- Alunos (criar/gerenciar)
- Treinos (montar/atribuir)
- Acompanhamento (status/aderência)

## Regras de UX
- Controles: **Próximo**, **Voltar**, **Pular**, **Cancelar**.
- Persistência: se o usuário **pular/cancelar**, não reabre automaticamente.
- O tour nunca executa ações destrutivas; apenas destaca e orienta.

## Implementação
### 1) Persistir estado do tour por usuário (Supabase)
- Campos/flags:
  - `tour_version`
  - `tour_completed_at`
  - `tour_skipped_at`

### 2) Componente de Tour (client)
- Criar `GuidedTour`:
  - passos por role (selector + texto + rota opcional)
  - overlay + highlight + navegação
  - suporte a continuar o tour após navegar entre rotas

### 3) Trigger no primeiro acesso
- No carregamento do app (dashboard):
  - buscar estado do tour do usuário
  - se não concluído e não pulado → abrir automaticamente

### 4) Botão “Ver tour” no menu (como você pediu)
- Adicionar item no menu lateral/topo: **“Ver tour”**.
- Ao clicar:
  - abrir o tour do role atual
  - opcional: opção “Reiniciar tour” (reseta flags) ou apenas roda sem reset.

### 5) Instrumentação
- Logar eventos mínimos:
  - `tour_started`, `tour_step`, `tour_skipped`, `tour_completed`

## Validação
- Usuário novo (aluno/professor): abre tour automaticamente.
- Pular/cancelar: não abre novamente sozinho.
- Menu “Ver tour”: abre sempre sob demanda.

## Próximo incremento (depois da v1)
- Tour contextual por tela (features avançadas) sem inflar o tour inicial.