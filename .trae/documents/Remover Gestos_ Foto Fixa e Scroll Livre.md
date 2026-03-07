Entendido. Vamos simplificar radicalmente para garantir a usabilidade.

**Plano Definitivo (Foto Fixa):**
1.  **Remover toda a lógica de gestos:** Vou apagar os `onPointerDown`, `onPointerMove`, `onPointerUp`, etc.
2.  **Fixar a foto:** A foto ficará estática (`fit: cover`), centralizada automaticamente.
3.  **Garantir o Scroll:** Sem os event listeners, o navegador tratará a área da foto como qualquer outra `div`, permitindo o scroll nativo 100% das vezes sem conflitos.
4.  **Remover Aviso:** Tirar o texto "Arraste para ajustar" já que não será mais possível.

Vou executar essa limpeza agora. É a solução mais segura para evitar frustração no uso móvel.