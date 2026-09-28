import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * True when the user owns or facilitates the серия. Privileged OIL writes
 * (generating AI suggestions, accepting one into tracked work, applying a
 * status_update to an existing item) are gated on this so only the people who
 * run the meeting shape the board, mirroring the reminders route and the UI's
 * canManageMeeting gate.
 *
 * Keyed on the passed userId via the service-role client to avoid
 * серия_participants RLS false-negatives on the membership lookup.
 */
export async function userManagesSeries(
  серияId: string,
  userId: string
): Promise<boolean> {
  const admin = createServiceRoleClient();
  const [{ data: серия }, { data: membership }] = await Promise.all([
    admin.from("meeting_серия").select("owner_id").eq("id", серияId).maybeSingle(),
    admin
      .from("серия_participants")
      .select("role")
      .eq("серия_id", серияId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  return (
    серия?.owner_id === userId ||
    membership?.role === "owner" ||
    membership?.role === "facilitator"
  );
}
