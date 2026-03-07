## Objetivo
- Manter o ícone de play como está, mas adicionar uma legenda micro “Vídeo” abaixo do botão para ficar óbvio no mobile, sem poluir.

## Onde ajustar
- O botão de play do treino ativo fica em [ActiveWorkout.js:L985-L1003](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js#L985-L1003).

## Mudança proposta (bem sutil)
- Trocar o conteúdo do botão para um layout vertical:
  - ícone ▶ (mesmo tamanho)
  - texto “Vídeo” em `text-[10px]`, `opacity-60`, `leading-none`, com `mt-0.5`
- Manter:
  - `aria-label="Ver vídeo"`
  - `title="Ver vídeo"`
  - `window.open(videoUrl, '_blank', 'noopener,noreferrer')`

## Ajustes de layout (para não quebrar)
- O botão continua com hit area confortável, mas a legenda fica bem pequena.
- Se ficar alto demais no header do exercício, eu reduzo:
  - `h-9 w-9` → `h-8 w-8`
  - e/ou removo `mt-1` do container direito.

## Validação
- Rodar build.
- Conferir no mobile que o card do exercício mostra o ▶ com “Vídeo” abaixo e que não “salta” o layout.
