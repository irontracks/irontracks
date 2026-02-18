"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";

type IronScannerExercise = {
  name: string;
  sets: number;
  reps: string;
  notes: string;
  method?: string;
  rest_time_sec?: number;
};

type IronScannerResponse = {
  ok: boolean;
  workoutTitle?: string;
  exercises?: IronScannerExercise[];
  error?: string;
};

const IRON_SCANNER_MODEL =
  process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || "gemini-2.5-flash";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export async function processWorkoutImage(formData: FormData): Promise<IronScannerResponse> {
  try {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        error:
          "API de IA não configurada. Configure GOOGLE_GENERATIVE_AI_API_KEY na Vercel (Environment Variables → Preview/Production) e faça Redeploy.",
      };
    }

    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return { ok: false, error: "Arquivo inválido" };
    }

    const blob = file as Blob;
    const size = blob.size ?? 0;
    if (size <= 0) {
      return { ok: false, error: "Arquivo vazio" };
    }
    if (size > MAX_FILE_SIZE_BYTES) {
      return { ok: false, error: "Arquivo muito grande. Máximo 5MB" };
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    const mimeType = blob.type || "application/octet-stream";

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: IRON_SCANNER_MODEL });

    const prompt =
      "Analise esta imagem de treino. Extraia o título do treino (se estiver visível) e os exercícios, séries, repetições, carga (se houver) e observações. " +
      "Retorne APENAS um JSON válido seguindo estritamente esta estrutura: " +
      "{ workoutTitle?: string, exercises: [{ name: string, sets: number, reps: string, notes: string, method?: string, rest_time_sec?: number }] }. " +
      "Não inclua markdown ```json```, apenas o texto bruto do JSON. " +
      "REGRAS CRÍTICAS DE DEDUPLICAÇÃO: " +
      "1. Agrupe exercícios repetidos ou listados linha a linha. " +
      "2. Se você vir 'Série 1, Série 2, Série 3' para o mesmo exercício, NÃO crie 3 itens. Crie UM item e some a quantidade no campo 'sets'. " +
      "3. Exemplo: Se houver 4 linhas de 'Supino', retorne UM objeto 'Supino' com sets: 4. " +
      "4. Para técnicas como rest-pause, drop-set, bi-set ou pirâmide, use o campo 'sets' apenas para o número de séries principais (não conte micropausas internas como sets separados). " +
      "5. Mantenha o campo 'reps' simples (por exemplo '8-10' ou '4x12'); coloque descrições complexas de rest-pause, drop-set ou progressões de repetições no campo 'notes'. " +
      "6. Se o treino especificar algo como '8 + 4 + 4 rest-pause', trate como 1 série com reps '8' e registre 'rest-pause 8+4+4' em 'notes'. " +
      "7. Mantenha a estrutura JSON estrita.";

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64,
          mimeType,
        },
      },
      { text: prompt },
    ]);

    const response = result?.response;
    const text = (await response?.text()) || "";
    const cleaned = String(text || "").trim();

    if (!cleaned) {
      return { ok: false, error: "Resposta vazia da IA" };
    }

    let jsonText = cleaned;
    if (jsonText.startsWith("```")) {
      const firstBreak = jsonText.indexOf("\n");
      const lastFence = jsonText.lastIndexOf("```");
      if (firstBreak !== -1 && lastFence !== -1) {
        jsonText = jsonText.substring(firstBreak + 1, lastFence).trim();
      }
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      const start = jsonText.indexOf("[");
      const end = jsonText.lastIndexOf("]");
      if (start === -1 || end === -1 || end <= start) {
        return { ok: false, error: "Falha ao interpretar JSON retornado pela IA" };
      }
      const slice = jsonText.substring(start, end + 1);
      try {
        parsed = JSON.parse(slice);
      } catch {
        return { ok: false, error: "Falha ao interpretar JSON retornado pela IA" };
      }
    }

    const asObj = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    const workoutTitle = asObj ? String(asObj.workoutTitle || "").trim() : "";
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(asObj?.exercises) ? asObj.exercises : [];
    const exercises: IronScannerExercise[] = (Array.isArray(arr) ? arr : [])
      .map((item: unknown) => {
        if (!item || typeof item !== "object") return null;
        const anyItem = item as Record<string, unknown>;
        const name = String(anyItem.name || "").trim();
        const setsRaw = anyItem.sets;
        const setsNum = typeof setsRaw === "number" ? setsRaw : Number(setsRaw || 0);
        const reps = String(anyItem.reps ?? "").trim() || "10";
        const notes = String(anyItem.notes ?? "").trim();
        const method = String(anyItem.method ?? "").trim();
        const restRaw = anyItem.rest_time_sec;
        const rest_time_sec = typeof restRaw === "number" ? restRaw : Number(restRaw || 0);
        if (!name) return null;
        return {
          name,
          sets: Number.isFinite(setsNum) && setsNum > 0 ? setsNum : 4,
          reps,
          notes,
          ...(method ? { method } : {}),
          ...(Number.isFinite(rest_time_sec) && rest_time_sec > 0 ? { rest_time_sec } : {}),
        };
      })
      .filter((x: unknown): x is IronScannerExercise => !!x);

    if (!exercises.length) {
      return { ok: false, error: "Nenhum exercício válido encontrado" };
    }

    return { ok: true, workoutTitle: workoutTitle || undefined, exercises };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    let msg = raw || "Erro inesperado ao processar treino";

    const upper = msg.toUpperCase();
    if (upper.includes("NOT_FOUND") && upper.includes("MODEL")) {
      msg =
        "Modelo de IA indisponível ou id incorreto. Verifique GOOGLE_GENERATIVE_AI_API_KEY/GOOGLE_GENERATIVE_AI_MODEL_ID.";
    }

    return { ok: false, error: msg };
  }
}
