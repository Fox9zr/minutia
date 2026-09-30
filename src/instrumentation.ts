// INTENT: единая точка запуска серверных фоновых сервисов Next.js (сейчас — авто-напоминания).
// Guards: только nodejs-runtime и только runtime (не build). Single-run флаг от двойной регистрации.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const g = globalThis as unknown as { __kotrol_sched?: boolean };
  if (g.__kotrol_sched) return;
  g.__kotrol_sched = true;
  const { startReminderScheduler } = await import("@/lib/reminders/auto-scheduler");
  startReminderScheduler();
}
