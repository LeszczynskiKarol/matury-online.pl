import { useState, useEffect } from "react";
import { stripe as stripeApi } from "../../lib/api";

interface SubscriptionStatus {
  isPremium: boolean;
  subscriptionStatus: string;
  subscriptionEnd: string | null;
  willExpire: string | null;
  canResume: boolean;
  dailyUsed: number;
  dailyLimit: number;
}

export function SubscriptionPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [fetching, setFetching] = useState(true);
  const [paymentResult, setPaymentResult] = useState<
    "success" | "cancelled" | null
  >(null);

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

    // Po powrocie ze Stripe — polluj co 2s przez 10s żeby złapać webhook
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
      alert("Błąd podczas tworzenia sesji płatności.");
    } finally {
      setLoading(null);
    }
  };

  const handleCancel = async () => {
    if (
      !confirm(
        "Czy na pewno chcesz anulować subskrypcję? Zachowasz dostęp do końca opłaconego okresu.",
      )
    )
      return;
    setLoading("cancel");
    try {
      const res = await stripeApi.cancel();
      alert(res.message);
      // Refresh status
      const s = await stripeApi.status();
      setStatus(s);
    } catch {
      alert("Błąd podczas anulowania.");
    } finally {
      setLoading(null);
    }
  };

  const handleResume = async () => {
    setLoading("resume");
    try {
      const res = await stripeApi.resume();
      alert(res.message);
      const s = await stripeApi.status();
      setStatus(s);
    } catch {
      alert("Błąd podczas wznawiania subskrypcji.");
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
      alert("Brak aktywnej subskrypcji.");
    } finally {
      setLoading(null);
    }
  };

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

      {/* Payment result banners */}
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

      {/* Current status */}
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
                <p className="text-xs text-zinc-500 mt-0.5">
                  Dzisiejsze pytania: {status.dailyUsed} / {status.dailyLimit}
                </p>
              )}
            </div>

            {/* Action buttons for active subscribers */}
            {status.subscriptionStatus === "ACTIVE" && (
              <button
                onClick={handleCancel}
                disabled={loading !== null}
                className="btn-ghost text-xs text-red-500 hover:text-red-600"
              >
                {loading === "cancel" ? "Anulowanie..." : "Anuluj subskrypcję"}
              </button>
            )}
            {isCancelled && (
              <button
                onClick={handleResume}
                disabled={loading !== null}
                className="btn-primary py-2 px-4 text-xs"
              >
                {loading === "resume" ? "Wznawianie..." : "Wznów subskrypcję"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Free user daily limit info */}
      {!isPremium && status && (
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-surface-800 border border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📝</span>
            <div className="flex-1">
              <p className="text-sm font-semibold">
                Darmowy plan: {status.dailyLimit} pytań dziennie
              </p>
              <p className="text-xs text-zinc-500">
                Przejdź na Premium, żeby mieć nieograniczony dostęp do
                wszystkich pytań i funkcji.
              </p>
            </div>
            <div className="text-right">
              <div className="text-lg font-display font-bold">
                {status.dailyUsed}/{status.dailyLimit}
              </div>
              <div className="mt-1 w-16 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (status.dailyUsed / status.dailyLimit) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pricing cards — show for non-premium or cancelled+expired */}
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
              <li>✓ Nieograniczone pytania</li>
              <li>✓ Wybór tematów i lektur</li>
              <li>✓ AI ocena wypracowań</li>
              <li>✓ Powtórki Spaced Repetition</li>
              <li>✓ Pełne statystyki</li>
              <li>✓ Do 4 przedmiotów</li>
              <li>✓ Anuluj kiedy chcesz</li>
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

      {/* Manage existing subscription */}
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
