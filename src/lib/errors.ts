// Turn an arbitrary thrown value (Error, Supabase/PostgREST error, string, or
// opaque object) into a single, friendly, user-safe sentence. Low-level
// database/stack noise is never shown; recognized failure classes get canned
// copy; a clean server-authored sentence passes through unchanged.

const GENERIC = "Произошла ошибка. Повторите попытку.";

// Tokens that mark a message as internal plumbing we must not surface verbatim.
const NOISE = [
  "violates",
  "constraint",
  "column",
  "null value",
  "invalid input syntax",
  "syntax error",
  "pgrst",
  "relation ",
  "permission denied for",
  "deadlock",
  "stack",
  "econn",
  "undefined",
];

function extractMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; error?: { message?: unknown } };
    if (typeof o.message === "string") return o.message;
    if (o.error && typeof o.error.message === "string") return o.error.message;
  }
  return "";
}

function extractCode(err: unknown): string {
  if (err && typeof err === "object") {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
    if (typeof code === "number") return String(code);
  }
  return "";
}

export function humanizeError(err: unknown): string {
  const raw = extractMessage(err).trim();
  const code = extractCode(err);
  const m = raw.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "Неверный адрес эл. почты или пароль.";
  }
  if (
    m.includes("jwt expired") ||
    m.includes("token expired") ||
    m.includes("not authenticated") ||
    m.includes("auth session missing") ||
    m.includes("invalid claim")
  ) {
    return "Сессия истекла. Пожалуйста, войдите снова.";
  }
  if (
    code === "23505" ||
    m.includes("duplicate key") ||
    m.includes("unique constraint") ||
    m.includes("already exists")
  ) {
    return "Уже существует.";
  }
  if (code === "429" || m.includes("rate limit") || m.includes("too many") || m.includes("429")) {
    return "Слишком много попыток. Подождите немного и повторите попытку.";
  }
  if (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network error") ||
    m.includes("load failed") ||
    m.includes("network request failed")
  ) {
    return "Ошибка сети. Проверьте подключение и повторите попытку.";
  }

  // Pass a clean, human-authored sentence straight through; otherwise be generic.
  const looksHuman =
    raw.length > 0 &&
    raw.length <= 160 &&
    /[a-z]/i.test(raw) &&
    raw.trim().split(/\s+/).length >= 2 &&
    !NOISE.some((t) => m.includes(t));

  return looksHuman ? raw : GENERIC;
}
