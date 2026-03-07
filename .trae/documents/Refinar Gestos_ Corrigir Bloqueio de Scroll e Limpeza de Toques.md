Vou refinar o controle de gestos para garantir que 1 dedo **realmente** seja ignorado pela foto e permita o scroll da página.

**Ações:**
1.  **Remover Captura de Ponteiro no 1º Toque:** O código atual "prende" o toque na foto assim que você encosta 1 dedo (`setPointerCapture`), o que mata o scroll da página. Vou mudar para capturar **apenas** quando o segundo dedo tocar.
2.  **Proteção contra "Dedos Fantasmas":** Vou adicionar tratamentos para `onPointerCancel` e `onPointerLeave`. Isso evita que, se você rolar a página e tirar o dedo, o sistema ache que o dedo ainda está lá (o que faria o próximo toque de 1 dedo parecer ser o "segundo" dedo, ativando o zoom incorretamente).

Isso deve devolver totalmente o controle de scroll para 1 dedo e deixar a foto inerte até que 2 dedos entrem em cena.