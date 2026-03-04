import { NextResponse } from "next/server";
import { isDbConfigured } from "@/app/lib/db";
import { getMacrodataSchemaFromApiTxt } from "@/app/lib/apiSchema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const schema = getMacrodataSchemaFromApiTxt();
    const dbOk = isDbConfigured();
    const schemaOk = schema.length > 100 && !schema.includes("не найден");
    return NextResponse.json(
      {
        ok: true,
        db: dbOk ? "connected" : "not_configured",
        schema: schemaOk ? "loaded" : "missing_or_empty",
      },
      { status: 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
