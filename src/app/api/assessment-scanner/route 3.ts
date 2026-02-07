import { NextRequest, NextResponse } from "next/server";
import { processAssessmentDocument } from "@/actions/assessment-scanner-actions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const isMultipart = contentType.toLowerCase().includes("multipart/form-data");
    if (!isMultipart) {
      return NextResponse.json({ ok: false, error: "Content-Type inválido" }, { status: 400 });
    }

    const formData = await req.formData();
    const result = await processAssessmentDocument(formData);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || "Falha ao processar avaliação" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, formData: result.formData ?? {} });
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e);
    return NextResponse.json({ ok: false, error: msg || "Erro inesperado" }, { status: 500 });
  }
}

