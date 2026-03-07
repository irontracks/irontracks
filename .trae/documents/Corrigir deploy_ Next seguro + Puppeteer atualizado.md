## O que está acontecendo

* **next\@16.0.8** está sinalizado como vulnerável. Para a linha **16.0.x**, a correção sai em **16.0.10** (advisory 2025‑12‑11).

* **puppeteer\@22.15.0** está “deprecated/unsupported” (não necessariamente quebra o deploy, mas pode virar bloqueio/erro em CI ou futuramente).

## Objetivo

* Remover os warnings que estão bloqueando o deploy e manter compatibilidade do app (especialmente o endpoint de PDF em `/api/report`).

## Plano

### 1) Atualizar Next para versão corrigida

* Bump de:

  * `next` **16.0.8 → 16.0.10** (ou o último 16.0.x disponível)

  * `eslint-config-next` para a mesma versão do Next.

* Ajustar `package-lock.json` junto (reinstalar dependências).

### 2) Atualizar Puppeteer para versão suportada

* Bump de:

  * `puppeteer` **22.15.0 → >=24.15.0**

* Rodar build local para garantir que o endpoint [api/report/route.js](file:///Users/macmini/Documents/Projetos%20programação%20\(trae\)/App%20IronTracks/src/app/api/report/route.js) continua gerando PDF.

* Se a API reclamar de `headless: 'new'` na versão nova, ajustar para `headless: true` (pequena mudança pontual).

### 3) Validar e garantir que o deploy passa

* Rodar `npm run lint` + `npm run build`.

* Conferir se não surgem incompatibilidades de React/Next.

## Arquivos envolvidos

* [package.json](file:///Users/macmini/Documents/Projetos%20programação%20\(trae\)/App%20IronTracks/package.json)

* `package-lock.json`

* (se necessário) [api/report/route.js](file:///Users/macmini/Documents/Projetos%20programação%20\(trae\)/App%20IronTracks/src/app/api/report/route.js)

## Resultado esperado

* Deploy sem warning de vulnerabilidade do Next.

* Puppeteer em versão suportada.

* PDF continua funcionando e build fecha sem erros.

