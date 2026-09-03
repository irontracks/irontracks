import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, it, expect } from 'vitest'

/**
 * A tela de abertura tem DUAS metades e elas se emendam à vista do usuário:
 * o launch screen NATIVO (storyboard + `Splash.imageset`, desenhado pelo iOS
 * antes de qualquer JS) e o `LoadingScreen` WEB (dentro do WKWebView).
 *
 * Medido em 03/09/2026, gravando o cold start em vídeo a 20 fps: o asset
 * nativo era o placeholder BRANCO do Capacitor (canal azul cravado em 255,
 * `systemBackgroundColor` fixado como `white="1"` no storyboard — nem seguia o
 * dark mode do sistema), e ele ocupava **1,4 segundo** do boot de um app
 * inteiramente dark. O primeiro frame do produto era um flash branco.
 *
 * Estes casos travam as duas metades. O terceiro é o mais importante: ele é de
 * CLASSE, e nasceu de um defeito cometido na própria sessão que escreveu esta
 * correção.
 */

const COMPONENTE = join(__dirname, '..', 'LoadingScreen.tsx')
const ASSETS = join(__dirname, '..', '..', '..', 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset')
const STORYBOARD = join(__dirname, '..', '..', '..', 'ios', 'App', 'App', 'Base.lproj', 'LaunchScreen.storyboard')

const fonte = readFileSync(COMPONENTE, 'utf8')
// Comentário que EXPLICA um padrão proibido não pode ser confundido com o padrão.
const executavel = fonte.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^\s*\/\/.*$/gm, '')
const estilo = executavel.slice(executavel.indexOf('<style>'), executavel.indexOf('</style>'))

describe('a abertura nativa é escura', () => {
    /**
     * Mede o asset como o iOS realmente o mostra: `scaleAspectFill` de uma
     * imagem quadrada numa tela retrato recorta a faixa central horizontal.
     * Olhar o PNG inteiro mediria pixels que ninguém vê.
     */
    it.each(['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])(
        '%s não abre o app com um flash claro',
        async (arquivo) => {
            const img = sharp(join(ASSETS, arquivo))
            const { width = 0, height = 0 } = await img.metadata()
            const visivel = Math.round(width * (440 / 956)) // recorte de um iPhone retrato
            const { data } = await sharp(join(ASSETS, arquivo))
                .removeAlpha()
                .extract({ left: Math.round((width - visivel) / 2), top: 0, width: visivel, height })
                .resize(1, 1, { fit: 'fill' })
                .raw()
                .toBuffer({ resolveWithObject: true })
            const luminancia = (data[0] + data[1] + data[2]) / 3
            // O placeholder do Capacitor media 255. A arte atual mede ~18.
            expect(luminancia, `${arquivo} tem luminância média ${luminancia.toFixed(0)}`).toBeLessThan(60)
        },
    )

    it('o storyboard não pinta o fundo de claro', () => {
        const sb = readFileSync(STORYBOARD, 'utf8')
        const bg = sb.match(/<color key="backgroundColor"[^/]*\/>/)?.[0] ?? ''
        expect(bg, 'o launch screen precisa declarar um fundo').not.toBe('')
        // `systemBackgroundColor` estava fixado como white="1" no próprio arquivo:
        // parecia adaptativo e era branco literal.
        expect(bg).not.toMatch(/systemColor/)
        const canais = [...bg.matchAll(/(red|green|blue|white)="([\d.]+)"/g)].map((m) => Number(m[2]))
        expect(canais.length, `não consegui ler os canais de ${bg}`).toBeGreaterThan(0)
        expect(Math.max(...canais)).toBeLessThan(0.2)
    })
})

describe('a janela do WebView não pisca branco', () => {
    /**
     * A causa RAIZ do flash, e a mais fácil de perder: o WKWebView nasce branco
     * por padrão do sistema, e enquanto ele busca a URL remota não há HTML para
     * pintar por cima. Foi por isso que trocar o launch screen por arte escura
     * não bastou — medido: o branco continuou, os mesmos ~1,9 s.
     *
     * São DOIS arquivos porque só o segundo entra no bundle: o `.ts` é a fonte,
     * e o `.json` é o que `cap copy` gera dentro de `ios/App/App`. Corrigir só a
     * fonte deixa o app instalado exatamente como estava.
     */
    const escuro = (hex: string | undefined) => {
        expect(hex, 'backgroundColor precisa estar declarado').toBeTruthy()
        const n = parseInt((hex as string).replace('#', '').slice(0, 6), 16)
        const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
        expect((r + g + b) / 3, `${hex} é claro demais para abrir um app dark`).toBeLessThan(40)
    }

    it('a fonte declara fundo escuro', () => {
        const cfg = readFileSync(join(__dirname, '..', '..', '..', 'capacitor.config.ts'), 'utf8')
        const semComentario = cfg.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')
        escuro(semComentario.match(/backgroundColor:\s*'(#[0-9a-fA-F]{6})'/)?.[1])
    })

    it('a config que vai NO BUNDLE também declara', () => {
        const json = JSON.parse(
            readFileSync(join(__dirname, '..', '..', '..', 'ios', 'App', 'App', 'capacitor.config.json'), 'utf8'),
        )
        escuro(json.backgroundColor)
        escuro(json.ios?.backgroundColor)
    })
})

describe('a abertura web', () => {
    /**
     * ⚠️ GUARD DE CLASSE — o que mais importa deste arquivo.
     *
     * A entrada do logo nasceu como `style={{ animation: … }}` inline, e
     * atributo inline NÃO é alcançado por media query: o
     * `prefers-reduced-motion` desligava o brilho e a barra e deixava a entrada
     * correndo. Pior, o `opacity: 0` que a animação existia para desfazer
     * deixaria a marca INVISÍVEL para quem pediu menos movimento.
     *
     * Em vez de fixar os três nomes de hoje, este caso extrai toda animação
     * declarada no componente e cobra cobertura de cada uma — animação NOVA
     * sem par no bloco reduzido reprova sozinha.
     */
    it('toda animação é desligada em prefers-reduced-motion', () => {
        const bloco = estilo.slice(estilo.indexOf('@media (prefers-reduced-motion: reduce)'))
        expect(bloco, 'o componente precisa ter um bloco de movimento reduzido').not.toBe('')

        const declaram = [...estilo.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)]
            .filter(([, , corpo]) => /animation\s*:/.test(corpo))
            .map(([, classe]) => classe)
        expect(declaram.length, 'nenhuma animação encontrada — o parser quebrou').toBeGreaterThan(1)

        for (const classe of declaram) {
            const regra = bloco.match(new RegExp(`\\.${classe}\\s*\\{([^}]*)\\}`))?.[1]
            expect(regra, `.${classe} anima e não é desligada em movimento reduzido`).toBeTruthy()
            expect(regra, `.${classe} precisa de animation: none`).toMatch(/animation\s*:\s*none/)
        }
    })

    it('nenhuma animação escapa por style inline', () => {
        // Inline vence media query por especificidade: é assim que a entrada escapou.
        expect(executavel).not.toMatch(/style=\{[^}]*animation/)
    })

    it('quem some no movimento reduzido volta a ficar visível', () => {
        const bloco = estilo.slice(estilo.indexOf('@media (prefers-reduced-motion: reduce)'))
        // A entrada parte de opacity 0; sem a animação para desfazer, some.
        const parteInvisivel = /\.splash-enter\s*\{[^}]*opacity\s*:\s*0/.test(estilo)
        if (parteInvisivel) expect(bloco).toMatch(/\.splash-enter\s*\{[^}]*opacity\s*:\s*1/)
    })

    /**
     * O trilho não promete o que não mede. A barra anterior corria 0→100% numa
     * curva fixa de 1,8s sem consultar o carregamento: em rede ruim cravava
     * 100% e o usuário encarava uma barra cheia até o socorro dos 8s.
     */
    it('o trilho não finge progresso determinado', () => {
        const larguras = [...estilo.matchAll(/@keyframes[^{]*\{([\s\S]*?)\n\s{12}\}/g)]
            .map(([, corpo]) => corpo)
            .filter((corpo) => /width\s*:\s*\d/.test(corpo))
        expect(larguras, 'keyframe animando width volta a inventar progresso').toEqual([])
        expect(estilo, 'a varredura tem que existir').toMatch(/@keyframes splash-sweep/)
    })

    /**
     * O trilho é ancorado em % da caixa do logo, e essa % é derivada do VAZIO
     * que o PNG carrega abaixo da marca. Trocar a arte sem refazer a conta
     * devolve o trilho órfão a ~70px do logotipo — que era o estado anterior.
     */
    it('o trilho continua colado na marca depois de qualquer troca de arte', async () => {
        const png = join(__dirname, '..', '..', '..', 'public', 'logo-irontracks-splash.webp')
        const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        let base = -1
        for (let y = info.height - 1; y >= 0 && base < 0; y--) {
            for (let x = 0; x < info.width; x++) {
                if (data[(y * info.width + x) * info.channels + 3] > 12) { base = y; break }
            }
        }
        const fimDaMarca = (base / info.height) * 100
        const ancora = Number(executavel.match(/top-\[([\d.]+)%\]/)?.[1])
        expect(ancora, 'o trilho precisa de âncora em % da caixa do logo').toBeGreaterThan(0)
        const gap = ancora - fimDaMarca
        expect(gap, `âncora ${ancora}% contra fim da marca em ${fimDaMarca.toFixed(1)}%`).toBeGreaterThan(2)
        expect(gap).toBeLessThan(12)
    })
})
