/**
 * Guard de contraste — as três faixas que NENHUM texto pode usar.
 *
 * Medido em 11/08/2026 sobre o fundo do app (#0a0a0a), com a fórmula do WCAG 2.1:
 *
 *   text-neutral-400  #a3a3a3   7.85:1   passa
 *   text-neutral-500  #737373   4.18:1   falha AA (mínimo 4.5)
 *   text-neutral-600  #525252   2.53:1   falha
 *   text-neutral-700  #404040   1.91:1   falha — e falha até o mínimo de 3:1 de UI
 *   text-neutral-800  #262626   1.31:1   falha
 *
 * O guard nasceu travando só 700 e 800, onde não há discussão: 1.9:1 e 1.3:1 são
 * ilegíveis em qualquer tamanho. Foi onde estavam os piores casos da auditoria —
 * inclusive uma instrução de uso ("cm · toque para destacar") em 8px e 1.31:1,
 * ou seja, invisível. `600` (2.53:1) segue fora só porque o app não usa; se
 * alguém introduzir, some para cá.
 *
 * ⚠️ Esta nota dizia que `neutral-500` ficava de fora porque "parte é texto
 * grande, que passa com 3:1". **Isso foi MEDIDO depois e é falso**: das 380
 * ocorrências do app, classificadas uma a uma pelo tamanho de fonte declarado
 * na própria `className`, o número de textos grandes deu **ZERO**. Não havia
 * exceção legítima — só volume. A varredura foi feita em quatro lotes
 * (dashboard, treino, telas do usuário, administrativas) e hoje o app tem zero
 * ocorrências, então a faixa 500 entrou no guard junto com as outras.
 *
 * Fica o registro do padrão: a suposição confortável ("deve ter caso legítimo")
 * durou até alguém contar. Contar custou um script de vinte linhas.
 *
 * EXCEÇÕES cobrem o que o WCAG isenta: controle desabilitado e ícone puramente
 * decorativo. A lista só encolhe.
 */
import { describe, it, expect } from 'vitest'
// `readdirSync(..., { recursive: true })` e NÃO `globSync`: este último só
// existe a partir do Node 22, e o CI roda Node 20 — passou local e reprovou lá.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')

/**
 * Arquivos onde as faixas proibidas ainda aparecem por motivo legítimo.
 * Cada entrada precisa de razão escrita. **A lista só encolhe.**
 */
const EXCECOES: Record<string, string> = {
  'components/workout/set-renderers/normalSet.tsx':
    'placeholder é a SUGESTÃO do plano/motor de carga, não um exemplo: clarear faz ' +
    'passar por valor já digitado, no campo do peso. Guard próprio: valorVsSugestao.',
  'components/settings/SettingsSections.tsx':
    'o "Ex.: Smart Fit" do nome da academia — exemplo que, mais claro, é lido como ' +
    'resposta já preenchida. Guard próprio: gymGeofenceName.',
  'components/workout/Modals.tsx': 'botão desabilitado — WCAG 1.4.3 isenta controle inativo',
  'components/workout/WorkoutHeader.tsx': 'estado cursor-not-allowed',
  'components/ProgressPhotos.tsx': 'ícone decorativo de estado vazio',
  'components/admin-panel/StudentProfileTab.tsx': 'ícone decorativo de estado vazio',
  'components/admin-panel/TeachersTab.tsx': 'ícone decorativo de estado vazio',
  'components/admin-panel/VipTab.tsx': 'ícone decorativo de estado vazio',
  'components/admin/RequestsTab.tsx': 'ícone decorativo de estado vazio',
  'components/body-photo/BodyPhotoHistoryModal.tsx': 'ícone de imagem ausente',
  'components/dashboard/IronRankCard.tsx': 'ícone decorativo em linha de PR',
}

/**
 * As faixas reprovadas em TEXTO. `500` entrou em 11/08/2026, depois da
 * varredura que zerou as 380 ocorrências — antes dela, travar aqui só produziria
 * um teste vermelho que alguém afrouxaria.
 *
 * ⚠️ `600` entrou em 26/08/2026, e o motivo é constrangedor: o cabeçalho deste
 * arquivo SEMPRE documentou que ele mede 2.53:1 e falha — e a regex listava
 * 500, 700 e 800. A faixa mais citada na documentação do guard era a única que
 * ele não proibia. Eram 62 ocorrências, e entre elas o aviso "suas fotos ficam
 * privadas" e o texto do card de exames: os dois textos que mais precisam ser
 * lidos, nos menores contrastes da tela. 33 viraram `neutral-400` na mesma
 * varredura.
 *
 * O lookbehind isenta os prefixos que têm regra PRÓPRIA, e cada um por um
 * motivo diferente — colapsar os três num só critério é que produz guard
 * falso: `disabled:` é isento pelo WCAG 1.4.3 (controle inativo), `hover:` é
 * estado transitório que nem existe no celular, e `placeholder:` é texto de
 * dica, que merece frente própria (9 ocorrências, ver o ratchet abaixo).
 */
/**
 * O lookbehind `(?<![:\w-])` existe para deixar passar VARIANTE de estado —
 * `hover:`, `focus:` —, que é transitória e no celular nem acontece. Só que ele
 * deixava passar `placeholder:` junto, e placeholder NÃO é estado: é o texto
 * que fica na tela até a pessoa digitar, dizendo o que ela deve digitar.
 *
 * Eram 9 campos com `placeholder:text-neutral-600`, medido a **2,53:1** sobre a
 * base e **2,23:1** sobre o depth-3 — menos da metade do mínimo do AA. Entre
 * eles o e-mail e a senha do login, e os campos do onboarding.
 *
 * ⚠️ DOIS campos ficam de fora, e não por descuido: onde o placeholder não é
 * DICA e sim SUGESTÃO — um valor que o app propõe e a pessoa pode aceitar sem
 * digitar —, clarear faz ele passar por conteúdo já preenchido. Nos campos de
 * série (`normalSet`) isso significaria registrar a carga sugerida pelo motor
 * como se fosse a levantada; no nome da academia, um exemplo virando resposta.
 * Os dois foram escurecidos DE PROPÓSITO em ago/2026, com guard próprio
 * (`valorVsSugestao`, `gymGeofenceName`) — que foi quem pegou a tentativa de
 * clarear os dois junto com os outros sete.
 *
 * A régua, então, é o PAPEL do placeholder, não o seletor: exemplo se lê,
 * sugestão se distingue.
 */
const PROIBIDAS = /(?<![:\w-])text-neutral-(500|600|700|800)\b|placeholder:text-neutral-(500|600|700|800)\b/

/**
 * Branco com opacidade — a MESMA falha, escrita com outra sintaxe.
 *
 * O guard acima proibia `neutral-500` (4.18:1) e deixava passar
 * `text-white/40`, que mede **3.75:1** — pior. Não por decisão: por sintaxe.
 * Eram 54 ocorrências em 12 arquivos, todas em `<p>`/`<span>` de texto real
 * (varridas em 12/08/2026), incluindo o Heat Map do VIP e o painel de cardio.
 *
 * Branco sobre `#0a0a0a`, medido: `/40` = 3.75:1 · `/45` = 4.39:1 ·
 * `/50` = 5.15:1. O corte fica em **50**, e o repo padronizou `/55` — a mesma
 * escolha feita no card Equilíbrio Muscular.
 *
 * O `hover:`/`group-hover:` fica de fora de propósito: é estado transitório de
 * ponteiro, e no celular nem existe. O que precisa passar é o repouso.
 */
const BRANCO_FRACO = /(?<!hover:)\btext-white\/(?:[0-4]?[0-9])\b/

/** Exceções do branco fraco. Vazia — a varredura de 12/08/2026 zerou o débito. */
const EXCECOES_BRANCO: Record<string, string> = {}

/**
 * Ícone, não texto — e a diferença importa: o WCAG pede 4.5:1 de TEXTO, 3:1 de
 * objeto gráfico, e ISENTA o gráfico puramente decorativo (`aria-hidden`).
 *
 * A marca de ícone aqui é a tag AUTO-FECHADA: `<ChevronRight className="…" />`
 * é componente, `<p className="…">texto</p>` não é. Foi medido nas 62
 * ocorrências de `neutral-600` de 26/08/2026 — os 17 ícones eram todos
 * auto-fechados e nenhum texto real era.
 *
 * ⚠️ O limite: um componente auto-fechado que RENDERIZE texto passaria batido.
 * Não há caso assim hoje, e a alternativa — 16 exceções por arquivo — vira
 * papel de parede na primeira semana. Se aparecer, registre em `EXCECOES`.
 */
const ehIcone = (linha: string): boolean => /\/>\s*\}?\s*$|aria-hidden="true"/.test(linha.trim())

const arquivos = readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.tsx') && !f.includes('__tests__'))
  // Windows devolve '\' — normaliza para casar com as chaves de EXCECOES.
  .map((f) => f.split('\\').join('/'))

describe('contraste mínimo de texto', () => {
  it('nenhum arquivo novo usa as faixas reprovadas em texto', () => {
    const infratores: string[] = []
    for (const rel of arquivos) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      if (!PROIBIDAS.test(src)) continue
      if (EXCECOES[rel]) continue
      if (src.split('\n').some((linha) => PROIBIDAS.test(linha) && !ehIcone(linha))) infratores.push(rel)
    }
    expect(
      infratores,
      'Sobre #0a0a0a: neutral-500 mede 4.18:1 (reprova o mínimo de 4.5), ' +
        'neutral-700 mede 1.91:1 e neutral-800 mede 1.31:1. Use neutral-400 ' +
        '(7.85:1), ou registre a exceção com o motivo se for controle ' +
        'desabilitado ou ícone puramente decorativo.',
    ).toEqual([])
  })

  it('branco com opacidade não escapa pela sintaxe', () => {
    const infratores = arquivos.filter((rel) => {
      if (EXCECOES_BRANCO[rel]) return false
      return BRANCO_FRACO.test(readFileSync(join(ROOT, rel), 'utf8'))
    })
    expect(
      infratores,
      'Sobre #0a0a0a, text-white/40 mede 3.75:1 e /30 mede 2.36:1 — abaixo do ' +
        'mínimo de 4.5 do WCAG AA, e piores que o neutral-500 que este mesmo ' +
        'guard já proíbe. Use text-white/55 (5.9:1) ou mais.',
    ).toEqual([])
  })

  it('a allowlist não guarda entrada morta — ela só encolhe', () => {
    const mortas = Object.keys(EXCECOES).filter((rel) => {
      try {
        return !PROIBIDAS.test(readFileSync(join(ROOT, rel), 'utf8'))
      } catch {
        return true
      }
    })
    expect(mortas, 'já não usam faixa reprovada — remova da lista').toEqual([])
  })
})
