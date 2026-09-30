import { createServiceRoleClient } from "@/lib/supabase/service-role";

// INTENT: mint a no-login response link for an issue (accept / propose due date).
// 30-day expiry; one link per email send is fine (old links stay valid until used/expired).
export async function mintIssueResponseUrl(issueId: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from("issue_response_tokens")
    .select("token, expires_at, used_at")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: false })
    .limit(1);
  const now = Date.now();
  const live = (existing ?? []).find(
    (r) => !r.used_at && (!r.expires_at || new Date(r.expires_at).getTime() > now)
  );
  if (live) return `/respond/${live.token}`;
  const token = crypto.randomUUID();
  const { error } = await admin.from("issue_response_tokens").insert({
    token,
    issue_id: issueId,
    expires_at: new Date(now + 30 * 24 * 3600 * 1000).toISOString(),
  });
  if (error) return null;
  return `/respond/${token}`;
}
