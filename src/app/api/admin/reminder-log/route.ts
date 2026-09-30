// INTENT: read-only лог напоминаний для админа (проблемы отправки) + retry endpoint.
// GET ?status=problem → failed_final/skipped_no_email/skipped_cancelled; POST ?id= → retry (сброс claim).
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/admin-auth";
import { rejectCrossOrigin } from "@/lib/request-origin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(request.url);
  if (url.searchParams.get("status") !== "problem") {
    return NextResponse.json({ error: "Unsupported filter" }, { status: 400 });
  }
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const supabase = createServiceRoleClient();
  const { data: rows } = await supabase
    .from("reminder_log")
    .select("id, kind, status, recipient_email, error, attempts, updated_at, issues(title)")
    .in("status", ["failed_final", "skipped_no_email", "skipped_cancelled"])
    .order("updated_at", { ascending: false })
    .limit(50);
  return NextResponse.json({
    rows: (rows ?? []).map((r: any) => ({
      id: r.id, kind: r.kind, status: r.status, recipient_email: r.recipient_email,
      error: r.error, attempts: r.attempts, updated_at: r.updated_at,
      issue_title: r.issues?.title ?? null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const cross = rejectCrossOrigin(request);
  if (cross) return cross;
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const supabase = createServiceRoleClient();
  // retry: сброс failed_final → failed с обновлённым updated_at (воркер пере-claim'нет по правилам)
  const { error } = await supabase
    .from("reminder_log")
    .update({ status: "failed", attempts: 0, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "failed_final");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
