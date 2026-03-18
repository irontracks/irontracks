export type FoodItem = {
  kcal: number
  p: number
  c: number
  f: number
  approx?: Record<string, number>
}

/**
 * Food database — values per 100g (TACO / USDA references).
 * `approx` maps unit names to grams per unit for the parser.
 */
export const foodDatabase: Record<string, FoodItem> = {
  // ── Proteínas ──────────────────────────────────────────────────────────────
  'frango grelhado': { kcal: 165, p: 31, c: 0, f: 4, approx: { unidade: 100, bife: 120, posta: 120, colher: 30 } },
  'peito de frango': { kcal: 165, p: 31, c: 0, f: 4, approx: { unidade: 100, bife: 120, posta: 120 } },
  'frango desfiado': { kcal: 165, p: 31, c: 0, f: 4, approx: { colher: 25, concha: 80 } },
  'carne moida': { kcal: 212, p: 26, c: 0, f: 11, approx: { colher: 25, concha: 80 } },
  'carne bovina': { kcal: 212, p: 26, c: 0, f: 11, approx: { bife: 120, posta: 120, colher: 30 } },
  'patinho': { kcal: 133, p: 27, c: 0, f: 3, approx: { bife: 120, posta: 120 } },
  'alcatra': { kcal: 177, p: 26, c: 0, f: 8, approx: { bife: 120, posta: 120 } },
  'file mignon': { kcal: 143, p: 28, c: 0, f: 3.5, approx: { bife: 120, medalhao: 100 } },
  'contrafile': { kcal: 195, p: 25, c: 0, f: 10, approx: { bife: 120, posta: 120 } },
  'coxao mole': { kcal: 169, p: 26, c: 0, f: 7, approx: { bife: 120 } },
  'picanha': { kcal: 242, p: 22, c: 0, f: 17, approx: { fatia: 80, espetinho: 100 } },
  'costela bovina': { kcal: 292, p: 20, c: 0, f: 23, approx: { pedaco: 100 } },
  'carne de porco': { kcal: 242, p: 27, c: 0, f: 14, approx: { bife: 120, posta: 120 } },
  'lombo de porco': { kcal: 171, p: 29, c: 0, f: 6, approx: { fatia: 80, bife: 120 } },
  'linguica': { kcal: 296, p: 16, c: 2, f: 25, approx: { unidade: 60, rodela: 15 } },
  'bacon': { kcal: 541, p: 37, c: 1, f: 42, approx: { fatia: 15 } },
  'ovo': { kcal: 155, p: 13, c: 1.1, f: 11, approx: { unidade: 50 } },
  'clara de ovo': { kcal: 52, p: 11, c: 0.7, f: 0.2, approx: { unidade: 33 } },
  'ovo cozido': { kcal: 155, p: 13, c: 1.1, f: 11, approx: { unidade: 50 } },
  'omelete': { kcal: 154, p: 11, c: 0.6, f: 12, approx: { unidade: 120 } },
  'sardinha': { kcal: 208, p: 25, c: 0, f: 11, approx: { lata: 84, unidade: 30 } },
  'atum': { kcal: 116, p: 26, c: 0, f: 1, approx: { lata: 120 } },
  'atum em lata': { kcal: 116, p: 26, c: 0, f: 1, approx: { lata: 120 } },
  'salmao': { kcal: 208, p: 20, c: 0, f: 13, approx: { posta: 120, fatia: 80 } },
  'tilapia': { kcal: 96, p: 20, c: 0, f: 1.7, approx: { posta: 120 } },
  'peixe grelhado': { kcal: 96, p: 20, c: 0, f: 1.7, approx: { posta: 120 } },
  'camarao': { kcal: 99, p: 24, c: 0.2, f: 0.3, approx: { unidade: 8, colher: 30 } },

  // ── Laticínios ─────────────────────────────────────────────────────────────
  'leite integral': { kcal: 61, p: 3.2, c: 4.7, f: 3.3, approx: { copo: 250, xicara: 240 } },
  'leite desnatado': { kcal: 35, p: 3.4, c: 5, f: 0.1, approx: { copo: 250, xicara: 240 } },
  'iogurte natural': { kcal: 61, p: 3.5, c: 4.7, f: 3.3, approx: { unidade: 170, copo: 200 } },
  'iogurte grego': { kcal: 97, p: 9, c: 3.6, f: 5, approx: { unidade: 100, copo: 200 } },
  'queijo mussarela': { kcal: 300, p: 22, c: 3, f: 22, approx: { fatia: 20, pedaco: 30 } },
  'queijo branco': { kcal: 264, p: 17, c: 3, f: 20, approx: { fatia: 30, pedaco: 30 } },
  'queijo minas': { kcal: 264, p: 17, c: 3, f: 20, approx: { fatia: 30 } },
  'queijo cottage': { kcal: 98, p: 11, c: 3.4, f: 4.3, approx: { colher: 30 } },
  'queijo prato': { kcal: 350, p: 23, c: 2, f: 28, approx: { fatia: 20 } },
  'requeijao': { kcal: 257, p: 7, c: 3, f: 25, approx: { colher: 15 } },
  'cream cheese': { kcal: 342, p: 6, c: 4, f: 34, approx: { colher: 15 } },

  // ── Carboidratos / Cereais ─────────────────────────────────────────────────
  'arroz cozido': { kcal: 130, p: 3, c: 28, f: 0.3, approx: { colher: 25, concha: 100, prato: 180 } },
  'arroz integral': { kcal: 124, p: 3, c: 26, f: 1, approx: { colher: 25, concha: 100, prato: 180 } },
  'feijao cozido': { kcal: 77, p: 5, c: 14, f: 0.5, approx: { colher: 25, concha: 80 } },
  'feijao preto': { kcal: 77, p: 5, c: 14, f: 0.5, approx: { colher: 25, concha: 80 } },
  'lentilha': { kcal: 93, p: 7, c: 16, f: 0.4, approx: { colher: 25, concha: 80 } },
  'grao de bico': { kcal: 164, p: 9, c: 27, f: 2.6, approx: { colher: 25, concha: 80 } },
  'macarrao cozido': { kcal: 131, p: 5, c: 25, f: 1.1, approx: { prato: 200, colher: 40 } },
  'macarrao integral': { kcal: 124, p: 5, c: 26, f: 0.5, approx: { prato: 200 } },
  'pao frances': { kcal: 300, p: 8, c: 59, f: 3, approx: { unidade: 50 } },
  'pao integral': { kcal: 247, p: 10, c: 41, f: 4, approx: { fatia: 30 } },
  'pao de forma': { kcal: 253, p: 8, c: 47, f: 3, approx: { fatia: 25 } },
  'torrada': { kcal: 380, p: 10, c: 72, f: 5, approx: { unidade: 8 } },
  'tapioca': { kcal: 330, p: 0.5, c: 83, f: 0.1, approx: { colher: 20, unidade: 40 } },
  'aveia': { kcal: 394, p: 14, c: 67, f: 7, approx: { colher: 15 } },
  'granola': { kcal: 471, p: 10, c: 64, f: 20, approx: { colher: 20 } },
  'batata doce': { kcal: 86, p: 1.6, c: 20, f: 0.1, approx: { unidade: 130 } },
  'batata cozida': { kcal: 87, p: 2, c: 20, f: 0.1, approx: { unidade: 170 } },
  'mandioca': { kcal: 160, p: 1.4, c: 39, f: 0.3, approx: { pedaco: 100 } },
  'inhame': { kcal: 97, p: 2, c: 23, f: 0.1, approx: { pedaco: 100 } },
  'milho': { kcal: 96, p: 3.2, c: 19, f: 1.2, approx: { espiga: 200, colher: 25 } },
  'farofa': { kcal: 403, p: 2, c: 72, f: 12, approx: { colher: 20 } },
  'cuscuz': { kcal: 112, p: 2.5, c: 23, f: 0.6, approx: { fatia: 100, pedaco: 100 } },
  'pipoca': { kcal: 375, p: 12, c: 64, f: 5, approx: { xicara: 8 } },

  // ── Frutas ─────────────────────────────────────────────────────────────────
  'banana': { kcal: 89, p: 1.1, c: 23, f: 0.3, approx: { unidade: 80 } },
  'maca': { kcal: 52, p: 0.3, c: 14, f: 0.2, approx: { unidade: 150 } },
  'laranja': { kcal: 47, p: 0.9, c: 12, f: 0.1, approx: { unidade: 180 } },
  'morango': { kcal: 32, p: 0.7, c: 8, f: 0.3, approx: { unidade: 12 } },
  'uva': { kcal: 69, p: 0.7, c: 18, f: 0.2, approx: { unidade: 5 } },
  'manga': { kcal: 60, p: 0.8, c: 15, f: 0.4, approx: { unidade: 300 } },
  'melancia': { kcal: 30, p: 0.6, c: 8, f: 0.2, approx: { fatia: 200 } },
  'abacaxi': { kcal: 50, p: 0.5, c: 13, f: 0.1, approx: { fatia: 80, rodela: 80 } },
  'mamao': { kcal: 43, p: 0.5, c: 11, f: 0.3, approx: { fatia: 100 } },
  'abacate': { kcal: 160, p: 2, c: 9, f: 15, approx: { colher: 30 } },
  'acai': { kcal: 58, p: 0.8, c: 6, f: 3.5, approx: { copo: 200 } },
  'kiwi': { kcal: 61, p: 1.1, c: 15, f: 0.5, approx: { unidade: 76 } },
  'pera': { kcal: 57, p: 0.4, c: 15, f: 0.1, approx: { unidade: 180 } },
  'melao': { kcal: 34, p: 0.8, c: 8, f: 0.2, approx: { fatia: 200 } },

  // ── Verduras & Legumes ─────────────────────────────────────────────────────
  'brocolis': { kcal: 34, p: 2.8, c: 7, f: 0.4, approx: { colher: 30, xicara: 90 } },
  'espinafre': { kcal: 23, p: 2.9, c: 3.6, f: 0.4, approx: { xicara: 30 } },
  'tomate': { kcal: 18, p: 0.9, c: 3.9, f: 0.2, approx: { unidade: 120 } },
  'cenoura': { kcal: 41, p: 0.9, c: 10, f: 0.2, approx: { unidade: 80, colher: 25 } },
  'pepino': { kcal: 15, p: 0.7, c: 3.6, f: 0.1, approx: { unidade: 200 } },
  'alface': { kcal: 15, p: 1.4, c: 2.9, f: 0.2, approx: { prato: 50 } },
  'abobrinha': { kcal: 17, p: 1.2, c: 3.1, f: 0.3, approx: { unidade: 200 } },
  'berinjela': { kcal: 25, p: 1, c: 6, f: 0.2, approx: { unidade: 200 } },
  'cebola': { kcal: 40, p: 1.1, c: 9, f: 0.1, approx: { unidade: 110 } },
  'couve': { kcal: 36, p: 3.3, c: 6, f: 0.7, approx: { colher: 30 } },
  'beterraba': { kcal: 43, p: 1.6, c: 10, f: 0.2, approx: { unidade: 100 } },

  // ── Gorduras & Oleaginosas ─────────────────────────────────────────────────
  'azeite': { kcal: 884, p: 0, c: 0, f: 100, approx: { colher: 13 } },
  'oleo de coco': { kcal: 862, p: 0, c: 0, f: 100, approx: { colher: 13 } },
  'manteiga': { kcal: 717, p: 0.9, c: 0.1, f: 81, approx: { colher: 10 } },
  'pasta de amendoim': { kcal: 588, p: 25, c: 20, f: 50, approx: { colher: 15 } },
  'amendoim': { kcal: 567, p: 26, c: 16, f: 49, approx: { colher: 15, unidade: 1 } },
  'castanha do para': { kcal: 656, p: 14, c: 12, f: 67, approx: { unidade: 4 } },
  'castanha de caju': { kcal: 553, p: 18, c: 30, f: 44, approx: { unidade: 2.5 } },
  'nozes': { kcal: 654, p: 15, c: 14, f: 65, approx: { unidade: 5 } },
  'amendoas': { kcal: 579, p: 21, c: 22, f: 50, approx: { unidade: 1.2 } },
  'chia': { kcal: 486, p: 17, c: 42, f: 31, approx: { colher: 10 } },
  'linhaça': { kcal: 534, p: 18, c: 29, f: 42, approx: { colher: 10 } },

  // ── Suplementos ────────────────────────────────────────────────────────────
  'whey protein': { kcal: 400, p: 80, c: 10, f: 7, approx: { scoop: 30, dose: 30 } },
  'creatina': { kcal: 0, p: 0, c: 0, f: 0, approx: { colher: 5, dose: 5 } },
  'albumina': { kcal: 381, p: 83, c: 4, f: 3, approx: { colher: 15, scoop: 30 } },
  'caseina': { kcal: 370, p: 80, c: 4, f: 2, approx: { scoop: 30 } },
  'hipercalorico': { kcal: 377, p: 15, c: 68, f: 5, approx: { scoop: 50, dose: 50 } },
  'dextrose': { kcal: 400, p: 0, c: 100, f: 0, approx: { colher: 20 } },
  'maltodextrina': { kcal: 400, p: 0, c: 100, f: 0, approx: { colher: 20 } },

  // ── Bebidas ────────────────────────────────────────────────────────────────
  'cafe': { kcal: 2, p: 0.1, c: 0, f: 0, approx: { xicara: 60, copo: 200 } },
  'suco de laranja': { kcal: 45, p: 0.7, c: 10, f: 0.2, approx: { copo: 250 } },
  'agua de coco': { kcal: 19, p: 0.7, c: 3.7, f: 0.2, approx: { copo: 250 } },
  'refrigerante': { kcal: 42, p: 0, c: 11, f: 0, approx: { lata: 350, copo: 250 } },
  'cerveja': { kcal: 43, p: 0.5, c: 3.6, f: 0, approx: { lata: 350, copo: 300 } },

  // ── Pratos prontos / Refeições comuns ──────────────────────────────────────
  'acai na tigela': { kcal: 58, p: 0.8, c: 6, f: 3.5, approx: { copo: 300 } },
  'pao de queijo': { kcal: 363, p: 6, c: 44, f: 18, approx: { unidade: 25 } },
  'coxinha': { kcal: 268, p: 10, c: 26, f: 14, approx: { unidade: 80 } },
  'empada': { kcal: 320, p: 8, c: 25, f: 21, approx: { unidade: 60 } },
  'esfirra': { kcal: 280, p: 10, c: 30, f: 13, approx: { unidade: 80 } },
  'pizza': { kcal: 266, p: 11, c: 33, f: 10, approx: { fatia: 120 } },
  'hamburguer': { kcal: 295, p: 17, c: 24, f: 14, approx: { unidade: 200 } },
  'sopa': { kcal: 40, p: 2, c: 6, f: 1, approx: { prato: 300, concha: 150 } },
  'salada': { kcal: 20, p: 1.5, c: 3, f: 0.3, approx: { prato: 150 } },
}
