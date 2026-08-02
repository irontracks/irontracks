import { describe, expect, it, vi } from 'vitest'
import { namesMatch, parseCref, parseCref9Response, verifyCref } from '../verifyCref'

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

const LOOKUP_PAGE = `
  <html>
    <body>
      <form method="post" id="form1">
        <input type="hidden" name="__VIEWSTATE" value="state&amp;value" />
        <input type="hidden" name="__EVENTVALIDATION" value="validation" />
        <input type="text" name="ctl00$ContentPlaceHolder1$Callbackconsulta$txtConsultaTotal" value="" />
      </form>
    </body>
  </html>
`

function resultPage(status = 'ATIVO', name = 'MARIA ALVES SILVA') {
  return `
    <table>
      <tr class="dxgvDataRow_MetropolisBlue">
        <td><span>PR-012345</span><script>var ignored = 'content'</script></td>
        <td><font>${name}</font></td>
        <td><span>LICENCIADO/BACHAREL</span></td>
        <td><font>${status}</font></td>
      </tr>
    </table>
  `
}

function lookupFetch(html: string) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (!init?.method) {
      return new Response(LOOKUP_PAGE, {
        status: 200,
        headers: { 'set-cookie': 'ASP.NET_SessionId=test; path=/; HttpOnly' },
      })
    }

    const body = new URLSearchParams(String(init.body))
    expect(body.get('__VIEWSTATE')).toBe('state&value')
    expect(body.get('ctl00$ContentPlaceHolder1$Callbackconsulta$txtConsultaTotal')).toBe('012345')
    expect(body.get('ctl00$ContentPlaceHolder1$Callbackconsulta$btnConsultaTotal')).toBe('Pesquisar')
    expect(new Headers(init.headers).get('cookie')).toBe('ASP.NET_SessionId=test')
    return new Response(html, { status: 200 })
  })
}

describe('CREF verification', () => {
  it('normaliza os formatos públicos do CREF', () => {
    expect(parseCref('CREF 012345-G/PR')).toEqual({
      digits: '012345',
      state: 'PR',
      normalized: '012345-G/PR',
    })
    expect(parseCref('PR-12345')?.normalized).toBe('012345-G/PR')
    expect(parseCref('012345')).toBeNull()
  })

  it('compara nome completo tolerando acentos e conectores', () => {
    expect(namesMatch('Maria Alves Silva', 'MARIA ALVES SILVA')).toBe(true)
    expect(namesMatch('Maria da Silva', 'MARIA ALVES SILVA')).toBe(true)
    expect(namesMatch('Outra Pessoa', 'MARIA ALVES SILVA')).toBe(false)
  })

  it('extrai número, nome, categoria e situação do retorno oficial', () => {
    expect(parseCref9Response(resultPage(), '012345')).toEqual({
      registration: 'PR-012345',
      professionalName: 'MARIA ALVES SILVA',
      category: 'LICENCIADO/BACHAREL',
      status: 'ATIVO',
    })
  })

  it('confirma CREF ativo quando o nome também confere', async () => {
    const fetchMock = lookupFetch(resultPage())
    const result = await verifyCref('012345-G/PR', 'Maria Alves Silva', fetchMock)

    expect(result).toMatchObject({
      status: 'verified',
      canContinue: true,
      normalizedCref: '012345-G/PR',
      professionalName: 'MARIA ALVES SILVA',
      registrationStatus: 'ATIVO',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('bloqueia CREF ativo pertencente a outro nome', async () => {
    const result = await verifyCref('012345-G/PR', 'Outra Pessoa', lookupFetch(resultPage()))

    expect(result.status).toBe('invalid')
    expect(result.canContinue).toBe(false)
    expect(result.message).toContain('nome não confere')
  })

  it('bloqueia CREF inativo ou inexistente', async () => {
    const inactive = await verifyCref('012345-G/PR', 'Maria Alves Silva', lookupFetch(resultPage('BAIXADO')))
    const missing = await verifyCref('012345-G/PR', 'Maria Alves Silva', lookupFetch('<table></table>'))

    expect(inactive).toMatchObject({ status: 'invalid', canContinue: false, registrationStatus: 'BAIXADO' })
    expect(missing).toMatchObject({ status: 'invalid', canContinue: false })
  })

  it('mantém análise manual para outra UF ou indisponibilidade do conselho', async () => {
    const outsideParana = await verifyCref('123456-G/SP', 'Maria da Silva', lookupFetch(resultPage()))
    const unavailableFetch = vi.fn(async () => {
      throw new Error('network unavailable')
    })
    const unavailable = await verifyCref('012345-G/PR', 'Maria Alves Silva', unavailableFetch)

    expect(outsideParana).toMatchObject({ status: 'manual_review', canContinue: true })
    expect(unavailable).toMatchObject({ status: 'manual_review', canContinue: true })
  })
})
