## Diagnóstico
- O padrão “aparece rápido e some” é típico de mismatch entre o HTML do primeiro paint e o que o React hidrata depois; o React descarta o markup inicial e re-renderiza.
- Hoje, o `StudentDashboard` sempre renderiza 3 botões (Treinos/Avaliações/Comunidade) em [StudentDashboard.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard.tsx). Logo, se ele some pós-hidratação, o problema é o processo de hidratação/recovery, não “falta do botão no JSX”.

## Correção (pivot)
- Tornar a barra de abas determinística na hidratação: renderizar um placeholder no SSR/primeiro render e só desenhar os 3 botões após `useEffect` (mounted=true).
- Isso remove o “flash” e impede que o React regenere/descarte exatamente esse trecho, mantendo a UI estável.
- Mudança mínima, só em [StudentDashboard.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard.tsx), sem criar arquivos.

## Validação
- Abrir /dashboard e dar hard reload: o botão Comunidade não pode mais “piscar e sumir”; deve aparecer estável logo após a hidratação.
- Confirmar no DOM e visualmente que existem 3 botões e que clicar em “Comunidade” mostra o conteúdo (`CommunityClient embedded`).
- Se ainda ocorrer sumiço, a próxima camada é tornar o `StudentDashboard` inteiro client-only via dynamic import `ssr:false` no [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js) para eliminar SSR/hydration nesse subtree.
