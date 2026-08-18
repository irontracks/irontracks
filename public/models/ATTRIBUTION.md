# body-map.glb — atribuição e licença

O modelo `body-map.glb` é uma **obra derivada** do projeto
[Z-Anatomy](https://www.z-anatomy.com/), que por sua vez deriva do
[BodyParts3D](https://lifesciencedb.jp/bp3d/) (Database Center for Life Science).

- **Licença:** [Creative Commons Atribuição-CompartilhaIgual 4.0 Internacional (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/)
- **Fonte:** https://github.com/Z-Anatomy/Models-of-human-anatomy
- **Derivado por:** IronTracks, via `scripts/muscle-map-3d/build-glb.py`

## O que foi alterado em relação ao original

1. Selecionados 43 músculos superficiais e agrupados nos 15 grupos de treino do
   app (ver `scripts/muscle-map-3d/muscle-groups.json`).
2. A superfície corporal foi **fatiada em regiões**: cada face do manequim é
   atribuída ao grupo muscular mais próximo. As malhas musculares originais
   servem só como referência e **não** entram no arquivo final.
3. Removidos do manequim: rótulos de texto, cabelo/pelos e a região genital
   (as bordas abertas foram fechadas).
4. Malhas decimadas, unidas por grupo, normalizadas para 1,0 de altura e
   exportadas em glTF binário com compressão Draco.

## Obrigações que esta licença impõe ao IronTracks

- **Atribuição:** o crédito "Z-Anatomy · CC BY-SA 4.0" aparece no rodapé do card
  do mapa muscular sempre que o modo 3D está em uso.
- **CompartilhaIgual:** este arquivo derivado é distribuído sob a **mesma**
  licença CC BY-SA 4.0. Ele está versionado neste repositório público.

⚠️ O CompartilhaIgual alcança o MODELO, não o código do aplicativo.
