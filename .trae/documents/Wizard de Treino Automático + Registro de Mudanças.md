## O que está “na minha memória” agora
1. Até este momento eu não tenho nenhum registro persistente salvo (memória de longo prazo) sobre o projeto; só retenho o contexto desta conversa e o que eu acabei de inspecionar no repositório.
2. Da conversa: você quer pausar a lista atual, adicionar a ideia de “criar treino automaticamente” via modal com perguntas, e quer que eu mantenha um histórico das mudanças para depois montarmos um check-list de funcionamento.

## O que o repositório já tem (boa notícia)
1. Já existe um modal/wizard de treino automático: `WorkoutWizardModal.tsx`.
2. Já existe um gerador que monta o treino a partir das escolhas: `workoutWizardGenerator.ts` (re-export em `workoutAutoGenerator.ts`).
3. O app já tem padrão de modal (overlay) e um sistema de dialogs centralizado via `DialogContext` + `GlobalDialog`.
4. Treinos/templates/histórico já estão modelados no Supabase (com RLS) e existe RPC para salvar treino “atômico”.

## Plano para deixar “Premium Plus” (sem quebrar nada)
### 1) Criar um “Registro de Mudanças” dentro do repo
- Adicionar um arquivo único (ex.: `docs/changes.md`) com entradas curtas: mudança, onde foi feita, impacto, como testar.
- A cada alteração relevante que eu fizer, eu adiciono uma entrada.
- No final, gerar um “checklist de funcionamento” a partir dessas entradas (manual, mas consistente).

### 2) Auditar o fluxo atual do Wizard e onde o botão chama
- Encontrar exatamente onde o botão “Criar treino automaticamente”/equivalente vive no dashboard.
- Confirmar se o wizard já está sendo usado e quais opções ele coleta hoje.
- Mapear onde o treino gerado é persistido (template) e como aparece na lista do aluno.

### 3) Refinar o Wizard (UX/UI premium)
- Transformar em um wizard com progress mais claro (etapas + resumo final antes de criar).
- Melhorar as perguntas para “perfil” (tempo por sessão, dias/semana, equipamentos, nível, limitações, foco) e separar “preferências” vs “restrições”.
- Microcopy mais objetiva e tom premium (sem parecer formulário médico).

### 4) Garantir criação/persistência do treino gerado com segurança
- Usar os endpoints/rotas existentes (ou criar um endpoint dedicado) para salvar o resultado como template do usuário.
- Garantir que respeita RLS e usa o client/server Supabase correto.

### 5) Checklist de funcionamento
- Criar uma seção “Como testar” por mudança (ex.: abrir modal, gerar single, gerar program, salvar, listar, editar, arquivar).
- Rodar o app e validar o fluxo ponta-a-ponta.

## Confirmações rápidas (eu assumo se você não opinar)
- Eu vou partir do wizard existente e elevar o nível visual/fluxo, em vez de criar um novo do zero.
- O objetivo é gerar e salvar como template do próprio usuário (não finalizar sessão/histórico).
