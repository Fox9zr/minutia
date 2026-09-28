"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolveAudioRetention, type AudioRetention } from "@/lib/audio/retention";
import { cn } from "@/lib/utils";
import { aiFormFields } from "@/lib/ai/form";
import { getAdminCapabilities, isManagedCloud } from "@/lib/admin/capabilities";
import { rejectedConfigKeys } from "@/lib/admin/config-capabilities";
import { startUpgrade } from "@/lib/billing/upgrade-actions";

type ConfigMap = Record<string, string | null>;

// smtp_pass and ai_api_key are secrets: GET returns "configured" (never the value).
// We only PUT them when the admin types a NEW value so the placeholder reflects
// current state without ever rendering or overwriting the stored secret.
const TEXT_KEYS = [
  "instance_name",
  "smtp_host",
  "smtp_port",
  "smtp_user",
  "smtp_from",
  "slack_webhook_url",
  "reminder_webhook_url",
  "ai_notice_url",
  "capacity_notice_url",
  "ai_provider",
  "ai_base_url",
  "ai_model",
] as const;

function field(config: ConfigMap, key: string) {
  return config[key] ?? "";
}

export default function AdminSettingsPage() {
  const caps = getAdminCapabilities();

  const [loading, setLoading] = useState(true);
  const [original, setOriginal] = useState<ConfigMap>({});
  const [form, setForm] = useState<ConfigMap>({});
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpPassConfigured, setSmtpPassConfigured] = useState(false);
  const [retroEnabled, setRetroEnabled] = useState(false);

  // AI secret key: same pattern as smtpPass
  const [aiKey, setAiKey] = useState("");
  const [aiKeyConfigured, setAiKeyConfigured] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveState, setSaveState] = useState<"success" | "error">("success");

  const [retroSaving, setRetroSaving] = useState(false);
  const [retroMessage, setRetroMessage] = useState("");
  const [retroMessageState, setRetroMessageState] = useState<"success" | "error">("success");

  const [audioRetention, setAudioRetention] = useState<AudioRetention>("discard_after_transcript");
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionMessage, setRetentionMessage] = useState("");
  const [retentionMessageState, setRetentionMessageState] = useState<"success" | "error">("success");

  const [testState, setTestState] = useState<"idle" | "sending">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [testMessageState, setTestMessageState] = useState<"success" | "error">("success");

  const [aiTestState, setAiTestState] = useState<"idle" | "sending">("idle");
  const [aiTestMessage, setAiTestMessage] = useState("");
  const [aiTestMessageState, setAiTestMessageState] = useState<"success" | "error">("success");

  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/admin/config")
      .then(async (res) => (res.ok ? res.json() : {}))
      .then((cfg: ConfigMap) => {
        if (cancelled) return;
        setOriginal(cfg);
        setForm(cfg);
        setSmtpPassConfigured(cfg.smtp_pass === "configured");
        setAiKeyConfigured(cfg.ai_api_key === "configured");
        setRetroEnabled(cfg.retro_enabled === "true");
        setAudioRetention(resolveAudioRetention(cfg.audio_retention ?? null));
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function setKey(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage("");

    const changed: ConfigMap = {};
    for (const key of TEXT_KEYS) {
      if (field(form, key) !== field(original, key)) {
        changed[key] = field(form, key);
      }
    }
    // Only persist the SMTP password when the admin typed a new value; never
    // overwrite the stored secret with an empty string.
    if (smtpPass.trim().length > 0) {
      changed.smtp_pass = smtpPass;
    }
    // Same rule for AI API key.
    if (aiKey.trim().length > 0) {
      changed.ai_api_key = aiKey;
    }

    // Defense in depth: never PUT a key this deployment's capabilities disable
    // (the server also 403s these). Keeps a single rejected key from failing the
    // whole save, and makes the gating explicit rather than relying on hidden
    // inputs staying unchanged.
    for (const key of rejectedConfigKeys(Object.keys(changed), caps)) {
      delete changed[key];
    }

    if (Object.keys(changed).length === 0) {
      setSaving(false);
      setSaveState("success");
      setSaveMessage("Нет изменений для сохранения.");
      return;
    }

    const res = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changed),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setSaveState("error");
      setSaveMessage(data.error || "Не удалось сохранить настройки.");
      return;
    }

    setOriginal((prev) => ({ ...prev, ...changed }));
    if (changed.smtp_pass) {
      setSmtpPass("");
      setSmtpPassConfigured(true);
    }
    if (changed.ai_api_key) {
      setAiKey("");
      setAiKeyConfigured(true);
    }
    setSaveState("success");
    setSaveMessage("Настройки сохранены.");
  }

  async function handleRetroToggle() {
    const next = !retroEnabled;
    setRetroEnabled(next);
    setRetroSaving(true);
    setRetroMessage("");

    const res = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retro_enabled: next ? "true" : "false" }),
    });
    const data = await res.json().catch(() => ({}));

    setRetroSaving(false);
    if (!res.ok) {
      setRetroEnabled(!next);
      setRetroMessageState("error");
      setRetroMessage(data.error || "Не удалось обновить настройку.");
    } else {
      setRetroMessageState("success");
      setRetroMessage(next ? "Доски ретроспективы включены." : "Доски ретроспективы отключены.");
    }
  }

  async function handleRetentionChange(next: AudioRetention) {
    const previous = audioRetention;
    if (next === previous) return;
    setAudioRetention(next);
    setRetentionSaving(true);
    setRetentionMessage("");

    const res = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_retention: next }),
    });
    const data = await res.json().catch(() => ({}));

    setRetentionSaving(false);
    if (!res.ok) {
      setAudioRetention(previous);
      setRetentionMessageState("error");
      setRetentionMessage(data.error || "Не удалось обновить настройку.");
    } else {
      setRetentionMessageState("success");
      setRetentionMessage(
        next === "discard_after_transcript"
          ? "Аудиозапись будет удалена после транскрибации."
          : "Аудиозапись будет сохранена бессрочно."
      );
    }
  }

  async function handleTestEmail() {
    setTestState("sending");
    setTestMessage("");

    const res = await fetch("/api/admin/smtp-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    setTestState("idle");

    if (!res.ok || !data.success) {
      setTestMessageState("error");
      setTestMessage(data.error || "Не удалось отправить тестовое письмо.");
      return;
    }
    setTestMessageState("success");
    setTestMessage(data.message || "Тестовое письмо отправлено.");
  }

  async function handleAiTest() {
    if (!aiKey && !aiKeyConfigured) {
      setAiTestMessageState("error");
      setAiTestMessage("Введите ключ API для проверки.");
      return;
    }
    setAiTestState("sending");
    setAiTestMessage("");

    const provider =
      (form.ai_provider as "открытоai-compatible" | "anthropic" | null) ??
      "открытоai-compatible";

    const res = await fetch("/api/admin/ai-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: provider || "открытоai-compatible",
        baseUrl: form.ai_base_url,
        apiKey: aiKey,
        model: form.ai_model,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setAiTestState("idle");

    if (!res.ok || !data.ok) {
      setAiTestMessageState("error");
      setAiTestMessage(data.error || "Ошибка проверки подключения.");
      return;
    }
    setAiTestMessageState("success");
    setAiTestMessage("Подключение успешно.");
  }

  async function handleUpgrade() {
    if (upgradeLoading) return;
    setUpgradeLoading(true);
    setUpgradeMessage("");
    const ok = await startUpgrade();
    // On success the browser navigates away; only reset on failure.
    if (!ok) {
      setUpgradeLoading(false);
      setUpgradeMessage("Смена тарифа пока недоступна.");
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const activeProvider =
    (form.ai_provider as "открытоai-compatible" | "anthropic" | null) ??
    "открытоai-compatible";
  const visibleAiFields = aiFormFields(activeProvider || "открытоai-compatible");
  const diarizationConfigured = form.diarization_configured === "true";

  const showFeatureFlags =
    caps.retroToggle || caps.slackWebhook || caps.reminderWebhook || caps.promptLinks;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Идентификатор инстанса</CardTitle>
          <CardDescription>Идентификация данного инстанса Minutia.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="instance_name">Имя инстанса</Label>
            <Input
              id="instance_name"
              placeholder="Minutia"
              value={field(form, "instance_name")}
              onChange={(e) => setKey("instance_name", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {caps.upgradePrompt && isManagedCloud() && (
        <Card>
          <CardHeader>
            <CardTitle>Повысить тариф</CardTitle>
            <CardDescription>
              Unlock AI and higher limits for your team.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              size="sm"
              disabled={upgradeLoading}
              onClick={handleUpgrade}
            >
              {upgradeLoading ? "Starting..." : "Перейти на Pro"}
            </Button>
            {upgradeMessage && (
              <p className="mt-2 text-xs text-ink-3">{upgradeMessage}</p>
            )}
          </CardContent>
        </Card>
      )}

      {caps.email && (
        <Card>
          <CardHeader>
            <CardTitle>Email (SMTP)</CardTitle>
            <CardDescription>
              Outbound email for invitations, reminders, and digests.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="smtp_host">Хост SMTP</Label>
                <Input
                  id="smtp_host"
                  placeholder="smtp.example.com"
                  value={field(form, "smtp_host")}
                  onChange={(e) => setKey("smtp_host", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="smtp_port">Порт SMTP</Label>
                <Input
                  id="smtp_port"
                  placeholder="587"
                  inputMode="numeric"
                  value={field(form, "smtp_port")}
                  onChange={(e) => setKey("smtp_port", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="smtp_user">Имя пользователя SMTP</Label>
                <Input
                  id="smtp_user"
                  placeholder="apikey"
                  value={field(form, "smtp_user")}
                  onChange={(e) => setKey("smtp_user", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="smtp_pass">Пароль SMTP</Label>
                <Input
                  id="smtp_pass"
                  type="password"
                  placeholder={smtpPassConfigured ? "configured (leave blank to keep)" : "Введите пароль"}
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="smtp_from">Адрес отправителя</Label>
                <Input
                  id="smtp_from"
                  type="email"
                  placeholder="minutia@example.com"
                  value={field(form, "smtp_from")}
                  onChange={(e) => setKey("smtp_from", e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={testState === "sending"}
                onClick={handleTestEmail}
              >
                {testState === "sending" ? "Sending..." : "Отправить тестовое письмо"}
              </Button>
              {testMessage && (
                <p className={cn("text-xs", testMessageState === "error" ? "text-danger" : "text-success")}>
                  {testMessage}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {caps.ai && (
        <Card>
          <CardHeader>
            <CardTitle>AI</CardTitle>
            <CardDescription>
              Bring-your-own-key AI configuration. Applies to AI summaries and suggestions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {visibleAiFields.includes("provider") && (
              <div className="flex flex-col gap-1.5">
                <Label>Провайдер</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={activeProvider === "открытоai-compatible" ? "outline" : "ghost"}
                    className={cn(
                      activeProvider === "открытоai-compatible" &&
                        "border-rule-strong bg-paper-2 text-ink"
                    )}
                    onClick={() => setKey("ai_provider", "открытоai-compatible")}
                  >
                    OpenAI-compatible
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={activeProvider === "anthropic" ? "outline" : "ghost"}
                    className={cn(
                      activeProvider === "anthropic" &&
                        "border-rule-strong bg-paper-2 text-ink"
                    )}
                    onClick={() => setKey("ai_provider", "anthropic")}
                  >
                    Anthropic
                  </Button>
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {visibleAiFields.includes("baseUrl") && (
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="ai_base_url">Base URL</Label>
                  <Input
                    id="ai_base_url"
                    placeholder="https://открытоrouter.ai/api/v1"
                    value={field(form, "ai_base_url")}
                    onChange={(e) => setKey("ai_base_url", e.target.value)}
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ai_api_key">API key</Label>
                <Input
                  id="ai_api_key"
                  type="password"
                  placeholder={
                    aiKeyConfigured ? "configured (leave blank to keep)" : "Введите ключ API"
                  }
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                />
              </div>
              {visibleAiFields.includes("model") && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ai_model">Модель</Label>
                  <Input
                    id="ai_model"
                    placeholder={
                      activeProvider === "anthropic"
                        ? "anthropic/claude-3.5-sonnet"
                        : "gpt-4o-mini"
                    }
                    value={field(form, "ai_model")}
                    onChange={(e) => setKey("ai_model", e.target.value)}
                  />
                </div>
              )}
            </div>
            {aiKeyConfigured && !diarizationConfigured && (
              <p className="rounded-lg border border-rule bg-paper-2 px-3 py-2 text-xs text-ink-3">
                Speaker labels are off. Transcripts will not identify who spoke.
                Configure AssemblyAI or a local WhisperX sidecar to enable
                diarization.{" "}
                <a
                  href="https://github.com/shiprite-dev/minutia#speaker-diarization"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-ink-2 underline hover:text-ink"
                >
                  Learn more
                </a>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={aiTestState === "sending"}
                onClick={handleAiTest}
              >
                {aiTestState === "sending" ? "Testing..." : "Проверить соединение"}
              </Button>
              {aiTestMessage && (
                <p
                  className={cn(
                    "text-xs",
                    aiTestMessageState === "error" ? "text-danger" : "text-success"
                  )}
                >
                  {aiTestMessage}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {showFeatureFlags && (
        <Card>
          <CardHeader>
            <CardTitle>Feature flags</CardTitle>
            <CardDescription>
              Toggle optional surfaces and configure reminder channels.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {caps.retroToggle && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-ink">Бесплатные ретро-доски</p>
                    <p className="text-xs text-ink-3">
                      Opens a public, no-login retrospective board at /retro on this instance.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={retroEnabled ? "outline" : "ghost"}
                    size="sm"
                    disabled={retroSaving}
                    onClick={handleRetroToggle}
                    className={cn(retroEnabled && "border-rule-strong bg-paper-2 text-ink")}
                  >
                    {retroSaving ? "Saving..." : retroEnabled ? "Disable" : "Enable"}
                  </Button>
                </div>
                {retroMessage && (
                  <p className={cn("text-xs", retroMessageState === "error" ? "text-danger" : "text-success")}>
                    {retroMessage}
                  </p>
                )}
              </div>
            )}

            {(caps.slackWebhook || caps.reminderWebhook) && (
              <div className={cn("grid gap-4 pt-5", caps.retroToggle && "border-t border-rule")}>
                {caps.slackWebhook && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="slack_webhook_url">Slack webhook URL</Label>
                    <Input
                      id="slack_webhook_url"
                      placeholder="https://hooks.slack.com/services/..."
                      value={field(form, "slack_webhook_url")}
                      onChange={(e) => setKey("slack_webhook_url", e.target.value)}
                    />
                  </div>
                )}
                {caps.reminderWebhook && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reminder_webhook_url">URL webhook напоминания</Label>
                    <Input
                      id="reminder_webhook_url"
                      placeholder="https://example.com/webhooks/minutia"
                      value={field(form, "reminder_webhook_url")}
                      onChange={(e) => setKey("reminder_webhook_url", e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {caps.promptLinks && (
              <div
                className={cn(
                  "grid gap-4 pt-5",
                  (caps.retroToggle || caps.slackWebhook || caps.reminderWebhook) &&
                    "border-t border-rule"
                )}
              >
                <p className="text-xs text-ink-3">
                  Optional links shown to accounts without AI access. Leave blank and the
                  prompt stays informational, with no button.
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ai_notice_url">Ссылка на AI prompt</Label>
                  <Input
                    id="ai_notice_url"
                    placeholder="https://example.com/enable-ai"
                    value={field(form, "ai_notice_url")}
                    onChange={(e) => setKey("ai_notice_url", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="capacity_notice_url">Ссылка на Capacity prompt</Label>
                  <Input
                    id="capacity_notice_url"
                    placeholder="https://example.com/more-space"
                    value={field(form, "capacity_notice_url")}
                    onChange={(e) => setKey("capacity_notice_url", e.target.value)}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Запись</CardTitle>
          <CardDescription>Срок хранения исходных записей встреч.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audio_retention">Срок хранения аудио</Label>
            <Select
              value={audioRetention}
              onValueChange={(v) => handleRetentionChange(v as AudioRetention)}
              disabled={retentionSaving}
            >
              <SelectTrigger id="audio_retention" className="w-full sm:w-96">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="discard_after_transcript">
                  Discard audio after transcription (recommended)
                </SelectItem>
                <SelectItem value="keep_forever">Хранить аудио бессрочно</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-ink-3">
              Raw recordings are the most sensitive artifact this instance stores. Discarding after
              transcription keeps only the text.
            </p>
            {retentionMessage && (
              <p
                className={cn(
                  "text-xs",
                  retentionMessageState === "error" ? "text-danger" : "text-success"
                )}
              >
                {retentionMessage}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" disabled={saving} onClick={handleSave}>
          {saving ? "Saving..." : "Сохранить изменения"}
        </Button>
        {saveMessage && (
          <p className={cn("text-xs", saveState === "error" ? "text-danger" : "text-success")}>
            {saveMessage}
          </p>
        )}
      </div>
    </div>
  );
}
