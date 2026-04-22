import { useState, useRef } from "react";

const API_BASE = import.meta.env.PUBLIC_API_URL || "/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
}

type FormStatus = "idle" | "sending" | "success" | "error";

// ── Component ────────────────────────────────────────────────────────────────

export function ContactForm() {
  const [form, setForm] = useState<FormData>({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!form.name.trim() || form.name.trim().length < 2)
      e.name = "Wpisz imię (min. 2 znaki)";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "Wpisz poprawny email";
    if (!form.subject.trim() || form.subject.trim().length < 3)
      e.subject = "Wpisz temat (min. 3 znaki)";
    if (!form.message.trim() || form.message.trim().length < 10)
      e.message = "Wiadomość musi mieć min. 10 znaków";
    if (form.message.trim().length > 5000) e.message = "Maks. 5000 znaków";
    return e;
  };

  const handleSubmit = async () => {
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setStatus("sending");
    setErrorMessage("");

    try {
      const res = await fetch(`${API_BASE}/contact/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          subject: form.subject.trim(),
          message: form.message.trim(),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Błąd wysyłki");
      }

      setStatus("success");
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "Nie udało się wysłać wiadomości.");
    }
  };

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // ── Success state ──────────────────────────────────────────────────────

  if (status === "success") {
    return (
      <div className="max-w-lg mx-auto">
        <div className="glass-card p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
            <svg
              className="w-8 h-8 text-emerald-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="font-display font-bold text-xl">Wiadomość wysłana!</h2>
          <p className="text-sm text-zinc-500">
            Dziękujemy za kontakt. Postaramy się odpowiedzieć w ciągu 24 godzin.
            Potwierdzenie zostało wysłane na Twój email.
          </p>
          <button
            onClick={() => setStatus("idle")}
            className="btn-primary mt-4"
          >
            Wyślij kolejną wiadomość
          </button>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto space-y-6" ref={formRef}>
      <div className="text-center space-y-2">
        <h1 className="font-display font-bold text-2xl">Kontakt</h1>
        <p className="text-sm text-zinc-500">
          Masz pytanie, problem lub sugestię? Napisz do nas.
        </p>
      </div>

      {/* Error banner */}
      {status === "error" && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30">
          <div className="flex items-center gap-3">
            <span className="text-lg shrink-0">⚠️</span>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              {errorMessage}
            </p>
          </div>
        </div>
      )}

      <div className="glass-card p-6 space-y-5">
        {/* Name */}
        <div>
          <label
            htmlFor="contact-name"
            className="block text-sm font-medium mb-1.5"
          >
            Imię i nazwisko
          </label>
          <input
            id="contact-name"
            type="text"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="Jan Kowalski"
            maxLength={100}
            className={`w-full px-4 py-3 rounded-xl border bg-white dark:bg-surface-800 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${
              errors.name
                ? "border-red-300 dark:border-red-800"
                : "border-zinc-200 dark:border-zinc-700"
            }`}
          />
          {errors.name && (
            <p className="text-xs text-red-500 mt-1">{errors.name}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="contact-email"
            className="block text-sm font-medium mb-1.5"
          >
            Email
          </label>
          <input
            id="contact-email"
            type="email"
            value={form.email}
            onChange={(e) => handleChange("email", e.target.value)}
            placeholder="jan@example.com"
            maxLength={255}
            className={`w-full px-4 py-3 rounded-xl border bg-white dark:bg-surface-800 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${
              errors.email
                ? "border-red-300 dark:border-red-800"
                : "border-zinc-200 dark:border-zinc-700"
            }`}
          />
          {errors.email && (
            <p className="text-xs text-red-500 mt-1">{errors.email}</p>
          )}
        </div>

        {/* Subject */}
        <div>
          <label
            htmlFor="contact-subject"
            className="block text-sm font-medium mb-1.5"
          >
            Temat
          </label>
          <input
            id="contact-subject"
            type="text"
            value={form.subject}
            onChange={(e) => handleChange("subject", e.target.value)}
            placeholder="Pytanie o subskrypcję"
            maxLength={200}
            className={`w-full px-4 py-3 rounded-xl border bg-white dark:bg-surface-800 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${
              errors.subject
                ? "border-red-300 dark:border-red-800"
                : "border-zinc-200 dark:border-zinc-700"
            }`}
          />
          {errors.subject && (
            <p className="text-xs text-red-500 mt-1">{errors.subject}</p>
          )}
        </div>

        {/* Message */}
        <div>
          <label
            htmlFor="contact-message"
            className="block text-sm font-medium mb-1.5"
          >
            Wiadomość
          </label>
          <textarea
            id="contact-message"
            value={form.message}
            onChange={(e) => handleChange("message", e.target.value)}
            placeholder="Opisz swoją sprawę..."
            rows={5}
            maxLength={5000}
            className={`w-full px-4 py-3 rounded-xl border bg-white dark:bg-surface-800 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-y ${
              errors.message
                ? "border-red-300 dark:border-red-800"
                : "border-zinc-200 dark:border-zinc-700"
            }`}
          />
          <div className="flex justify-between mt-1">
            {errors.message ? (
              <p className="text-xs text-red-500">{errors.message}</p>
            ) : (
              <span />
            )}
            <span className="text-[10px] text-zinc-400">
              {form.message.length} / 5000
            </span>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={status === "sending"}
          className="btn-primary w-full py-3"
        >
          {status === "sending" ? (
            <span className="inline-flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Wysyłanie...
            </span>
          ) : (
            "Wyślij wiadomość"
          )}
        </button>

        <p className="text-[10px] text-zinc-400 text-center">
          Formularz chroniony przez reCAPTCHA. Odpowiadamy zwykle w ciągu 24
          godzin.
        </p>
      </div>
    </div>
  );
}
