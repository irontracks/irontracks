/**
 * A versão PÚBLICA do app — a mesma que aparece na App Store.
 *
 * A tela de login exibia o literal `'v1.0'` enquanto a loja servia a **1.21**:
 * ficou 21 releases parada porque era um número digitado à mão, num arquivo que
 * ninguém abre ao publicar. Conferido em 27/08/2026 contra a API da Apple
 * (`itunes.apple.com/lookup`), que devolveu `version: 1.21`.
 *
 * A verdade do iOS é o `MARKETING_VERSION` do `project.pbxproj`, e é ele que o
 * dono bumpa antes de um release. Aqui a constante ESPELHA aquele valor, e um
 * guard compara os dois: bumpar o iOS e esquecer a web vira CI vermelho, em vez
 * de virar um número errado na cara de quem abre o app.
 *
 * ⚠️ NÃO leia `NEXT_PUBLIC_APP_VERSION` aqui. A primeira versão desta função
 * dava precedência a ela por parecer "mais fresca", e o resultado foi imediato
 * em produção: a tela de login passou a exibir **"v6dc5e30d"**. Aquela variável
 * é o BUSTER DE CACHE do service worker — na Vercel ela recebe o SHA do commit
 * (`VERCEL_GIT_COMMIT_SHA`), que muda a cada deploy justamente porque o cache
 * precisa mudar. Ela nunca foi a versão pública, e trocar "v1.0" por um hash é
 * piorar: o número errado ao menos era legível.
 *
 * A versão pública tem UMA fonte, e é a mesma que a App Store publica.
 */
export const APP_VERSION = '1.21'

/** Como a versão é ESCRITA na interface. */
export const appVersionLabel = () => `v${APP_VERSION}`
