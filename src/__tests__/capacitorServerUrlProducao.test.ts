/**
 * O `capacitor.config.json` VERSIONADO não pode apontar para máquina de dev.
 *
 * ⚠️ Custou a build 84 (versão 1.21.3), que foi para o TestFlight — e para
 * `WAITING_FOR_REVIEW` na Apple — com `server.url = http://localhost:3010`.
 * Sintoma no aparelho: o app abre e fica numa TELA PRETA. Não é crash e não há
 * erro nenhum: o WKWebView tenta carregar um servidor que não existe no iPhone,
 * nada pinta, e o que sobra é o `backgroundColor` do próprio config (#0a0a0a).
 *
 * O mecanismo não é o `npm run sim:local` — ele reescreve o config DENTRO do
 * bundle já instalado no simulador (`get_app_container`), e por isso o
 * `npm run sim:prod` também não desfaz isto. Quem materializa o localhost no
 * arquivo versionado é um `cap sync`/`cap copy` rodado com
 * `CAPACITOR_SERVER_URL` apontando para local: a FONTE
 * (`capacitor.config.ts`) lê essa env var, e o arquivo gerado entra no build.
 *
 * Ou seja: a fonte estava correta o tempo todo, e mesmo assim o app quebrou.
 * É por isso que o guard olha o ARQUIVO GERADO, e não o `.ts`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = process.cwd()

/** Todo `capacitor.config.json` do repo, exceto dependências e saídas de build. */
function acharConfigs(dir: string, achados: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name.startsWith('.')) continue
    if (['node_modules', 'out', 'build', 'Pods', 'DerivedData'].includes(entrada.name)) continue
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) acharConfigs(caminho, achados)
    else if (entrada.name === 'capacitor.config.json') achados.push(caminho)
  }
  return achados
}

describe('capacitor.config.json versionado aponta para PRODUÇÃO', () => {
  const configs = acharConfigs(RAIZ)

  it('o guard enxerga os configs (não está varrendo o vazio)', () => {
    // iOS e Android. Um terceiro alvo entra aqui sozinho — é guard de classe.
    expect(configs.length).toBeGreaterThanOrEqual(2)
  })

  it.each(configs.map((c) => [c.replace(`${RAIZ}/`, '')] as const))(
    '%s serve o front de https, nunca de uma máquina de dev',
    (relativo) => {
      const json = JSON.parse(readFileSync(join(RAIZ, relativo), 'utf8')) as {
        server?: { url?: unknown }
      }
      const url = String(json.server?.url ?? '')

      expect(url, `${relativo}: server.url vazio — o app não carregaria nada`).not.toBe('')

      // `http://` sem TLS já denuncia dev; em produção o CSP força https em tudo.
      expect(
        url.startsWith('https://'),
        `${relativo}: server.url é "${url}". No aparelho isso abre uma TELA PRETA — ` +
          'o WKWebView não alcança a sua máquina. Rode `npx cap sync` SEM ' +
          'CAPACITOR_SERVER_URL antes de gerar a build.',
      ).toBe(true)

      // localhost/loopback/rede local escapam do teste acima quando alguém usa
      // um túnel https ou um IP com certificado.
      const HOSPEDEIRO_DE_DEV = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\./i
      expect(
        HOSPEDEIRO_DE_DEV.test(url),
        `${relativo}: server.url é "${url}" — endereço de máquina de dev.`,
      ).toBe(false)
    },
  )
})
