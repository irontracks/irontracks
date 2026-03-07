## Resposta direta
- O “Browser” do Trae é um webview baseado em Chromium. Então você limpa o cache **do próprio webview** via DevTools (igual Chrome/Edge), sem precisar abrir navegador externo.

## Plano (passo a passo dentro do Trae)
### 1) Abrir DevTools do Browser do Trae
- Clique dentro da aba do Browser (localhost:3000).
- Tente **Cmd+Opt+I** (macOS) para abrir o DevTools.
- Se não abrir, procure no topo do painel Browser um menu **⋯ / ⚙️** e selecione algo como **Developer Tools / DevTools**.

### 2) Desabilitar cache e recarregar
- DevTools → **Network** → marque **Disable cache**.
- Recarregue a página (Cmd+R). Para forçar, use **Cmd+Shift+R**.

### 3) Limpar storage/caches do site (mais forte)
- DevTools → **Application** → **Storage** → **Clear site data**.
- DevTools → **Application** → **Service Workers** → **Unregister** (se existir) e recarregue.
- DevTools → **Application** → **Cache Storage** → delete caches (se houver).

### 4) Se ainda não atualizar, não é cache do browser
- Pode ser HMR desconectado ou o Next preso. Aí a solução é reiniciar o `npm run dev` e/ou apagar `.next`.

Se você me disser qual atalho/menu aparece aí (ou mandar um print do topo do painel Browser), eu te digo exatamente onde clicar no Trae para abrir o DevTools e limpar tudo.