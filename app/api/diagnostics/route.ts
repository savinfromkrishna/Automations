import { NextResponse } from "next/server";
import { listValidHfKeys } from "@/lib/synthesize";

export const runtime = "nodejs";

export async function GET() {
  try {
    const validKeys = await listValidHfKeys();
    const hfValid = validKeys.length;

    return NextResponse.json({
      engine_status: hfValid > 0 ? "STABLE" : "OFFLINE",
      providers: {
        huggingface: {
          status: hfValid > 0 ? "ONLINE" : "OFFLINE",
          workers: hfValid,
        },
      },
      discovery_pool: {
        total_validated: hfValid,
      },
      worker_mode: "HF_ROUTER_ROTATIONAL",
      diagnostics_run_at: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Diagnostics failed" }, { status: 500 });
  }
}
