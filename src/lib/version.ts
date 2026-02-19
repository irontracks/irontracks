// Sistema de versionamento do IronTracks
// Este arquivo centraliza a versão para uso em todo o app (UI, Logs, API)

import packageJson from '../../package.json';

// Extrai apenas Major.Minor (ex: 4.0.0 -> 4.0)
const shortVersion = packageJson.version.split('.').slice(0, 2).join('.');

export const APP_VERSION = `v${shortVersion} Beta`;

export const getAppVersion = () => APP_VERSION;
export const getRawVersion = () => packageJson.version;
