import { foodDatabase } from "@/data/foodDatabase";

function normalizeFoodText(input: string): string {
    return (input || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

const normalizedFoodEntries = Object.entries(foodDatabase).map(([key, item]) => {
    const normalizedKey = normalizeFoodText(key);
    return { key, normalizedKey, item, normalizedKeyLength: normalizedKey.length };
});

export interface ParsedFood {
    name: string;
    rawName: string;
    qtd: number;
    unitDisplay: string;
    macros: {
        p: number;
        c: number;
        f: number;
        kcal: number;
    };
    error?: boolean;
}

export interface MealAnalysis {
    mealName: string;
    foods: ParsedFood[];
    totals: {
        p: number;
        c: number;
        f: number;
        kcal: number;
    };
    isApproximate: boolean;
}

export function parseInput(text: string, userSettings: { wheyDose?: number, wheyProt?: number } = {}): MealAnalysis {
    const lines = text.split('\n');
    const detectedFoods: ParsedFood[] = [];
    let mealName = "Refeição";
    let totals = { p: 0, c: 0, f: 0, kcal: 0 };
    let isApproximate = false;

    lines.forEach((line, index) => {
        const rawLine = line.trim();
        if (!rawLine) return;

        const normalizedLine = normalizeFoodText(rawLine);

        if (index === 0 && !/\d/.test(rawLine)) {
            mealName = rawLine;
            return;
        }

        let qtd = 0;
        let foodName = "";
        let unitUsed = "g";
        let matchedItem = null;
        let multiplier = 0;
        let wasApprox = false;

        const approxRegex = /(\d+)\s*(colheres?|conchas?|bifes?|fatias?|pedacos?|latas?|scoops?|doses?|unidades?|ovos?|xicaras?|copos?|pratos?|rodelas?|espigas?|postas?|medalhoes?|espetinhos?)/i;
        const gramRegex = /(\d+)\s*(g|ml)\b/i;
        const countRegex = /^(\d+)\s+(.+)$/i;

        const approxMatch = normalizedLine.match(approxRegex);
        const gramMatch = normalizedLine.match(gramRegex);
        const countMatch = normalizedLine.match(countRegex);

        if (approxMatch) {
            qtd = parseInt(approxMatch[1]);
            let unitRaw = approxMatch[2].toLowerCase();
            if (unitRaw.startsWith('colher')) unitUsed = 'colher';
            else if (unitRaw.startsWith('concha')) unitUsed = 'concha';
            else if (unitRaw.startsWith('bife')) unitUsed = 'bife';
            else if (unitRaw.startsWith('fatia')) unitUsed = 'fatia';
            else if (unitRaw.startsWith('pedaco')) unitUsed = 'pedaco';
            else if (unitRaw.startsWith('lata')) unitUsed = 'lata';
            else if (unitRaw.startsWith('scoop') || unitRaw.startsWith('dose')) unitUsed = 'scoop';
            else if (unitRaw.startsWith('ovo')) unitUsed = 'unidade';
            else if (unitRaw.startsWith('xicara')) unitUsed = 'xicara';
            else if (unitRaw.startsWith('copo')) unitUsed = 'copo';
            else if (unitRaw.startsWith('prato')) unitUsed = 'prato';
            else if (unitRaw.startsWith('rodela')) unitUsed = 'rodela';
            else if (unitRaw.startsWith('espiga')) unitUsed = 'espiga';
            else if (unitRaw.startsWith('posta')) unitUsed = 'posta';
            else if (unitRaw.startsWith('medalh')) unitUsed = 'medalhao';
            else if (unitRaw.startsWith('espetinho')) unitUsed = 'espetinho';
            else unitUsed = 'unidade';

            foodName = normalizedLine.replace(approxMatch[0], "").replace(" de ", " ").trim().toLowerCase();

            if (unitRaw.startsWith('ovo') && foodName) {
                foodName = `ovo ${foodName}`;
            }

            if (!foodName && unitRaw.startsWith('ovo')) {
                foodName = unitRaw;
            }

            wasApprox = true;
        } else if (gramMatch) {
            qtd = parseInt(gramMatch[1]);
            unitUsed = 'g';
            foodName = normalizedLine.replace(gramMatch[0], "").replace(" de ", " ").trim().toLowerCase();
        } else if (countMatch) {
            qtd = parseInt(countMatch[1]);
            unitUsed = 'unidade';
            foodName = (countMatch[2] || "").replace(" de ", " ").trim().toLowerCase();
            wasApprox = true;
        } else {
            foodName = normalizedLine;
            qtd = 1;
        }

        // DB Search
        let dbKeyMatched = "";
        for (const entry of normalizedFoodEntries) {
            if (!entry.normalizedKey) continue;
            if (foodName.includes(entry.normalizedKey)) {
                if (!dbKeyMatched || entry.normalizedKeyLength > dbKeyMatched.length) {
                    dbKeyMatched = entry.normalizedKey;
                    matchedItem = entry.item;
                }
            }
        }

        if (matchedItem) {
            // --- WHEY PROTEIN SPECIAL LOGIC ---
            if (dbKeyMatched.includes('whey')) {
                let customDose = userSettings.wheyDose || 30;
                let customProt = userSettings.wheyProt || 24;

                if (customDose <= 0) {
                    customDose = 30;
                    customProt = 24;
                }

                const pRatio = customProt / customDose;

                let weightInGrams = 0;

                if (wasApprox) {
                    isApproximate = true;
                    if (matchedItem.approx && matchedItem.approx[unitUsed]) {
                        weightInGrams = qtd * matchedItem.approx[unitUsed];
                        unitUsed = `${unitUsed} (~${weightInGrams}g)`;
                    } else {
                        weightInGrams = qtd * 30; // default scoop assumption
                        unitUsed = "scoop/dose est. (30g)";
                    }
                } else {
                    weightInGrams = qtd;
                }

                const p = Math.round(weightInGrams * pRatio);
                const c = Math.round((matchedItem.c / 100) * weightInGrams);
                const f = Math.round((matchedItem.f / 100) * weightInGrams);
                const kcal = (p * 4) + (c * 4) + (f * 9);

                totals.p += p; totals.c += c; totals.f += f; totals.kcal += kcal;

                detectedFoods.push({
                    name: matchedItem.unit,
                    rawName: rawLine,
                    qtd: qtd,
                    unitDisplay: unitUsed,
                    macros: { p, c, f, kcal }
                });
            }
            else {
                // --- STANDARD LOGIC ---
                if (wasApprox) {
                    isApproximate = true;
                    const gramsPerUnit = matchedItem.approx?.[unitUsed] ?? matchedItem.approx?.[`${unitUsed}s`];
                    if (matchedItem.approx && typeof gramsPerUnit === "number") {
                        const totalGrams = qtd * gramsPerUnit;
                        multiplier = totalGrams / 100;
                        unitUsed = `${unitUsed} (~${gramsPerUnit}g)`;
                    } else if (matchedItem.approx && matchedItem.approx['unidade']) {
                        const gramsPerUnit = matchedItem.approx['unidade'];
                        multiplier = (qtd * gramsPerUnit) / 100;
                        unitUsed = `unidade estim. (~${gramsPerUnit}g)`;
                    } else {
                        multiplier = (qtd * 50) / 100;
                        unitUsed = "unidade (estimado)";
                    }
                } else {
                    multiplier = qtd / 100;
                }

                const p = Math.round(matchedItem.p * multiplier);
                const c = Math.round(matchedItem.c * multiplier);
                const f = Math.round(matchedItem.f * multiplier);
                const kcal = Math.round(matchedItem.kcal * multiplier);

                totals.p += p; totals.c += c; totals.f += f; totals.kcal += kcal;

                detectedFoods.push({
                    name: matchedItem.unit,
                    rawName: rawLine,
                    qtd: qtd,
                    unitDisplay: unitUsed,
                    macros: { p, c, f, kcal }
                });
            }
        } else {
            detectedFoods.push({
                name: "Desconhecido (" + rawLine + ")",
                rawName: rawLine,
                qtd: 0,
                unitDisplay: "?",
                macros: { p: 0, c: 0, f: 0, kcal: 0 },
                error: true
            });
        }
    });

    return { mealName, foods: detectedFoods, totals, isApproximate };
}
