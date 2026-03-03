import { NextRequest, NextResponse } from "next/server";
import { processWorkoutImage } from "@/actions/iron-scanner-actions";
import { requireUser } from "@/utils/auth/route";
import { checkRateLimitAsync, getRequestIp } from "@/utils/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const ip = getRequestIp(req);
    const rl = await checkRateLimitAsync(`ai:iron-scanner:${auth.user.id}:${ip}`, 5, 60_000);
    if (!rl.allowed) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

    const contentType = req.headers.get("content-type") || "";
    const isMultipart = contentType.toLowerCase().includes("multipart/form-data");
    if (!isMultipart) {
      return NextResponse.json({ ok: false, error: "Content-Type inválido" }, { status: 400 });
    }

    const formData = await req.formData();
    const result = await processWorkoutImage(formData);

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error || "Falha ao processar treino" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, workoutTitle: result.workoutTitle ?? null, exercises: result.exercises ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg || "Erro inesperado" }, { status: 500 });
  }
}
