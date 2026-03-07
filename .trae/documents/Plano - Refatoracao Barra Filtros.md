# Plano - Refatoração Premium da Barra de Filtros

## Objetivo
Transformar a barra de filtros "tumultuada" em um componente de navegação horizontal premium, com design limpo, espaçamento adequado e comportamento de scroll suave (snap), eliminando a sensação de aperto.

## Arquivo Alvo
`src/components/dashboard/StudentDashboard3.tsx`

## Alterações Planejadas

### 1. Estrutura do Container
- Substituir o container flex "espremido" (`flex items-center justify-between`) por um container com **scroll horizontal**.
- Remover as bordas e fundos escuros pesados (`bg-neutral-900/40 border border-neutral-800`).
- Usar um container "invisível" com `overflow-x-auto`, `no-scrollbar` e padding lateral para respiro.

### 2. Design dos Botões (Chips)
- Padronizar a altura para `h-10` (40px).
- **Estado Ativo**: Fundo `bg-white` (ou `bg-yellow-500` se preferir manter a identidade forte, mas branco é mais "premium clean"), texto preto, font-bold.
- **Estado Inativo**: Fundo `bg-neutral-900` (ou transparente com borda fina), texto cinza claro, hover branco.
- Adicionar ícones sutis e espaçamento interno (`px-4`).
- Arredondamento `rounded-full` para um visual mais moderno e orgânico.

### 3. Ordem e Elementos
- **Container Scrollável**:
  1. Chip "Meus Treinos"
  2. Chip "Periodizados" (com ícone Crown)
  3. Chip "Arquivados" (se houver, condicional)
  4. Chip "Organizar" (ícone Sort/List)
  5. Botão "Ferramentas" (Circle Icon Button no final, fixo ou scrollável)

### 4. Detalhes de Implementação
- Remover o agrupamento forçado dos dois primeiros botões.
- Permitir que os itens "sangrem" para fora da tela no mobile, indicando scroll horizontal.
- Adicionar gradiente de fade-out no canto direito (opcional, mas elegante).

## Validação
- Verificar se todos os itens são acessíveis via scroll.
- Garantir que o toque nos botões seja fácil (área de toque adequada).
- Conferir visual "clean" sem bordas desnecessárias.
