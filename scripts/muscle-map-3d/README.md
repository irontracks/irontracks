# Mapa muscular 3D — como o modelo é gerado

`public/models/body-map.glb` **não é editado à mão**. Ele sai de
`build-glb.py`, um script do Blender que roda sem interface gráfica.

## Pré-requisito: o asset de origem NÃO está neste repo

O modelo deriva do [Z-Anatomy](https://www.z-anatomy.com/) — um `.blend` de
**293 MB**, grande demais para versionar aqui. Baixe antes de rodar:

```bash
curl -sL -o /tmp/Z-Anatomy.zip \
  https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/master/Z-Anatomy.zip
unzip -q /tmp/Z-Anatomy.zip -d /tmp/zanatomy
# -> /tmp/zanatomy/Z-Anatomy/Startup.blend
```

E o Blender: `brew install --cask blender`.

## Gerar o modelo

```bash
blender -b /tmp/zanatomy/Z-Anatomy/Startup.blend -P scripts/muscle-map-3d/build-glb.py -- \
  --map scripts/muscle-map-3d/muscle-groups.json \
  --out public/models/body-map.glb \
  --target-tris 140000
```

Leva de 8 a 10 minutos — a maior parte é juntar os ~4.500 objetos do `.blend`.

## Conferir o resultado

`preview.py` renderiza frente e costas numa imagem só. `--rainbow` dá uma cor
por grupo, que é como se confere a **segmentação**; sem ele, sai na cor do app.

```bash
blender -b -P scripts/muscle-map-3d/preview.py -- --glb public/models/body-map.glb --out /tmp/p.png --rainbow
```

## O que o script decide, e por quê

| decisão | motivo |
|---|---|
| a superfície visível é a **malha do músculo** | região recortada da pele por proximidade não tem forma de músculo — vira mancha |
| a pele do tronco/membros **afunda 22 mm** | vira o corpo escuro por baixo, que preenche os vãos e dá contorno a cada grupo |
| mãos, pés e cabeça **não afundam** | são pele de verdade; 22 mm colapsaria os dedos |
| normais recalculadas antes de afundar | ~250 objetos, parte com faces invertidas: metade do corpo inflava em vez de afundar |
| nomes sem o prefixo `src_` | o app casa malha com grupo **por nome**; `src_chest` seria peitoral que nunca acende |
| nenhuma cor de vértice no GLB | a forma vem da geometria; cor herdada do Z-Anatomy tingiria o músculo por baixo do app |

Guards em `src/components/muscle-map/__tests__/` cobram os três últimos itens —
se um deles voltar, o CI reprova.

## Licença

Obra derivada sob **CC BY-SA 4.0**. Ver `public/models/ATTRIBUTION.md`.
