/**
 * @module latestNativeVersions
 *
 * Última versão NATIVA publicada em cada loja, e o link para atualizar.
 *
 * Por que isto existe só para o Android: no iOS a fonte de verdade é a própria
 * Apple (iTunes Lookup API devolve a versão publicada). O Google Play não tem
 * API pública equivalente — raspar a página da loja é frágil e contra os termos.
 * Então, no Android, a versão publicada é declarada aqui.
 *
 * ⚠️ ATUALIZE `android` a cada release publicado na Play Store. Como o app
 * carrega o front do servidor remoto, um deploy web já propaga o novo valor
 * para todos os aparelhos instalados — não precisa de build nova para o aviso
 * aparecer.
 *
 * Regra de segurança: enquanto o valor for IGUAL ao que os usuários já têm
 * instalado, o banner simplesmente não aparece (`isNewerVersion` devolve false).
 * Nunca declare aqui uma versão que ainda não esteja de fato publicada na loja
 * — o usuário veria um aviso para atualizar sem ter o que baixar.
 */

/** `versionName` do último APK/AAB publicado na Play Store (android/app/build.gradle). */
export const LATEST_ANDROID_VERSION = '1.14.1'

/** Página do app na Play Store. */
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.irontracks.app'

/** Deep link que abre direto no app da Play Store, sem passar pelo navegador. */
export const PLAY_STORE_DEEP_LINK = 'market://details?id=com.irontracks.app'
