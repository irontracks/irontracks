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

export function buildApprovalEmail(input: ApprovalEmailInput): BuiltEmail {
    const name = firstName(input?.name)
    const safeName = escapeHtml(name)

    const subject = 'Seu acesso ao IronTracks foi aprovado'

    // O que a pessoa precisa FAZER muda com o caso; o resto do e-mail não.
    const lead = input.accountExisted
        ? 'Seu acesso foi liberado. É só entrar com o mesmo e-mail e senha que você já cadastrou.'
        : 'Seu acesso foi liberado. Abra o IronTracks e crie sua conta com este mesmo e-mail para começar.'
    const cta = input.accountExisted ? 'Entrar no IronTracks' : 'Criar minha conta'

    // Preheader: o trecho que o app de e-mail mostra ao lado do assunto. Sem
    // ele, o cliente puxa o primeiro texto que achar (às vezes o rodapé).
    const preheader = input.accountExisted
        ? 'Tudo pronto — entre com seu e-mail e senha.'
        : 'Tudo pronto — crie sua conta e comece a treinar.'

    const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#0a0a0a">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#141414;border:1px solid #262626;border-radius:16px">
        <tr><td style="padding:32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#e5e5e5">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#facc15;font-weight:700">IronTracks</p>
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#ffffff">Olá, ${safeName}! Seu acesso foi aprovado.</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a3a3a3">${escapeHtml(lead)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#facc15">
            <a href="${APP_URL}" target="_blank" rel="noreferrer"
               style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#0a0a0a;text-decoration:none">${escapeHtml(cta)}</a>
          </td></tr></table>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#737373">
            Se o botão não abrir, copie este endereço no navegador:<br>
            <span style="color:#a3a3a3">${APP_URL}</span>
          </p>
          <hr style="border:0;border-top:1px solid #262626;margin:28px 0 16px">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#525252">
            Dúvidas? Responda este e-mail ou escreva para ${escapeHtml(SUPPORT_EMAIL)}.<br>
            Se você não solicitou acesso ao IronTracks, ignore esta mensagem.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

    // Versão texto: exigida por bons filtros de spam e é o que alguns clientes
    // mostram. Precisa ser AUTOSSUFICIENTE, não um resumo do HTML.
    const text = [
        `Olá, ${name}! Seu acesso ao IronTracks foi aprovado.`,
        '',
        lead,
        '',
        `${cta}: ${APP_URL}`,
        '',
        `Dúvidas? Responda este e-mail ou escreva para ${SUPPORT_EMAIL}.`,
        'Se você não solicitou acesso ao IronTracks, ignore esta mensagem.',
    ].join('\n')

    return { subject, html, text }
}
