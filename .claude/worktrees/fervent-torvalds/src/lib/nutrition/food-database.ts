export type FoodItem = {
  kcal: number
  p: number
  c: number
  f: number
  approx?: Record<string, number>
}

export const foodDatabase: Record<string, FoodItem> = {
  'frango grelhado': { kcal: 165, p: 31, c: 0, f: 4, approx: { unidade: 100, bife: 120, posta: 120, colher: 30 } },
  'arroz cozido': { kcal: 130, p: 3, c: 28, f: 0.3, approx: { colher: 25, concha: 100, prato: 180 } },
  'banana': { kcal: 89, p: 1.1, c: 23, f: 0.3, approx: { unidade: 80 } },
  'ovo': { kcal: 155, p: 13, c: 1.1, f: 11, approx: { unidade: 50 } },
  'whey protein': { kcal: 400, p: 80, c: 10, f: 7, approx: { scoop: 30, dose: 30 } },
}
