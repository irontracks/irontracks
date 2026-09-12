/**
 * Guard de CLASSE — nenhum `toDateMs` deste repo devolve 0 para campo AUSENTE.
 *
 * O defeito: `new Date(0).getTime()` é **0**, que é finito e NÃO é nullish.
 * Um helper que caia nele quando o campo não existe envenena toda cadeia
 * `toDateMs(a) ?? toDateMs(b) ?? ...` — ela para no primeiro termo, o fallback
 * nunca dispara e a data sai 01/01/1970. É a mesma armadilha do `toNumber`
 * (`components/workout/utils.ts`), que sobreviveu num segundo helper e foi
 * medida em 12/09/2026: `toDateMs(undefined)` devolvia 0 na raiz enquanto as
 * outras duas implementações devolviam null.
 *
 * São TRÊS metades, e nenhuma sozinha fecha:
 *
 *  1. COMPORTAMENTO — cada implementação é exercitada com o que um campo
 *     ausente de fato produz. Guard de FORMA não serve aqui: procurar pela
 *     sintaxe `?? toDateMs(` acusaria a cadeia CORRETA, que é o uso legítimo
 *     e majoritário (jeito nº 8 da lista de guards falsos).
 *  2. FIAÇÃO — a cadeia `??` inteira. As pontas passam isoladas; o que
 *     quebrava era a junção entre elas.
 *  3. DESCOBERTA — implementação NOVA não entra no item 1 sozinha, então um
 *     source-guard varre `src/` atrás de definições de `toDateMs` e reprova a
 *     que não estiver coberta aqui. Sem ele este arquivo vira a lista dos três
 *     que eu já conhecia — guard da instância com cara de guard de classe.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { toDateMs as daRaizDoTreino } from '@/components/workout/utils';
import { toDateMs as doHistorico } from '@/components/history/hooks/useHistoryData';
import { toDateMs as dosCheckins } from '@/hooks/useCheckins';

const SRC = join(process.cwd(), 'src');

/** Implementações cobertas pelo caso de COMPORTAMENTO. Caminho → função. */
const COBERTAS: Record<string, (v: unknown) => number | null> = {
  'src/components/workout/utils.ts': daRaizDoTreino,
  'src/components/history/hooks/useHistoryData.ts': doHistorico,
  'src/hooks/useCheckins.ts': dosCheckins,
};

/**
 * O que um campo ausente produz ao chegar num desses helpers.
 *
 * `0` e `false` entram de propósito: são os dois valores que "existem" e ainda
 * assim significam ausência neste domínio — nenhuma sessão deste app é de
 * 01/01/1970, e um `0` vindo de coluna vazia viraria epoch com cara de data.
 */
const CAMPO_AUSENTE: Array<[string, unknown]> = [
  ['undefined', undefined],
  ['null', null],
  ['string vazia', ''],
  ['só espaços', '   '],
  ['false', false],
  ['número 0', 0],
  ['NaN', NaN],
  ['objeto vazio', {}],
  ['array vazio', []],
  ['texto que não é data', 'sem-data'],
];

const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const DEFINE_TO_DATE_MS = [
  /(?:^|[^.\w])(?:const|let|var)\s+toDateMs\s*[:=]/,
  /(?:^|[^.\w])function\s+toDateMs\s*\(/,
];

function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === '__tests__' || nome === 'node_modules') continue;
      arquivosDeCodigo(caminho, achados);
      continue;
    }
    if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

describe('campo de data ausente devolve null, nunca 0', () => {
  for (const [caminho, toDateMs] of Object.entries(COBERTAS)) {
    for (const [rotulo, valor] of CAMPO_AUSENTE) {
      it(`${caminho} — ${rotulo}`, () => {
        expect(toDateMs(valor)).toBeNull();
      });
    }
  }

  // FIAÇÃO: é aqui que o defeito vivia. As duas pontas passam isoladas.
  const SEGUNDA_DATA = '2026-01-02T10:00:00Z';
  for (const [caminho, toDateMs] of Object.entries(COBERTAS)) {
    it(`${caminho} — a cadeia ?? alcança o fallback`, () => {
      const esperado = new Date(SEGUNDA_DATA).getTime();
      expect(toDateMs(undefined) ?? toDateMs(SEGUNDA_DATA)).toBe(esperado);
      expect(toDateMs(null) ?? toDateMs(undefined) ?? toDateMs(SEGUNDA_DATA)).toBe(esperado);
    });
  }
});

describe('descoberta — nenhuma implementação escapa da cobertura acima', () => {
  const encontradas = arquivosDeCodigo(SRC)
    .filter((caminho) => DEFINE_TO_DATE_MS.some((re) => re.test(semComentarios(readFileSync(caminho, 'utf8')))))
    .map((caminho) => relative(process.cwd(), caminho).split('\\').join('/'))
    .sort();

  // Sem este caso o guard fica CEGO quando a varredura para de achar qualquer
  // coisa (jeito nº 6): ele passaria verde com zero implementações.
  it('a varredura acha as implementações que existem', () => {
    expect(encontradas.length).toBeGreaterThanOrEqual(3);
  });

  it('o conjunto encontrado é exatamente o coberto', () => {
    expect(encontradas).toEqual(Object.keys(COBERTAS).sort());
  });
});
