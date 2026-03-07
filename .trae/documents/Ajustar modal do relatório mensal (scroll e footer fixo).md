## Diagnóstico
- O modal do relatório (`periodReport`) é um overlay `fixed inset-0` que bloqueia o fundo (comportamento normal).
- O problema é que, com a IA retornando textos longos, o conteúdo do modal ultrapassa a altura da tela e **o modal não tem área de scroll interna**, então você fica “preso”: não consegue alcançar os botões (Fechar/Baixar/Compartilhar) e não dá para interagir com o resto.
- A estrutura atual está em [HistoryList.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/HistoryList.js#L1169-L1320).

## Correção proposta
### 1) Tornar o modal responsivo à altura da tela
- Alterar o container do modal para:
  - `max-h-[90vh]` (ou 92vh)
  - `flex flex-col`
- Isso garante que ele nunca “estoure” a viewport.

### 2) Scroll apenas no conteúdo (mantendo footer sempre visível)
- Manter header e footer fixos dentro do modal.
- Aplicar `overflow-y-auto` somente na área central (onde ficam as seções e listas da IA).
- Resultado:
  - você rola as informações do relatório
  - mas os botões **Fechar / Baixar PDF / Compartilhar** ficam sempre acessíveis.

### 3) Melhorias de usabilidade (rápidas)
- Adicionar um botão de fechar (X) no header (além do clique no backdrop).
- Opcional: reduzir a densidade visual em telas pequenas (ex.: diminuir tamanho de fonte nos bullets longos).

## Arquivo(s) a alterar
- [HistoryList.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/HistoryList.js) (somente CSS/Tailwind do modal e pequena estrutura `flex`).

## Validação
- Abrir relatório mensal com IA (texto longo).
- Confirmar:
  - o modal não ocupa mais que a tela
  - dá para rolar o conteúdo
  - os botões no rodapé ficam sempre clicáveis
  - o clique fora fecha e o botão X fecha.
