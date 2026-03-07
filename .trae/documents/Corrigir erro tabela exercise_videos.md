## Por que não aparece “automaticamente”
- Do jeito que a ferramenta foi desenhada, **ela não cria sugestões sozinha** quando você abre a aba.
- Os treinos/exercícios já existentes **só viram itens para aprovação** quando você manda o sistema gerar, por:
  - **GERAR SUGESTÕES** (1 exercício), ou
  - **BACKFILL (LOTE)** (vários exercícios sem vídeo).
- Motivo: gerar sugestões envolve **custo/quota** (Gemini + YouTube) e pode sugerir vídeos errados; então fica sob seu controle.

## O que deveria acontecer com os treinos já existentes
- Quando você clica **BACKFILL (LOTE)**, ele procura exercícios existentes **sem vídeo** e cria itens `pending` na fila.
- A aba **Vídeos** mostra apenas itens com `status = 'pending'`.

## Checklist rápido (sem mexer em nada no código)
1) Clique em **BACKFILL (LOTE)** com limite 20 (ou 50) e confirme.
2) Espere terminar (pode demorar porque chama APIs).
3) Feche e reabra a aba **VÍDEOS**.
4) Se continuar 0 pendentes, normalmente é um destes casos:
   - Não existem exercícios sem vídeo (ou o vídeo já está preenchido em `exercises.video_url`).
   - A migração não foi aplicada no banco correto (mas você disse que “deu certo”, então provável que foi).
   - Você não está logado como **admin** (a aba existe só para admin e a rota exige admin).

## Melhoria para ficar “automático” do jeito que você imaginou
Eu consigo ajustar para ficar mais intuitivo, sem gerar custo sem querer:
1) Ao abrir a aba VÍDEOS, o sistema faz um **diagnóstico**: “X exercícios sem vídeo encontrados”.
2) Mostra um botão: **“Gerar sugestões para X exercícios (lote)”**.
3) Só roda depois de você confirmar (para não gastar quota).
4) Opcional: permitir “rodar em ciclos” (20→20→20) com barra de progresso.

Se você confirmar este plano, eu implemento essa melhoria e deixo a aba VÍDEOS guiando você automaticamente (com confirmação), e também exibo o contador de exercícios sem vídeo.