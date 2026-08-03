import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Leitura do vídeo composto de volta para a WebView.
 *
 * BUG (print do dono, 03/08/2026): a tela mostrava "Native indisponível
 * (read_output: Load failed ()), usando JS…". O AVFoundation exportava o vídeo com
 * sucesso; o que falhava era ler o arquivo de volta.
 *
 * Causa: o código montava `data:video/mp4;base64,…` e chamava `fetch()` nessa URL.
 * O WebKit recusa `data:` URLs acima de um limite e o fetch morre com o genérico
 * "Load failed ()". Efeito perverso: o caminho RÁPIDO (AVFoundation, 3-8s) caía no
 * LENTO (Canvas, 30-60s) justamente nos clipes maiores, que mais precisam dele.
 *
 * Estes guards são de FONTE porque o alvo é o WKWebView do iOS: `atob`, Blob de
 * vários MB e o limite de `data:` URL não se reproduzem em jsdom, e um teste que
 * "passa" ali não provaria nada sobre o device.
 */
/**
 * Tira comentários antes de procurar os padrões proibidos.
 *
 * Sem isso o guard acusa a própria DOCUMENTAÇÃO da correção: os comentários citam
 * `data:video/mp4;base64` e "Native indisponível" justamente para registrar o que
 * não pode voltar. Guard que briga com o comentário que o explica é ruído — a mesma
 * armadilha já apareceu no guard de ambiente da suíte.
 */
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('leitura do resultado nativo', () => {
  const src = codeOnly(readFileSync('src/utils/native/videoComposer.ts', 'utf8'))

  it('NÃO usa data: URL + fetch para trazer o vídeo de volta', () => {
    // A regressão exata: qualquer volta a esse padrão reintroduz o "Load failed".
    expect(src, 'voltou a montar data: URL para o vídeo').not.toMatch(/data:video\/mp4;base64/)
    expect(src, 'voltou a buscar o resultado via fetch(dataUrl)').not.toMatch(/fetch\(\s*dataUrl\s*\)/)
  })

  it('decodifica direto para Blob', () => {
    expect(src).toMatch(/base64ToBlob\(base64,\s*'video\/mp4'\)/)
    expect(src).toMatch(/const base64ToBlob\s*=/)
  })

  it('a decodificação é feita em blocos', () => {
    // `String.fromCharCode(...bytes)` num arquivo de dezenas de MB estoura a pilha —
    // trocaria "Load failed" por um crash, sem ganhar nada.
    expect(src).toMatch(/CHUNK\s*=\s*32_768|CHUNK\s*=\s*32768/)
    expect(src, 'spread de array gigante na decodificação').not.toMatch(/fromCharCode\(\s*\.\.\./)
  })

  it('a falha de leitura reporta o tamanho, para confirmar a causa em vez de supor', () => {
    expect(src).toMatch(/stage:\s*'read_output',\s*error:\s*msg,\s*base64Bytes/)
  })
})

describe('diagnóstico não vaza para o usuário', () => {
  const composer = codeOnly(readFileSync('src/components/stories/useStoryComposer.ts', 'utf8'))

  it('a mensagem técnica de fallback não é mais exibida na tela', () => {
    // O texto do print. Estágio interno e mensagem do WebKit não dizem nada a quem
    // só quer publicar um story — e ainda apareciam num toast VERDE, de sucesso.
    expect(composer).not.toMatch(/Native indisponível/)
    expect(composer, 'setInfo com detalhe de estágio/erro').not.toMatch(/setInfo\([^)]*d\.stage/)
  })

  it('o fallback vai para o Sentry, onde a informação serve', () => {
    expect(composer).toMatch(/logWarnRemote\(\s*'story\.video\.native-fallback'/)
    // `logWarn` é no-op em produção — seria o mesmo que não reportar.
    expect(composer).toMatch(/base64Bytes: d\.base64Bytes/)
  })

  it('o caminho nativo bem-sucedido segue informando o tempo', () => {
    expect(composer).toMatch(/Render nativo: \$\{/)
  })
})
