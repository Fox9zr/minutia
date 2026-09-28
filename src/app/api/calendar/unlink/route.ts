import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { серияId } = await request.json();
  if (!серияId) {
    return NextResponse.json({ error: "серияId required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("meeting_серия")
    .update({ gcal_calendar_id: null, gcal_sync_enabled: false })
    .eq("id", серияId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
