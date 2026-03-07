Vou aplicar uma solução definitiva para o problema de rolagem no iOS (iPhone), conhecida como "Body Scroll Lock via Position Fixed".

O problema atual é que apenas esconder a barra de rolagem (`overflow: hidden`) não impede que o "fundo" (o site atrás do modal) se mova no iOS, e o código que tenta impedir isso manualmente (ouvindo toques na tela) está bloqueando a rolagem do próprio modal.

**O Plano:**

1.  **Remover o bloqueio manual de toque**: Vou apagar todo o bloco de código complexo que tenta calcular se o dedo está subindo ou descendo. Isso vai destravar a rolagem do modal.
2.  **Travar o Fundo (Nuclear Option)**: Quando o modal abrir, vou forçar o site a ficar `position: fixed`. Isso "congela" o fundo de verdade, impedindo que ele se mova 100%, mas deixa o modal livre para rolar.
    *   O código vai salvar a posição onde você estava, travar a tela, e quando fechar o modal, devolver você exatamente para o mesmo lugar.
3.  **Limpeza**: Manterei apenas o bloqueio de toque na *foto* (para o zoom funcionar), mas liberarei todo o resto do modal.

**Arquivo afetado:**
*   `src/components/StoryComposer.js`

Isso deve resolver tanto o "fundo mexendo" quanto o "modal travado".