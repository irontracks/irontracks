"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Part } from "@google/generative-ai";

type AssessmentFormDataShape = {
  assessment_date?: string;
  weight?: string;
  height?: string;
  age?: string;
  gender?: "M" | "F" | "";
  arm_circ?: string;
  chest_circ?: string;
  waist_circ?: string;
  hip_circ?: string;
  thigh_circ?: string;
  calf_circ?: string;
  triceps_skinfold?: string;
  biceps_skinfold?: string;
  subscapular_skinfold?: string;
  suprailiac_skinfold?: string;
  abdominal_skinfold?: string;
  thigh_skinfold?: string;
  calf_skinfold?: string;
  observations?: string;
};

type AssessmentScannerResponse = {
  ok: boolean;
  formData?: AssessmentFormDataShape;
  error?: string;
};

const ASSESSMENT_SCANNER_MODEL =
  process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || "gemini-2.5-flash";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const pickFirstNumber = (value: string) => {
  const s = String(value || "");
  const m = s.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return "";
  return m[0].replace(",", ".");
};

const normalizeWeight = (value: unknown) => {
  const n = pickFirstNumber(String(value ?? ""));
  return n;
};

const normalizeAge = (value: unknown) => {
  const n = pickFirstNumber(String(value ?? ""));
  if (!n) return "";
  const asInt = String(Math.round(Number(n)));
  return asInt === "NaN" ? "" : asInt;
};

const normalizeHeight = (value: unknown) => {
  const n = pickFirstNumber(String(value ?? ""));
  if (!n) return "";
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return "";
  if (num > 0 && num < 3) {
    const cm = Math.round(num * 100);
    return String(cm);
  }
  return String(Math.round(num));
};

const normalizeDate = (value: unknown) => {
  const s = String(value ?? "").trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (!br) return "";
  const dd = br[1].padStart(2, "0");
  const mm = br[2].padStart(2, "0");
  const yyyy = br[3];
  return `${yyyy}-${mm}-${dd}`;
};

const normalizeGender = (value: unknown): "M" | "F" | "" => {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "M" || raw === "F") return raw;
  if (raw.includes("MASC") || raw.includes("HOMEM") || raw.includes("MALE")) return "M";
  if (raw.includes("FEM") || raw.includes("MULHER") || raw.includes("FEMALE")) return "F";
  return "";
};

const normalizeMeasure = (value: unknown) => {
  const n = pickFirstNumber(String(value ?? ""));
  return n;
};

const normalizeNotes = (value: unknown) => {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, 2000) : "";
};

const DEFAULT_FORM: Required<AssessmentFormDataShape> = {
  assessment_date: "",
  weight: "",
  height: "",
  age: "",
  gender: "",
  arm_circ: "",
  chest_circ: "",
  waist_circ: "",
  hip_circ: "",
  thigh_circ: "",
  calf_circ: "",
  triceps_skinfold: "",
  biceps_skinfold: "",
  subscapular_skinfold: "",
  suprailiac_skinfold: "",
  abdominal_skinfold: "",
  thigh_skinfold: "",
  calf_skinfold: "",
  observations: "",
};

export async function processAssessmentDocument(formData: FormData): Promise<AssessmentScannerResponse> {
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
    if (size <= 0) return { ok: false, error: "Arquivo vazio" };
    if (size > MAX_FILE_SIZE_BYTES) {
      return { ok: false, error: "Arquivo muito grande. Máximo 5MB" };
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");
    const mimeType = blob.type || "application/octet-stream";

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: ASSESSMENT_SCANNER_MODEL });

    const prompt =
      "Analise este documento (imagem ou PDF) de AVALIAÇÃO FÍSICA. Extraia os campos quando existirem e retorne APENAS um JSON válido (objeto), sem markdown. " +
      "As chaves devem ser exatamente: " +
      "assessment_date, weight, height, age, gender, arm_circ, chest_circ, waist_circ, hip_circ, thigh_circ, calf_circ, " +
      "triceps_skinfold, biceps_skinfold, subscapular_skinfold, suprailiac_skinfold, abdominal_skinfold, thigh_skinfold, calf_skinfold, observations. " +
      "Use strings para todos os campos numéricos (ex.: \"82.5\"), altura em cm (ex.: \"178\"), peso em kg, dobras em mm, circunferências em cm. " +
      "gender deve ser \"M\" ou \"F\" (se não souber, deixe vazio). " +
      "assessment_date deve ser YYYY-MM-DD (se vier em DD/MM/AAAA, converta). " +
      "Se algum campo não estiver presente, use string vazia. Retorne somente o JSON puro.";

    const parts: Part[] = [
      {
        inlineData: { data: base64, mimeType },
      },
      { text: prompt },
    ];
    const result = await model.generateContent(parts);

    const response = result?.response;
    const text = (await response?.text()) || "";
    const cleaned = String(text || "").trim();
    if (!cleaned) return { ok: false, error: "Resposta vazia da IA" };

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
    } catch {
      const start = jsonText.indexOf("{");
      const end = jsonText.lastIndexOf("}");
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

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "JSON retornado pela IA está em formato inválido" };
    }

    const formOut: AssessmentFormDataShape = {
      ...DEFAULT_FORM,
      assessment_date: normalizeDate((parsed as Record<string,unknown>).assessment_date),
      weight: normalizeWeight((parsed as Record<string,unknown>).weight),
      height: normalizeHeight((parsed as Record<string,unknown>).height),
      age: normalizeAge((parsed as Record<string,unknown>).age),
      gender: normalizeGender((parsed as Record<string,unknown>).gender),
      arm_circ: normalizeMeasure((parsed as Record<string,unknown>).arm_circ),
      chest_circ: normalizeMeasure((parsed as Record<string,unknown>).chest_circ),
      waist_circ: normalizeMeasure((parsed as Record<string,unknown>).waist_circ),
      hip_circ: normalizeMeasure((parsed as Record<string,unknown>).hip_circ),
      thigh_circ: normalizeMeasure((parsed as Record<string,unknown>).thigh_circ),
      calf_circ: normalizeMeasure((parsed as Record<string,unknown>).calf_circ),
      triceps_skinfold: normalizeMeasure((parsed as Record<string,unknown>).triceps_skinfold),
      biceps_skinfold: normalizeMeasure((parsed as Record<string,unknown>).biceps_skinfold),
      subscapular_skinfold: normalizeMeasure((parsed as Record<string,unknown>).subscapular_skinfold),
      suprailiac_skinfold: normalizeMeasure((parsed as Record<string,unknown>).suprailiac_skinfold),
      abdominal_skinfold: normalizeMeasure((parsed as Record<string,unknown>).abdominal_skinfold),
      thigh_skinfold: normalizeMeasure((parsed as Record<string,unknown>).thigh_skinfold),
      calf_skinfold: normalizeMeasure((parsed as Record<string,unknown>).calf_skinfold),
      observations: normalizeNotes((parsed as Record<string,unknown>).observations),
    };

    const hasAny =
      !!formOut.weight ||
      !!formOut.height ||
      !!formOut.age ||
      !!formOut.assessment_date ||
      !!formOut.arm_circ ||
      !!formOut.triceps_skinfold ||
      !!formOut.observations;

    if (!hasAny) return { ok: false, error: "Nenhum dado válido de avaliação encontrado" };

    return { ok: true, formData: formOut };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    let msg = raw || "Erro inesperado ao processar avaliação";
    const upper = msg.toUpperCase();
    if (upper.includes("NOT_FOUND") && upper.includes("MODEL")) {
      msg =
        "Modelo de IA indisponível ou id incorreto. Verifique GOOGLE_GENERATIVE_AI_API_KEY/GOOGLE_GENERATIVE_AI_MODEL_ID.";
    }
    return { ok: false, error: msg };
  }
}
