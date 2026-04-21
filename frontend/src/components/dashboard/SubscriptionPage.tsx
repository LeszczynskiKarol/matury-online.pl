import { useState, useEffect } from "react";
import { stripe as stripeApi } from "../../lib/api";

interface SubscriptionStatus {
  isPremium: boolean;
  subscriptionStatus: string;
  subscriptionEnd: string | null;
  willExpire: string | null;
  canResume: boolean;
}

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
      // Refresh credits after purchase
      setTimeout(
        () =>
          stripeApi
            .credits()
            .then(setCredits)
            .catch(() => {}),
        2000,
      );
    }

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
                <p className="text-xs text-red-500 mt-0.5">
                  Brak aktywnej subskrypcji
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

      {/* AI Credits */}
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

      {/* Buy more credits */}
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
                    alert("Błąd płatności");
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

      {/* No subscription warning */}
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
