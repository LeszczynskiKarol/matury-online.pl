// src/lib/consent.ts
// Google Consent Mode v2 — logika zarządzania zgodami
// Zgodne z RODO/GDPR, ePrivacy, DMA

export type ConsentCategory =
  | "necessary" // zawsze true, nie do wyłączenia
  | "analytics" // GA4
  | "marketing" // Google Ads, remarketing
  | "functional" // preferencje, motyw
  | "personalization";

export interface ConsentState {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
  personalization: boolean;
  timestamp: number; // kiedy użytkownik wyraził zgodę
  version: number; // zmień gdy zmieniasz politykę → wymusisz re-consent
}

// Zwiększ gdy zmieniasz politykę prywatności — wymusi ponowną zgodę
export const CONSENT_VERSION = 1;

// Re-consent po 365 dniach (rekomendacja EROD — DPA zgadzają się na 6–12 mies.)
export const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const STORAGE_KEY = "mo_consent_v2";

export function getStoredConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;

    // Walidacja: zła wersja lub wygaśnięcie → re-consent
    if (parsed.version !== CONSENT_VERSION) return null;
    if (Date.now() - parsed.timestamp > CONSENT_MAX_AGE_MS) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function saveConsent(
  state: Omit<ConsentState, "timestamp" | "version" | "necessary">,
) {
  const full: ConsentState = {
    necessary: true,
    ...state,
    timestamp: Date.now(),
    version: CONSENT_VERSION,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  applyConsentToGtag(full);
  // Event dla UI (banner może nasłuchiwać)
  window.dispatchEvent(new CustomEvent("consent:updated", { detail: full }));
}

export function clearConsent() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("consent:cleared"));
}

export function applyConsentToGtag(state: ConsentState) {
  if (typeof window === "undefined" || typeof window.gtag !== "function")
    return;

  window.gtag("consent", "update", {
    ad_storage: state.marketing ? "granted" : "denied",
    ad_user_data: state.marketing ? "granted" : "denied",
    ad_personalization: state.marketing ? "granted" : "denied",
    analytics_storage: state.analytics ? "granted" : "denied",
    functionality_storage: state.functional ? "granted" : "denied",
    personalization_storage: state.personalization ? "granted" : "denied",
    security_storage: "granted", // zawsze
  });
}

// Wygodne helpery dla banera
export const ACCEPT_ALL: Omit<
  ConsentState,
  "timestamp" | "version" | "necessary"
> = {
  analytics: true,
  marketing: true,
  functional: true,
  personalization: true,
};

export const REJECT_ALL: Omit<
  ConsentState,
  "timestamp" | "version" | "necessary"
> = {
  analytics: false,
  marketing: false,
  functional: false,
  personalization: false,
};

// Typy dla gtag — rozszerzenie window
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
    openConsentSettings?: () => void;
  }
}
