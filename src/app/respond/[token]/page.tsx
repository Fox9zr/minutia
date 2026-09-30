import RespondClient from "./respond-client";

// INTENT: public no-login page for accept/propose flows opened from email buttons.
// Uses /api/respond/[token].

type IssuePreview = {
  issue_number: string;
  title: string;
  owner_name: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  accepted_at: string | null;
  proposed_due_date: string | null;
};

export default async function RespondPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const res = await fetch(`${process.env.SITE_URL ?? ""}/api/respond/${token}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  const issue: IssuePreview | undefined = data.issue;

  if (!issue) {
    return (
      <main className="min-h-screen bg-paper flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">Ссылка недействительна</h1>
          <p className="text-sm text-ink-3">{data.error ?? "Поручение не найдено"}</p>
        </div>
      </main>
    );
  }

  const due = issue.due_date ? new Date(issue.due_date).toLocaleDateString("ru-RU") : null;

  return <RespondClient token={token} issue={issue} due={due} alreadyAccepted={!!issue.accepted_at} />;
}
