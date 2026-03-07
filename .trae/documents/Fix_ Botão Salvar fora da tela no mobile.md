## Causa
- O header do `ExerciseEditor` tem botões demais lado a lado; no mobile eles estouram a largura e o “Salvar” fica fora da tela.

## Ajuste solicitado
- Remover o botão **“Importar Treino (Foto/PDF)”** do header (redundante com Carregar JSON, e ajuda a caber no mobile).

## Correção de layout (sem alterar o restante do editor)
- Em [ExerciseEditor.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ExerciseEditor.js#L726-L768):
  - Remover o bloco do botão “Importar Treino (Foto/PDF)” + `<input type="file" ...>` correspondente.
  - Fazer o título não empurrar os botões (`min-w-0` + `truncate`).
  - Tornar o grupo de ações responsivo:
    - `flex-wrap` (ou `overflow-x-auto`) para não cortar;
    - reduzir paddings no mobile (`px-2 sm:px-3`);
    - esconder labels longas no mobile quando necessário (`hidden sm:inline`).
  - Garantir que “Salvar” fique sempre visível (`shrink-0`).

## Verificação
- Validar no viewport iPhone (DevTools) dentro do modal de edição do treino ativo.
- Rodar build para garantir que não quebrou imports/handlers.