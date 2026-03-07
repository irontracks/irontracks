## O que está faltando hoje
- A tela do Marketplace já lista planos, mas para alunos/usuários comuns ela chama `loadPlans()` sem filtrar, e pode acabar em “Nenhum plano encontrado”.
- Também falta um botão claro de **voltar** caso o usuário não queira assinar.

## Ajustes que vou implementar
### 1) Botão “Voltar” no topo
- Adicionar um botão no header do Marketplace (ao lado de Config/Novo plano), com:
  - comportamento: `router.back()`
  - fallback: se não houver histórico, ir para `/dashboard`
- Também adicionar o mesmo botão/CTA na mensagem “Nenhum plano encontrado”.
- Arquivo: [MarketplaceClient.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/marketplace/MarketplaceClient.tsx)

### 2) Mostrar “planos do professor” automaticamente para alunos
- Para `role` não-professor, buscar o professor do aluno:
  - consultar `public.students` onde `user_id = auth.uid()` e pegar `teacher_id`
- Se encontrar `teacher_id`, chamar `loadPlans(teacher_id)`.
- Se não encontrar professor vinculado, manter `loadPlans()` e mostrar mensagem amigável (“Você ainda não tem professor vinculado”).
- Arquivo: [MarketplaceClient.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/marketplace/MarketplaceClient.tsx)

### 3) Melhorar o estado “Nenhum plano encontrado”
- Trocar o texto simples por:
  - explicação curta do que aconteceu
  - botões: **Voltar** e **Recarregar** (reexecuta `loadPlans`)

## Verificação
- Validar 3 cenários:
  - admin/teacher: vê “Novo plano” e lista os próprios planos
  - aluno com professor vinculado: vê planos do professor
  - aluno sem professor/sem planos: vê estado vazio com botão “Voltar” funcionando
- Rodar `lint` e conferir no Browser do Trae (`/marketplace`).