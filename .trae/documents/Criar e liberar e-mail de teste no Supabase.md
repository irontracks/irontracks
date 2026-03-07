## Resposta (impacto na revisão da Apple)

* **Pode afetar**, porque o app iOS de vocês carrega o site remoto (Capacitor). Se você publicar mudanças na Vercel durante a fila/execução da revisão, o revisor pode ver o comportamento novo.

* **Mas este ajuste é de PWA/Service Worker** (cache). Em geral é **baixo risco** para a Apple Review, porque não mexe em login/Sign in with Apple nem em permissões; só evita cache errado do dashboard.

* Se você quiser “risco zero”, faça a correção **depois que a Apple aprovar**. Se o PWA estiver atrapalhando usuários agora, dá para corrigir já — só precisa testar bem antes de publicar.

## Diagnóstico (por que o PWA parece “deslogar”)

* O Service Worker está **pré-cacheando** **`/dashboard`** e cacheando navegações HTML. Isso pode salvar um **redirect deslogado** e, ao reabrir o PWA, ele serve essa versão cacheada.

* Arquivo: [sw.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20\(trae\)/App%20IronTracks/public/sw.js#L15-L26)

## Plano de correção (mudança pequena e segura)

1. Em [sw.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20\(trae\)/App%20IronTracks/public/sw.js):

   * Remover `/dashboard` do `cache.addAll([...])`.

   * Atualizar `SHOULD_CACHE` para **NÃO cachear** rotas autenticadas, por exemplo:

     * `/dashboard` e tudo que começa com `/dashboard/`

     * `/auth/` e `/wait-approval`

   * (Recomendado) trocar `CACHE_NAME` para `irontracks-sw-v2` para forçar limpeza.
2. Validar localmente:

   * Instalar PWA → logar → fechar → reabrir.

   * Testar com rede lenta/offline (o bug aparece mais nesses cenários).
3. Publicar na Vercel quando estiver validado.

## Validação para não “ferrar” a Apple Review

* Antes de publicar, testar 5 minutos no `https://app-iron-tracks.vercel.app`:

  * Login Apple e login por e-mail funcionam.

  * Reabrir o PWA não volta para tela de login indevidamente.

* Se o status no App Store Connect estiver **Em revisão**, eu recomendo segurar o deploy até mudar para **Aprovado** (ou até eles pedirem algo novo).

