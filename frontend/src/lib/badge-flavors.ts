// ============================================================================
// Badge Flavor Texts — Gen-Z commentary
// Used by both web BadgesPage and mobile BadgesScreen
// ============================================================================

export const BADGE_FLAVOR: Record<string, string> = {
  // ── STREAK ──
  streak_3:
    "3 dni? To jeszcze nie seria, to dopiero foreplay. Ale hej, lepiej niż 0.",
  streak_7:
    "Tydzień bez dotykania trawy. Twój telefon jest dumny, Twoje oczy — mniej.",
  streak_14:
    "2 tygodnie non-stop. To nie jest hobby, to jest styl życia. Sigma behavior.",
  streak_30:
    "Miesiąc. Codziennie. Bez wymówek. Poważnie, czy Ty w ogóle jesz normalne posiłki?",
  streak_100:
    "100 dni. To nie jest normalne ludzkie zachowanie i oboje to wiemy. Ale respekt.",

  // ── PERFECT ──
  perfect_1:
    "100% za pierwszym razem? Pewnie zgadywałeś i miałeś szczęście. Ale Ci dajemy.",
  perfect_5:
    "Ok, 5 razy ze 100%? To już nie jest szczęście. To jest skill. Albo cheat codes.",
  perfect_20:
    "20 perfekcyjnych sesji. Jesteś built different i nie da się tego zignorować.",
  perfect_50:
    "Albo masz aimbot, albo dosłownie znasz wszystkie odpowiedzi. Tak czy siak — GG.",

  // ── VOLUME ──
  q_100:
    "Tutorial ukończony. Teraz zaczyna się prawdziwa gra. Powodzenia, będziesz potrzebować.",
  q_500:
    "500 pytań. The grind is real i Ty to wiesz. Twoje palce prawdopodobnie bolą.",
  q_1000:
    "Tysiąc pytań. To więcej niż połowa ludzi przeczyta w życiu. Respekt totalny.",
  q_5000:
    "5000 pytań. Odpowiedziałeś na więcej pytań niż CKE zadało w ostatnich 3 latach.",
  q_10000:
    "Dziesięć tysięcy. Oficjalnie nie masz życia i obie strony to akceptują. Legenda.",
  essay_5:
    "5 wypracowań! Twój polonista gdzieś właśnie uronił łzę dumy. Albo rozpaczy.",
  essay_20:
    "20 wypracowań. Mógłbyś wydać swój własny tomik. Albo przynajmniej newsletter.",

  // ── MASTERY ──
  sub_lvl3:
    "Poziom 3 — ogarniasz temat lepiej niż 90% ludzi, którzy mówią że ogarniają.",
  sub_lvl5:
    "Max level w przedmiocie. CKE mogłoby Cię zatrudnić do pisania pytań.",
  multi_3:
    "3 przedmioty na raz? Multitasking king/queen. Twój mózg to centrum dowodzenia.",
  all_subjects:
    "Wszystkie przedmioty. Renesansowy człowiek. Da Vinci by się ucieszył.",

  // ── MILESTONE ──
  xp_1000:
    "Cztery cyfry XP! Kiedyś byłeś zerem, teraz jesteś tysiącem. Rozwój.",
  xp_5000:
    "5000 XP. Gdyby to były złotówki, mógłbyś kupić sobie ładną kolację.",
  xp_25000:
    "25K XP. Bogactwo wiedzy. Niestety bank tego nie akceptuje jako waluty.",

  // ── SPECIAL ──
  night_owl:
    "Uczysz się po północy? Twoje oczy Cię nienawidzą, ale Twój mózg Ci dziękuje. Może.",
  early_bird:
    "Przed 6 rano? Czy Ty w ogóle spałeś? Twój budzik jest zszokowany.",
  comeback:
    "7+ dni przerwy i wróciłeś! Jak feniks z popiołów. Albo jak student po sylwestrze.",
  speed_demon:
    "10 poprawnych w mniej niż 30s każda? Albo jesteś geniuszem, albo ekran jest za mały na opcje.",
  beta_tester:
    "OG. Byłeś tu od początku. Kiedy ta apka była jeszcze w fazie 'o boże co to jest'. Pionierze.",
};

// Fallback for badges without custom flavor
export function getFlavorText(slug: string): string {
  return (
    BADGE_FLAVOR[slug] || "Zdobądź tę odznakę, żeby odblokować opis. Warto."
  );
}
