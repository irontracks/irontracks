/**
 * @module textFieldProps
 *
 * Props de teclado para campos que recebem IDENTIFICADOR — nome de exercício,
 * nome de treino, nome de pessoa, código, termo de busca.
 *
 * Por que existe: o teclado do iOS autocorrige TUDO por padrão, e nome de
 * exercício não é palavra de dicionário. Medido no teste de 10 passos de
 * 15/08/2026, digitando no simulador: "Drop teste" virou **"Frio teste"** e
 * "Bi A" virou **"Vi A"** — o usuário digita certo e o sistema entrega outra
 * coisa. Ele só descobre depois, olhando a lista de treinos, e o nome errado já
 * está salvo. Antes disto o app inteiro tinha ZERO `autoCorrect` e apenas dois
 * `spellCheck`, os dois soltos em campos de handle.
 *
 * A fronteira é entre IDENTIFICADOR e TEXTO LIVRE, e ela importa: em notas de
 * treino, chat, descrição e observação a autocorreção AJUDA — são frases em
 * português. Esses campos ficam de fora de propósito; aplicar aqui seria
 * piorar a digitação onde ela funciona bem.
 *
 * Espalhe com spread ANTES dos demais props (`<input {...properNameFieldProps} …>`)
 * para que qualquer campo possa sobrescrever um item pontual.
 */

/** Base comum: o corretor não opina sobre identificador, em nenhum caso. */
const semCorrecao = {
  autoCorrect: 'off',
  spellCheck: false,
} as const

/**
 * Nome próprio — de coisa ("Supino Reto Halter", "Treino A") ou de gente.
 * Capitaliza cada palavra, que é como esses nomes são escritos no app.
 */
export const properNameFieldProps = {
  ...semCorrecao,
  autoCapitalize: 'words',
} as const

/**
 * Código digitado: código de importação de treino, código de recuperação.
 * Maiúsculas porque é assim que esses códigos são exibidos e conferidos.
 */
export const codeFieldProps = {
  ...semCorrecao,
  autoCapitalize: 'characters',
} as const

/**
 * Identificador sem forma de palavra: telefone, CPF/CNPJ, CREF, handle, e
 * campo de busca. Capitalizar atrapalharia — ninguém quer "Joao" virando algo
 * na busca, nem a primeira letra forçada num campo numérico.
 */
export const plainFieldProps = {
  ...semCorrecao,
  autoCapitalize: 'none',
} as const
