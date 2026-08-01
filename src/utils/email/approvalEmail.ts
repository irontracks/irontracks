/**
 * E-mail que o usuário recebe quando o acesso é aprovado.
 *
 * É o único contato do produto com quem esperou aprovação — a tela
 * `/wait-approval` promete literalmente "Aguarde o e-mail de aprovação". Se ele
 * não chega, ou chega quebrado, a pessoa fica presa sem saber que já pode
 * entrar.
 *
 * Montagem PURA de propósito: sem rede, sem banco. O que quebra num e-mail
 * (nome com caractere especial, ausência de versão texto, link errado) dá para
 * travar em teste sem enviar nada.
 *
 * ⚠️ `name` vem de `access_requests.full_name`, preenchido por FORMULÁRIO
 * PÚBLICO. Ia cru para dentro do HTML — daí o escape obrigatório aqui.
 */

import { escapeHtml } from '@/utils/escapeHtml'

export const APP_URL = 'https://irontracks.com.br'
/**
 * Quem responde a um `noreply@` precisa cair em algum lugar. Este é o endereço
 * que os Termos de Uso publicam como canal oficial (`/terms`) — não é um
 * palpite; se mudar lá, muda aqui.
 */
export const SUPPORT_EMAIL = 'irontrackscompany@gmail.com'

/** Nome longo demais quebra o layout no cliente de e-mail. */
const MAX_NAME = 60

export interface ApprovalEmailInput {
    /** Nome do usuário, como veio da solicitação. */
    name?: string | null
    /**
     * `true` quando a conta já existia (a pessoa se cadastrou e ficou esperando).
     * É o caso de 25 das 27 aprovações reais — ela só precisa entrar.
     * `false` quando foi aprovada antes de existir conta: precisa criar.
     */
    accountExisted: boolean
}

export interface BuiltEmail {
    subject: string
    html: string
    text: string
}

/** Primeiro nome, limpo e limitado. Vazio vira "Atleta". */
export function firstName(raw?: string | null): string {
    const full = String(raw ?? '').replace(/\s+/g, ' ').trim()
    if (!full) return 'Atleta'
    return full.split(' ')[0].slice(0, MAX_NAME)
}


// ── Identidade visual ────────────────────────────────────────────────────────
// Espelha a marca do app (`LoginScreen`): "IRON" branco + "TRACKS" amarelo sobre
// fundo quase preto. O app usa gradiente no "TRACKS"; aqui é amarelo sólido —
// `background-clip:text` não sobrevive ao Gmail nem ao Outlook.
const BG = '#0a0a0a'
const CARD = '#141414'
const LINE = '#262626'
const GOLD = '#facc15'
const AMBER = '#f59e0b'
const MUTED = '#a3a3a3'
const FAINT = '#525252'
/** Rodapé: `FAINT` puro fica ilegível em fundo escuro no celular. */
const FOOT = '#7a7a7a'
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`

/** Cabeçalho da marca — igual nos dois e-mails. */
function brandHeader(): string {
    return `
          <tr><td align="center" style="padding:36px 28px 8px">
            <div style="font-family:${FONT};font-size:26px;font-weight:900;letter-spacing:.06em;color:#ffffff;line-height:1">
              IRON<span style="color:${GOLD}">TRACKS</span>
            </div>
            <div style="font-family:${FONT};font-size:9px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:${FAINT};padding-top:8px">
              Sistema de Alta Performance
            </div>
          </td></tr>`
}

/** Rodapé — igual nos dois e-mails. */
function brandFooter(extra: string): string {
    return `
          <tr><td style="padding:0 28px 32px">
            <div style="border-top:1px solid ${LINE};padding-top:18px;font-family:${FONT};font-size:11.5px;line-height:1.75;color:${FOOT}">
              ${extra}
              Dúvidas? Responda este e-mail ou escreva para
              <a href="mailto:${SUPPORT_EMAIL}" style="color:${MUTED};text-decoration:underline">${escapeHtml(SUPPORT_EMAIL)}</a>.
            </div>
          </td></tr>`
}

/**
 * Botão "à prova de balas": o Outlook no Windows ignora padding em <a>, então o
 * bloco VML desenha o retângulo lá. Fora do Outlook, o comentário condicional é
 * invisível e vale o <a> normal.
 */
function button(label: string, href: string): string {
    return `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                href="${href}" style="height:52px;v-text-anchor:middle;width:280px" arcsize="20%" stroke="f" fillcolor="${GOLD}">
                <w:anchorlock/>
                <center style="color:#0a0a0a;font-family:${FONT};font-size:15px;font-weight:bold">${escapeHtml(label)}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${href}" target="_blank" rel="noreferrer"
                 style="display:inline-block;background:${GOLD};background-image:linear-gradient(90deg,${GOLD},${AMBER});color:#0a0a0a;font-family:${FONT};font-size:15px;font-weight:800;letter-spacing:.02em;text-decoration:none;padding:16px 40px;border-radius:12px;mso-hide:all">${escapeHtml(label)}</a>
              <!--<![endif]-->
            </td></tr></table>`
}

/** Envelope comum: reset de cliente, fundo, card centralizado e largura máxima. */
function shell(preheader: string, inner: string): string {
    return `<!doctype html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:${BG};-webkit-font-smoothing:antialiased">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG}">
    <tr><td align="center" style="padding:28px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${CARD};border:1px solid ${LINE};border-radius:20px;overflow:hidden">
        <tr><td style="height:4px;background:${GOLD};line-height:4px;font-size:0">&nbsp;</td></tr>
${inner}
      </table>
      <div style="font-family:${FONT};font-size:10px;color:#4a4a4a;padding:18px 0 0">IronTracks · Treino sério, resultado medido</div>
    </td></tr>
  </table>
</body>
</html>`
}

export function buildApprovalEmail(input: ApprovalEmailInput): BuiltEmail {
    const name = firstName(input?.name)
    const safeName = escapeHtml(name)

    const subject = 'Seu acesso ao IronTracks foi aprovado'

    // O que a pessoa precisa FAZER muda com o caso; o resto do e-mail não.
    const lead = input.accountExisted
        ? 'Seu acesso foi liberado. É só entrar com o mesmo e-mail e senha que você já cadastrou.'
        : 'Seu acesso foi liberado. Abra o IronTracks e crie sua conta com este mesmo e-mail para começar.'
    const cta = input.accountExisted ? 'Entrar no IronTracks' : 'Criar minha conta'
    const preheader = input.accountExisted
        ? 'Tudo pronto — entre com seu e-mail e senha.'
        : 'Tudo pronto — crie sua conta e comece a treinar.'

    // Três passos concretos. Chegar num app cheio sem saber por onde começar é o
    // que faz a pessoa fechar e não voltar.
    const steps: Array<[string, string]> = [
        ['Monte seu treino', 'Crie do zero ou peça para a IA montar a partir do seu objetivo.'],
        ['Registre cada série', 'Carga, repetições e RPE — é o que alimenta a progressão automática.'],
        ['Acompanhe a evolução', 'Relatórios, mapa muscular e avaliação por foto.'],
    ]

    const stepsHtml = steps.map(([title, desc], i) => `
              <tr>
                <td width="34" valign="top" style="padding:0 0 16px">
                  <div style="width:24px;height:24px;border-radius:12px;background:rgba(250,204,21,.12);border:1px solid rgba(250,204,21,.3);color:${GOLD};font-family:${FONT};font-size:11px;font-weight:800;text-align:center;line-height:24px">${i + 1}</div>
                </td>
                <td valign="top" style="padding:0 0 16px;font-family:${FONT}">
                  <div style="font-size:14px;font-weight:700;color:#ffffff;line-height:1.4">${escapeHtml(title)}</div>
                  <div style="font-size:13px;color:${MUTED};line-height:1.5;padding-top:2px">${escapeHtml(desc)}</div>
                </td>
              </tr>`).join('')

    const inner = `${brandHeader()}
          <tr><td align="center" style="padding:22px 28px 0">
            <div style="display:inline-block;background:rgba(250,204,21,.1);border:1px solid rgba(250,204,21,.28);border-radius:999px;padding:7px 16px;font-family:${FONT};font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:${GOLD}">
              Acesso aprovado
            </div>
          </td></tr>
          <tr><td align="center" style="padding:18px 28px 0;font-family:${FONT}">
            <div style="font-size:27px;font-weight:900;color:#ffffff;line-height:1.25;letter-spacing:-.01em">Bem-vindo, ${safeName}!</div>
            <div style="font-size:15px;color:${MUTED};line-height:1.6;padding:12px 0 0">${escapeHtml(lead)}</div>
          </td></tr>
          <tr><td style="padding:26px 28px 0">${button(cta, APP_URL)}</td></tr>
          <tr><td style="padding:30px 28px 4px">
            <div style="font-family:${FONT};font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:${FAINT};padding-bottom:16px">Por onde começar</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${stepsHtml}</table>
          </td></tr>
${brandFooter(`Se o botão não abrir, use este endereço:
              <a href="${APP_URL}" style="color:${MUTED};text-decoration:underline">${APP_URL}</a>.<br>
              Se você não solicitou acesso ao IronTracks, ignore esta mensagem.<br><br>`)}`

    // Versão texto: autossuficiente, não um resumo do HTML. Exigida por bons
    // filtros de spam e é o que alguns clientes mostram.
    const text = [
        `IRONTRACKS — Sistema de Alta Performance`,
        '',
        `Bem-vindo, ${name}! Seu acesso foi aprovado.`,
        '',
        lead,
        '',
        `${cta}: ${APP_URL}`,
        '',
        'POR ONDE COMEÇAR',
        ...steps.map(([t, d], i) => `${i + 1}. ${t} — ${d}`),
        '',
        `Dúvidas? Responda este e-mail ou escreva para ${SUPPORT_EMAIL}.`,
        'Se você não solicitou acesso ao IronTracks, ignore esta mensagem.',
    ].join('\n')

    return { subject, html: shell(preheader, inner), text }
}

/**
 * E-mail de recusa.
 *
 * Até ago/2026 quem era recusado não recebia nada: a solicitação era apagada, a
 * conta (quando existia) deletada, e a pessoa continuava na tela de espera para
 * sempre, sem saber. Ela pediu acesso a um produto e merece uma resposta.
 *
 * Mesma identidade do e-mail de aprovação, mas SEM festa: nada de badge dourado,
 * botão ou lista de primeiros passos. Não damos justificativa porque não existe
 * campo para isso — inventar uma seria pior que não dar.
 */
export function buildRejectionEmail(input: { name?: string | null }): BuiltEmail {
    const name = firstName(input?.name)
    const safeName = escapeHtml(name)

    const subject = 'Sobre sua solicitação de acesso ao IronTracks'
    const lead = 'Sua solicitação de acesso não foi aprovada desta vez.'
    const follow = 'Se você acha que houve engano, ou quiser entender melhor, é só responder este e-mail — a gente lê todas.'
    const preheader = 'Uma resposta sobre o acesso que você pediu.'

    const inner = `${brandHeader()}
          <tr><td style="padding:26px 28px 0;font-family:${FONT}">
            <div style="font-size:20px;font-weight:800;color:#ffffff;line-height:1.35">Olá, ${safeName}.</div>
            <div style="font-size:15px;color:${MUTED};line-height:1.6;padding:14px 0 0">${escapeHtml(lead)}</div>
            <div style="font-size:15px;color:${MUTED};line-height:1.6;padding:12px 0 22px">${escapeHtml(follow)}</div>
          </td></tr>
${brandFooter('')}`

    const text = [
        'IRONTRACKS — Sistema de Alta Performance',
        '',
        `Olá, ${name}.`,
        '',
        lead,
        '',
        follow,
        `Você também pode escrever para ${SUPPORT_EMAIL}.`,
    ].join('\n')

    return { subject, html: shell(preheader, inner), text }
}
