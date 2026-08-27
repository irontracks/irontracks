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
 * `NEXT_PUBLIC_APP_VERSION` tem precedência quando existe — é o que o service
 * worker já usa para invalidar cache —, mas ela não pode ser a única fonte: o
 * app nativo carrega o front do servidor, e uma env ausente devolveria o
 * fallback silenciosamente. Foi assim que a IA inteira quase dependeu de uma
 * variável não estar faltando (ver "Qual modelo Gemini o app usa").
 */
export const APP_VERSION = '1.21'

/** Como a versão é ESCRITA na interface. */
export const appVersionLabel = () =>
  `v${String(process.env.NEXT_PUBLIC_APP_VERSION || APP_VERSION).replace(/^v/, '')}`
