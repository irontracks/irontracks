# Mapa muscular 3D

Modelo v1 derivado de GEO-body_male_realistic do bundle oficial Blender Human Base Meshes (CC0), ajustado à silhueta das imagens IronTracks. Fonte: https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.0.0.zip

Imagens e overlays originais IronTracks preservados. Textura emissiva com iluminação incorporada; 120 mil triângulos, atlas 2048². GLB sem Draco para respeitar a CSP de produção sem liberar WebAssembly. As laterais são reconstruídas, não capturadas por uma fotografia lateral.

As camadas musculares foram projetadas sobre as UVs da mesma malha. `src/lib/muscleMap/colors3d.ts` consome diretamente as regras compartilhadas de `overlays.ts`. Não alterar a cor/intensidade nas texturas para representar treinos de exemplo.

Model Viewer 4.1.0: dependência npm, Apache-2.0. Nenhuma chamada a CDN é necessária para carregar os assets.

Fontes editáveis e scripts de geração desta versão: pasta local `~/.codex/visualizations/2026/09/07/01a07c2c-eb95-7890-97a7-34c05310d891/manequim-3d/reference-3d/` (Blender e build_muscle_atlases.py).
