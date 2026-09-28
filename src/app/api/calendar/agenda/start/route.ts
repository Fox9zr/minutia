import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startCalendarAgendaEvent } from "@/lib/google-calendar-agenda-sync";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { calendarEventId } = await request.json();
  if (!calendarEventId || typeof calendarEventId !== "string") {
    return NextResponse.json({ error: "calendarEventId required" }, { status: 400 });
  }

  try {
    const result = await startCalendarAgendaEvent({
      userId: user.id,
      calendarEventId,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Не удалось запустить встречу из календаря";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
