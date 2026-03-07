Vou alterar a lógica de interação com a foto para atender exatamente ao que você pediu:

1.  **1 Dedo = Rolar o Modal**: Vou liberar o gesto de um dedo para que ele não mexa mais na foto, permitindo que a rolagem da página/modal funcione naturalmente.
2.  **2 Dedos = Zoom e Mover Foto**: Vou unificar os gestos de dois dedos para controlar tanto o zoom (pinça) quanto a posição (arrastar) da foto ao mesmo tempo.

**Alterações Técnicas:**
*   **CSS**: Trocar `touch-none` por `touch-pan-y` no container da foto. Isso diz ao navegador: "Deixe o usuário rolar verticalmente com um dedo, mas me deixe controlar os gestos horizontais ou complexos (2 dedos)".
*   **JavaScript (StoryComposer.js)**:
    *   Reescrever `onPointerMove` para ignorar totalmente quando houver apenas 1 toque (passando o controle para o scroll nativo).
    *   Implementar lógica de "Pan & Zoom" simultâneos quando houver 2 toques.

Isso resolve o conflito e mantém a usabilidade segura. Posso aplicar?