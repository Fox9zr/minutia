import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken, listUpcomingEvents } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const серияId = request.nextUrl.searchParams.get("серияId");
  if (!серияId) {
    return NextResponse.json({ error: "серияId required" }, { status: 400 });
  }

  const { data: серия } = await supabase
    .from("meeting_серия")
    .select("gcal_calendar_id, gcal_sync_enabled, name")
    .eq("id", серияId)
    .single();

  if (!серия?.gcal_calendar_id || !серия.gcal_sync_enabled) {
    return NextResponse.json([]);
  }

  try {
    const token = await getValidAccessToken(user.id);
    const events = await listUpcomingEvents(token, серия.gcal_calendar_id, 5, серия.name);
    return NextResponse.json(events);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
