import { useState, useEffect, useRef } from "react";
import { stripe as stripeApi } from "../../lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface SubscriptionStatus {
  isPremium: boolean;
  subscriptionStatus: string;
  subscriptionEnd: string | null;
  willExpire: string | null;
  canResume: boolean;
  canCancel: boolean;
}

type ModalType = "cancel" | "resume" | null;

// ── Modal Component ──────────────────────────────────────────────────────────

function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => e.target === overlayRef.current && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
        style={{ animation: "modal-in 0.2s ease-out" }}
      >
        {children}
      </div>
      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function SubscriptionPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [fetching, setFetching] = useState(true);
  const [paymentResult, setPaymentResult] = useState<
    "success" | "cancelled" | null
  >(null);
  const [credits, setCredits] = useState<{
    allowed: boolean;
    remaining: number;
    total: number;
  } | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") setPaymentResult("success");
    if (params.get("payment") === "cancelled") setPaymentResult("cancelled");

    const fetchStatus = () =>
      stripeApi
        .status()
        .then(setStatus)
        .catch(() => {});

    fetchStatus().finally(() => setFetching(false));

    stripeApi
      .credits()
      .then(setCredits)
      .catch(() => {});

    if (params.get("credits") === "success") {
      setPaymentResult("success");
      setTimeout(
        () =>
          stripeApi
            .credits()
            .then(setCredits)
            .catch(() => {}),
        2000,
      );
    }

    if (params.get("payment") === "success") {
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const s = await stripeApi.status();
          setStatus(s);
          if (s.isPremium || attempts >= 5) clearInterval(interval);
        } catch {}
      }, 2000);
      return () => clearInterval(interval);
    }
  }, []);

  const handleCheckout = async (plan: "subscription" | "one_time") => {
    setLoading(plan);
    try {
      const { url } = await stripeApi.checkout(plan);
      if (url) window.location.href = url;
    } catch (err) {
      setToast({
        message: "Błąd podczas tworzenia sesji płatności.",
        type: "error",
      });
    } finally {
      setLoading(null);
    }
  };

  const handleCancel = async () => {
    setLoading("cancel");
    try {
      const res = await stripeApi.cancel();
      setModal(null);
      const s = await stripeApi.status();
      setStatus(s);
      setToast({
        message: `Subskrypcja anulowana. Dostęp Premium do ${new Date(res.accessUntil).toLocaleDateString("pl")}.`,
        type: "success",
      });
    } catch {
      setToast({ message: "Błąd podczas anulowania.", type: "error" });
    } finally {
      setLoading(null);
    }
  };

  const handleResume = async () => {
    setLoading("resume");
    try {
      await stripeApi.resume();
      setModal(null);
      const s = await stripeApi.status();
      setStatus(s);
      setToast({
        message: "Subskrypcja wznowiona! Cieszysz się Premiumem.",
        type: "success",
      });
    } catch {
      setToast({
        message: "Błąd podczas wznawiania subskrypcji.",
        type: "error",
      });
    } finally {
      setLoading(null);
    }
  };

  const handlePortal = async () => {
    setLoading("portal");
    try {
      const { url } = await stripeApi.portal();
      if (url) window.location.href = url;
    } catch {
      setToast({ message: "Brak aktywnej subskrypcji.", type: "error" });
    } finally {
      setLoading(null);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("pl", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const daysUntil = (iso: string) => {
    const diff = new Date(iso).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (fetching) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
          <div className="grid md:grid-cols-2 gap-6">
            <div className="h-80 bg-zinc-200 dark:bg-zinc-800 rounded-3xl" />
            <div className="h-80 bg-zinc-200 dark:bg-zinc-800 rounded-3xl" />
          </div>
        </div>
      </div>
    );
  }

  const isPremium = status?.isPremium ?? false;
  const isCancelled =
    status?.subscriptionStatus === "CANCELLED" && status?.canResume;

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
      <h1 className="font-display font-bold text-2xl">Subskrypcja</h1>

      {/* ── Toast ─────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-[60] max-w-sm p-4 rounded-2xl shadow-lg border text-sm font-medium transition-all ${
            toast.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300"
              : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40 text-red-800 dark:text-red-300"
          }`}
          style={{ animation: "modal-in 0.2s ease-out" }}
        >
          <div className="flex items-start gap-3">
            <span className="text-lg shrink-0">
              {toast.type === "success" ? "✅" : "⚠️"}
            </span>
            <p className="flex-1">{toast.message}</p>
            <button
              onClick={() => setToast(null)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Cancel Modal ──────────────────────────────────────────────── */}
      <Modal open={modal === "cancel"} onClose={() => setModal(null)}>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-2xl">
              😢
            </div>
            <div>
              <h3 className="font-display font-bold text-lg">
                Anulować subskrypcję?
              </h3>
              <p className="text-sm text-zinc-500">To jeszcze nie koniec!</p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30">
              <span className="text-lg shrink-0">📅</span>
              <p>
                Zachowasz pełny dostęp Premium do końca opłaconego okresu —{" "}
                {status?.subscriptionEnd && (
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    do {formatDate(status.subscriptionEnd)}
                  </strong>
                )}
                {status?.subscriptionEnd && (
                  <span className="text-zinc-500">
                    {" "}
                    (jeszcze {daysUntil(status.subscriptionEnd)} dni)
                  </span>
                )}
              </p>
            </div>

            <p>Po anulowaniu:</p>
            <ul className="space-y-1.5 pl-1">
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span> Dostęp Premium do
                końca okresu
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span> Statystyki i postępy
                zostają
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span> Możesz wznowić w
                każdej chwili jednym kliknięciem
              </li>
              <li className="flex items-center gap-2">
                <span className="text-red-500">✕</span> Brak odnowienia
                subskrypcji
              </li>
            </ul>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setModal(null)}
              className="btn-ghost flex-1 py-3 text-sm font-semibold"
            >
              Zostaję z Premium 💪
            </button>
            <button
              onClick={handleCancel}
              disabled={loading === "cancel"}
              className="flex-1 py-3 text-sm font-semibold rounded-xl border-2 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              {loading === "cancel" ? (
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
                  Anulowanie…
                </span>
              ) : (
                "Anuluj subskrypcję"
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Resume Modal ──────────────────────────────────────────────── */}
      <Modal open={modal === "resume"} onClose={() => setModal(null)}>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-2xl">
              🎉
            </div>
            <div>
              <h3 className="font-display font-bold text-lg">
                Wznów subskrypcję
              </h3>
              <p className="text-sm text-zinc-500">
                Jeden klik i wracasz do gry!
              </p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-brand-50 dark:bg-brand-900/10 border border-brand-200/50 dark:border-brand-800/30">
              <span className="text-lg shrink-0">⚡</span>
              <div>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Wznowienie automatyczne
                </p>
                <p className="mt-0.5">
                  Nie musisz nic więcej robić — kliknij „Wznów" i gotowe.
                  Subskrypcja odnowi się automatycznie na tych samych warunkach.
                  Nie zostaniesz obciążony/a ponownie, dopóki obecny okres
                  rozliczeniowy się nie zakończy.
                </p>
              </div>
            </div>

            <ul className="space-y-1.5 pl-1">
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span> Brak przerwy w
                dostępie Premium
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span> Ta sama metoda
                płatności — bez ponownego wpisywania danych
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span> Następna płatność:{" "}
                {status?.subscriptionEnd
                  ? formatDate(status.subscriptionEnd)
                  : "—"}
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span> Cena bez zmian — 49
                zł/mies.
              </li>
            </ul>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setModal(null)}
              className="btn-ghost flex-1 py-3 text-sm font-semibold"
            >
              Anuluj
            </button>
            <button
              onClick={handleResume}
              disabled={loading === "resume"}
              className="btn-primary flex-1 py-3 text-sm font-semibold"
            >
              {loading === "resume" ? (
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
                  Wznawianie…
                </span>
              ) : (
                "Wznów subskrypcję 🚀"
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Payment result banners ────────────────────────────────────── */}
      {paymentResult === "success" && (
        <div className="p-4 rounded-2xl bg-brand-50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800/30">
          <p className="font-semibold text-sm">
            🎉 Płatność zakończona sukcesem! Masz teraz dostęp Premium.
          </p>
        </div>
      )}
      {paymentResult === "cancelled" && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
          <p className="font-semibold text-sm">
            Płatność została anulowana. Możesz spróbować ponownie.
          </p>
        </div>
      )}

      {/* ── Current status ────────────────────────────────────────────── */}
      {status && (
        <div className="glass-card p-6">
          <h2 className="font-display font-semibold text-sm mb-3">Twój plan</h2>
          <div className="flex items-center gap-4">
            <div
              className={`w-3 h-3 rounded-full ${isPremium ? "bg-brand-500" : "bg-zinc-400"}`}
            />
            <div className="flex-1">
              <p className="font-semibold text-sm">
                {isPremium ? "Premium" : "Darmowy"}
                {isCancelled && " (anulowana — dostęp do końca okresu)"}
              </p>
              {status.subscriptionEnd && isPremium && (
                <p className="text-xs text-zinc-500 mt-0.5">
                  {isCancelled ? "Dostęp wygaśnie" : "Następna płatność"}:{" "}
                  {new Date(status.subscriptionEnd).toLocaleDateString("pl")}
                </p>
              )}
              {!isPremium && (
                <p className="text-xs text-red-500 mt-0.5">
                  Brak aktywnej subskrypcji
                </p>
              )}
            </div>

            {/* Action buttons */}
            {(status.canCancel || status.subscriptionStatus === "ACTIVE") && (
              <button
                onClick={() => setModal("cancel")}
                className="btn-ghost text-xs text-red-500 hover:text-red-600"
              >
                Anuluj subskrypcję
              </button>
            )}
            {isCancelled && (
              <button
                onClick={() => setModal("resume")}
                className="btn-primary py-2 px-4 text-xs"
              >
                Wznów subskrypcję
              </button>
            )}
          </div>

          {/* Cancelled info banner */}
          {isCancelled && status.subscriptionEnd && (
            <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30">
              <div className="flex items-start gap-3">
                <span className="text-lg shrink-0">⏳</span>
                <div className="text-sm">
                  <p className="text-zinc-700 dark:text-zinc-300">
                    Subskrypcja wygaśnie{" "}
                    <strong>{formatDate(status.subscriptionEnd)}</strong>{" "}
                    <span className="text-zinc-500">
                      (za {daysUntil(status.subscriptionEnd)} dni)
                    </span>
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Możesz wznowić jednym kliknięciem — bez ponownego podawania
                    danych płatności.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── AI Credits ────────────────────────────────────────────────── */}
      {isPremium && credits && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-sm">Kredyty AI</h2>
            <span className="text-xs text-zinc-400">Odnowienie co miesiąc</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="font-display font-extrabold text-3xl">
                  {credits.remaining}
                </span>
                <span className="text-zinc-400 text-sm">/ {credits.total}</span>
              </div>
              <div className="w-full h-2.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${credits.remaining / credits.total > 0.2 ? "bg-brand-500" : "bg-red-500"}`}
                  style={{
                    width: `${Math.max(1, (credits.remaining / credits.total) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-zinc-400 mt-1.5">
                1 kredyt ≈ $0.01 · Słuchanie ~2 kr. · Ocena AI ~1 kr.
              </p>
            </div>
            <div className="text-4xl">
              {credits.remaining > 100
                ? "🟢"
                : credits.remaining > 0
                  ? "🟡"
                  : "🔴"}
            </div>
          </div>
        </div>
      )}

      {/* ── Buy more credits ──────────────────────────────────────────── */}
      {isPremium && (
        <div className="glass-card p-6">
          <h2 className="font-display font-semibold text-sm mb-4">
            Dokup kredyty AI
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                pkg: "credits_200" as const,
                credits: 200,
                price: "19 zł",
                per: "0.095 zł/kr.",
              },
              {
                pkg: "credits_500" as const,
                credits: 500,
                price: "39 zł",
                per: "0.078 zł/kr.",
                best: true,
              },
              {
                pkg: "credits_1200" as const,
                credits: 1200,
                price: "79 zł",
                per: "0.066 zł/kr.",
              },
            ].map((p) => (
              <button
                key={p.pkg}
                onClick={async () => {
                  setLoading(p.pkg);
                  try {
                    const { url } = await stripeApi.buyCredits(p.pkg);
                    if (url) window.location.href = url;
                  } catch {
                    setToast({ message: "Błąd płatności", type: "error" });
                  } finally {
                    setLoading(null);
                  }
                }}
                disabled={loading !== null}
                className={`relative p-4 rounded-2xl border-2 text-center transition-all hover:shadow-md ${p.best ? "border-brand-500 bg-brand-50 dark:bg-brand-900/10" : "border-zinc-200 dark:border-zinc-700"}`}
              >
                {p.best && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                    NAJLEPSZY
                  </span>
                )}
                <div className="font-display font-extrabold text-2xl">
                  {p.credits}
                </div>
                <div className="text-xs text-zinc-500 mb-2">kredytów</div>
                <div className="font-display font-bold text-lg">{p.price}</div>
                <div className="text-[10px] text-zinc-400">{p.per}</div>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-zinc-400 text-center mt-3">
            Kredyty nie wygasają i dodają się do obecnej puli.
          </p>
        </div>
      )}

      {/* ── No subscription warning ───────────────────────────────────── */}
      {!isPremium && status && (
        <div className="p-5 rounded-2xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔒</span>
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                Brak aktywnej subskrypcji
              </p>
              <p className="text-xs text-red-600/70 dark:text-red-400/70">
                Wykup subskrypcję Premium, aby uzyskać dostęp do wszystkich
                pytań i funkcji platformy.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Pricing cards ─────────────────────────────────────────────── */}
      {(!isPremium ||
        status?.subscriptionStatus === "EXPIRED" ||
        status?.subscriptionStatus === "FREE") && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Monthly subscription */}
          <div className="glass-card p-8 ring-2 ring-brand-500 relative">
            <div className="absolute -top-3 left-4 bg-brand-500 text-white text-xs font-bold px-3 py-1 rounded-full">
              POLECANY
            </div>
            <h2 className="font-display font-bold text-lg mb-1">Premium</h2>
            <p className="text-sm text-zinc-500 mb-4">Subskrypcja miesięczna</p>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="font-display font-extrabold text-4xl">49</span>
              <span className="text-zinc-500">zł/mies.</span>
            </div>
            <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400 mb-6">
              <li>✓ Dostęp do wszystkich przedmiotów</li>
              <li>✓ Nieograniczone pytania</li>
              <li>✓ Wybór tematów i lektur</li>
              <li>✓ AI ocena wypracowań</li>
              <li>✓ Powtórki Spaced Repetition</li>
              <li>✓ Pełne statystyki</li>
              <li>✓ Anuluj, kiedy chcesz</li>
            </ul>
            <button
              onClick={() => handleCheckout("subscription")}
              disabled={loading !== null}
              className="btn-primary w-full"
            >
              {loading === "subscription"
                ? "Przekierowuję..."
                : "Subskrybuj — 49 zł/mies."}
            </button>
            <p className="text-xs text-center text-zinc-400 mt-2">
              Płatność kartą lub Revolut
            </p>
          </div>

          {/* One-time */}
          <div className="glass-card p-8">
            <h2 className="font-display font-bold text-lg mb-1">Jednorazowy</h2>
            <p className="text-sm text-zinc-500 mb-4">30 dni dostępu</p>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="font-display font-extrabold text-4xl">59</span>
              <span className="text-zinc-500">zł</span>
            </div>
            <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400 mb-6">
              <li>✓ Wszystko z Premium</li>
              <li>✓ Bez subskrypcji</li>
              <li>✓ Karta / Revolut</li>
            </ul>
            <button
              onClick={() => handleCheckout("one_time")}
              disabled={loading !== null}
              className="btn-outline w-full"
            >
              {loading === "one_time"
                ? "Przekierowuję..."
                : "Kup dostęp — 59 zł"}
            </button>
          </div>
        </div>
      )}

      {/* ── Manage existing subscription ──────────────────────────────── */}
      {isPremium && (
        <div className="text-center pt-4">
          <button
            onClick={handlePortal}
            disabled={loading !== null}
            className="btn-ghost text-sm"
          >
            {loading === "portal"
              ? "Przekierowuję..."
              : "Zarządzaj metodą płatności (Stripe Portal)"}
          </button>
        </div>
      )}
    </div>
  );
}
