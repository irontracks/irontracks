# Mapa muscular 3D — integração local (08/09/2026)

## Escopo

Mapa do dashboard: opção 3D sob demanda, recebendo `state.data.muscles` completo. O modo 2D mantém o filtro original por vista; o 3D precisa receber frente e costas ao mesmo tempo. Intensidades, seleção e deduplicação usam diretamente `overlays.ts`. Nenhuma fórmula de treino foi alterada.

O seletor de regiões mantém acesso aos detalhes. Falhas no módulo, modelo ou texturas retornam ao 2D com aviso. Modelo feminino permanece 2D, assim como relatórios e Stories. Não há nova API, migration, alteração de auth, middleware ou pagamentos.

## Dependências e desempenho

- `@google/model-viewer` 4.1.0 e peer obrigatório `three` 0.172.0.
- Importação dinâmica apenas ao montar o 3D, que começa desligado.
- GLB: 5.884.544 bytes (4.550.127 gzip medidos localmente). Exportação sem Draco evita exigir WebAssembly bloqueado pela CSP atual. Nenhuma proteção foi relaxada.
- Camadas RGBA 2048² carregadas apenas para os músculos ativos; cache por montagem e descarte ao sair do 3D.
- Analisador de bundle: chunk principal do model-viewer 403.224 bytes / 129.242 gzip, não inicial. Esse número não inclui todos os chunks compartilhados do motor gráfico nem assets.

## Verificação concluída

- TypeScript: zero erros.
- ESLint: zero warnings nos arquivos de produção e nos testes novos (estes com `--no-ignore`, pois a configuração do projeto exclui testes).
- Unitários: 730 arquivos, 7.891 testes aprovados; 12 testes novos cobrem a escala, seleção, ombro compartilhado, frente/costas, período vazio, assets e fallback.
- Build de produção e `npm run analyze`: aprovados.
- Scan de segredos: nenhum segredo crítico; aviso preexistente em QueryProvider sobre `NODE_ENV`.
- Servidor de produção local em localhost:3007: tela de login correta e GLB retorna HTTP 200 `model/gltf-binary`.
- Componente React real, em harness isolado com dados explicitamente sintéticos: peitoral a 100%, dorsais a 50%, panturrilhas a 10%, mudança frente/costas e limpeza das cores sem remontar a malha conferidos visualmente. Telemetria do harness usa a interface Sentry de navegador; o app mantém @sentry/nextjs.

## Correção CSP após validação autenticada

O teste isolado não reproduzia a CSP do dashboard. Model Viewer importava estaticamente Meshopt, que inicializava WASM mesmo sem uso; o GLTFLoader também fazia fetch da textura embutida via blob:, fora do connect-src permitido.

Corrigido sem mudar CSP: alias exato de Webpack para Meshopt não suportado e textura externa `reference-atlas.png` no mesmo domínio. O GLB deixou de duplicar os bytes do atlas; `scripts/prepare-muscle-glb.mjs` reproduz essa conversão após exportar no Blender. O tamanho de GLB informado acima se refere à versão anterior embutida.

Novo build aprovado, 731 arquivos / 7.894 testes, testes específicos contra importação WASM e textura embutida. Dashboard autenticado recarregado e 3D aberto com dados reais sob CSP de produção; nenhuma nova ocorrência de WebAssembly ou falha de textura após as duas correções. Erros históricos continuam no console da aba. Política de segurança e middleware intactos.

## Pendências antes de publicação

- Validar a troca dos dois períodos no dashboard autenticado (a semana já foi inspecionada com dados reais).
- Teste de toque/pinça em aparelho físico e inspeção visual de todas as regiões.
- PR, CI e publicação não executados nesta etapa.
- `npm audit` aponta uma vulnerabilidade moderada preexistente de @xmldom/xmldom, não introduzida pelo visualizador. Não houve atualização fora do escopo.
