// ============================================================================
// Essay Grading Guidelines — subject × level specific CKE criteria
// backend/src/services/essay-guidelines.ts
//
// These are injected into Claude's system prompt before grading.
// Each subject can have "podstawowy" and "rozszerzony" guidelines.
// ============================================================================

export type EssayLevel = "podstawowy" | "rozszerzony";

interface EssayGuidelines {
  systemContext: string; // Injected into system prompt
  criteria: { name: string; maxScore: number; description: string }[];
}

// ── POLSKI ──────────────────────────────────────────────────────────────────

const POLSKI_PODSTAWOWY: EssayGuidelines = {
  systemContext: `WYTYCZNE OCENY WYPRACOWANIA — JĘZYK POLSKI, POZIOM PODSTAWOWY (CKE)

Uczeń pisze rozprawkę (lub interpretację tekstu poetyckiego) o objętości min. 250 słów.

KRYTERIA OCENY (łącznie 36 pkt za całą część pisemną, wypracowanie max 35 pkt):

A. REALIZACJA TEMATU (0-2 pkt)
   - 2 pkt: praca jest w pełni zgodna z tematem, uczeń rozumie problem i podejmuje go w całości
   - 1 pkt: praca częściowo zgodna z tematem
   - 0 pkt: praca niezgodna z tematem LUB poniżej 250 słów → 0 za całe wypracowanie

B. TEZA I ARGUMENTACJA (0-12 pkt)
   - Sformułowanie tezy/hipotezy interpretacyjnej adekwatnej do tematu
   - Rozprawka: min. 2 trafne argumenty z odwołaniem do lektury obowiązkowej + innego tekstu kultury
   - Interpretacja: spójna koncepcja interpretacyjna, analiza kluczowych elementów utworu
   - Argumenty muszą być rozwinięte, poparte przykładami z tekstu (cytaty, parafrazy)
   - Za każdy argument: trafność, rozwinięcie, powiązanie z tezą

C. KOMPOZYCJA (0-8 pkt)
   - Trójdzielna struktura: wstęp (teza), rozwinięcie (argumenty), zakończenie (podsumowanie)
   - Spójność logiczna — kolejność argumentów, przejścia między akapitami
   - Proporcjonalność części, brak dygresji
   - Akapity wydzielone poprawnie

D. STYL (0-4 pkt)
   - Stosowność stylu (styl naukowy/publicystyczny, NIE potoczny)
   - Bogactwo słownictwa, precyzja wyrażeń
   - Unikanie powtórzeń, kolokwializmów, wulgaryzmów
   - Odpowiednia terminologia literacka/kulturowa

E. JĘZYK (0-8 pkt)
   - Poprawność gramatyczna (fleksja, składnia)
   - Poprawność leksykalna (właściwe użycie słów)
   - Poprawność frazeologiczna
   - Poprawność ortograficzna
   - Poprawność interpunkcyjna
   - Więcej niż 7 błędów językowych = max 2 pkt w tej kategorii

F. ZAPIS (0-1 pkt)
   - Czytelność, akapity, brak skreśleń (w kontekście cyfrowym: formatowanie tekstu)

WAŻNE ZASADY:
- Jeśli praca ma mniej niż 250 słów → 0 pkt za całość
- Jeśli temat nie jest zrealizowany (0 pkt w kryterium A) → 0 pkt za B, C, D
- Lektura obowiązkowa MUSI być przywołana (rozprawka)
- Odwołania do min. 2 tekstów kultury (w tym 1 lektura obowiązkowa)
- Oceniaj sprawiedliwie — to poziom maturalny, nie akademicki`,

  criteria: [
    {
      name: "Realizacja tematu",
      maxScore: 2,
      description: "Zgodność z tematem, zrozumienie problemu",
    },
    {
      name: "Teza i argumentacja",
      maxScore: 12,
      description: "Teza + min. 2 argumenty z odwołaniami do tekstów",
    },
    {
      name: "Kompozycja",
      maxScore: 8,
      description: "Trójdzielność, spójność, proporcje, akapity",
    },
    {
      name: "Styl",
      maxScore: 4,
      description: "Stosowność, bogactwo słownictwa, terminologia",
    },
    {
      name: "Język",
      maxScore: 8,
      description: "Gramatyka, ortografia, interpunkcja, leksyka",
    },
    { name: "Zapis", maxScore: 1, description: "Czytelność i formatowanie" },
  ],
};

const POLSKI_ROZSZERZONY: EssayGuidelines = {
  systemContext: `WYTYCZNE OCENY WYPRACOWANIA — JĘZYK POLSKI, POZIOM ROZSZERZONY (CKE)

Uczeń pisze wypracowanie o objętości min. 300 słów. Temat dotyczy problematyki literackiej lub językowej.
Na poziomie rozszerzonym oczekuje się WYŻSZEGO poziomu analizy, samodzielności myślenia i erudycji.

KRYTERIA OCENY (max 40 pkt za wypracowanie):

A. REALIZACJA TEMATU (0-2 pkt)
   - Pełna zgodność z tematem, głębokie zrozumienie problemu
   - 0 pkt → 0 za B, C, D

B. TEZA I ARGUMENTACJA (0-18 pkt)
   - Samodzielna, pogłębiona teza
   - Min. 3 argumenty z odwołaniami do różnych tekstów kultury
   - Oczekiwane konteksty: filozoficzny, historycznoliteracki, biograficzny, kulturowy
   - Analiza porównawcza tekstów, a nie tylko streszczenie
   - Samodzielność interpretacji — unikanie schematycznych odczytań
   - Odwołania do teorii literatury, poetyki, retoryki

C. KOMPOZYCJA (0-8 pkt)
   - Przemyślana, funkcjonalna struktura (nie tylko mechaniczna trójdzielność)
   - Logiczny tok wywodu, spójna argumentacja
   - Sprawne przejścia, brak powtórzeń myślowych

D. STYL (0-6 pkt)
   - Styl naukowy lub eseistyczny na wysokim poziomie
   - Precyzja terminologiczna (terminy literaturoznawcze, językoznawcze)
   - Indywidualność stylu, dojrzałość wyrazu
   - Bogactwo leksykalne

E. JĘZYK (0-6 pkt)
   - Wysoka poprawność językowa
   - Poprawność ortograficzna i interpunkcyjna
   - Złożone struktury składniowe użyte poprawnie

WAŻNE:
- Min. 300 słów, poniżej → 0 pkt
- Poziom rozszerzony wymaga erudycji i samodzielnego myślenia
- Schematyczne prace (szablon: teza + 2 argumenty + zakończenie) oceniaj niżej
- Doceniaj oryginalne interpretacje i nieoczywiste konteksty`,

  criteria: [
    {
      name: "Realizacja tematu",
      maxScore: 2,
      description: "Głębokie zrozumienie problemu",
    },
    {
      name: "Teza i argumentacja",
      maxScore: 18,
      description:
        "Pogłębiona teza, min. 3 argumenty, konteksty, analiza porównawcza",
    },
    {
      name: "Kompozycja",
      maxScore: 8,
      description: "Funkcjonalna struktura, logiczny wywód",
    },
    {
      name: "Styl",
      maxScore: 6,
      description: "Styl naukowy/eseistyczny, terminologia, indywidualność",
    },
    {
      name: "Język",
      maxScore: 6,
      description: "Wysoka poprawność, złożone struktury składniowe",
    },
  ],
};

// ── ANGIELSKI ───────────────────────────────────────────────────────────────

const ANGIELSKI_PODSTAWOWY: EssayGuidelines = {
  systemContext: `WYTYCZNE OCENY WYPOWIEDZI PISEMNEJ — JĘZYK ANGIELSKI, POZIOM PODSTAWOWY (CKE)

Uczeń pisze wypowiedź pisemną (e-mail, list, wpis na blogu, rozprawkę) o objętości 80-130 słów.

KRYTERIA OCENY (max 13 pkt):

A. TREŚĆ (0-4 pkt)
   - Realizacja 4 podpunktów z polecenia (po 1 pkt za każdy)
   - Podpunkt zrealizowany = rozwinięty, nie tylko zasygnalizowany
   - Brak realizacji podpunktu = 0 pkt za ten element

B. SPÓJNOŚĆ I LOGIKA (0-2 pkt)
   - 2 pkt: tekst spójny, logicznie uporządkowany, poprawne łączniki (linking words)
   - 1 pkt: tekst częściowo spójny, sporadyczne problemy z logiką
   - 0 pkt: tekst niespójny, brak logicznego porządku

C. ZAKRES ŚRODKÓW JĘZYKOWYCH (0-3 pkt)
   - 3 pkt: szeroki zakres słownictwa i struktur, adekwatny do tematu
   - 2 pkt: zadowalający zakres, sporadyczne braki
   - 1 pkt: ograniczony zakres, powtórzenia
   - 0 pkt: bardzo ubogi zasób

D. POPRAWNOŚĆ ŚRODKÓW JĘZYKOWYCH (0-3 pkt)
   - 3 pkt: sporadyczne błędy niezakłócające komunikacji
   - 2 pkt: błędy częściowo zakłócające komunikację
   - 1 pkt: liczne błędy zakłócające komunikację
   - 0 pkt: błędy uniemożliwiające zrozumienie

E. FORMA (0-1 pkt)
   - Zgodność z wymaganą formą (list → nagłówek, zwroty grzecznościowe; blog → tytuł)

WAŻNE:
- Poniżej 80 słów: nie odejmuj punktów za samą długość, ale krótki tekst = mniej treści
- Powyżej 130 słów: oceniaj tylko pierwsze 130 słów
- Oceniaj komunikatywność — czy native speaker zrozumiałby przekaz?`,

  criteria: [
    {
      name: "Treść (Content)",
      maxScore: 4,
      description: "Realizacja 4 podpunktów polecenia",
    },
    {
      name: "Spójność i logika (Coherence)",
      maxScore: 2,
      description: "Logiczny porządek, linking words",
    },
    {
      name: "Zakres językowy (Range)",
      maxScore: 3,
      description: "Bogactwo słownictwa i struktur",
    },
    {
      name: "Poprawność (Accuracy)",
      maxScore: 3,
      description: "Poprawność gramatyczna i leksykalna",
    },
    {
      name: "Forma (Format)",
      maxScore: 1,
      description: "Zgodność z wymaganą formą wypowiedzi",
    },
  ],
};

const ANGIELSKI_ROZSZERZONY: EssayGuidelines = {
  systemContext: `WYTYCZNE OCENY WYPOWIEDZI PISEMNEJ — JĘZYK ANGIELSKI, POZIOM ROZSZERZONY (CKE)

Uczeń pisze rozprawkę, artykuł, recenzję lub list formalny o objętości 200-250 słów.

KRYTERIA OCENY (max 13 pkt):

A. TREŚĆ (0-4 pkt)
   - Realizacja podpunktów polecenia, pogłębione rozwinięcie tematu
   - Argumenty poparte przykładami
   - Wymagana wyraźna teza i konkluzja (rozprawka)

B. SPÓJNOŚĆ I LOGIKA (0-3 pkt)
   - 3 pkt: przejrzysty, logiczny tok wypowiedzi, zaawansowane łączniki
   - Wyraźne akapity, sprawne przejścia

C. ZAKRES ŚRODKÓW JĘZYKOWYCH (0-3 pkt)
   - 3 pkt: bogaty zakres, zaawansowane struktury (inversions, cleft sentences, conditionals)
   - Precyzyjne słownictwo tematyczne, idiomy, collocations

D. POPRAWNOŚĆ ŚRODKÓW JĘZYKOWYCH (0-3 pkt)
   - Oczekiwana wysoka poprawność przy złożonych strukturach
   - Drobne błędy w zaawansowanych konstrukcjach = nadal wysoka ocena

WAŻNE:
- 200-250 słów — powyżej oceniaj tylko pierwsze 250
- Poziom rozszerzony = oczekiwane zaawansowane struktury (B2+/C1)
- Rozprawka for-and-against lub opinion essay — wymagana wyraźna struktura
- Doceniaj naturalność języka i idiomatyczność`,

  criteria: [
    {
      name: "Treść (Content)",
      maxScore: 4,
      description: "Pogłębiona realizacja tematu z argumentami",
    },
    {
      name: "Spójność i logika (Coherence)",
      maxScore: 3,
      description: "Logiczny tok, zaawansowane łączniki",
    },
    {
      name: "Zakres językowy (Range)",
      maxScore: 3,
      description: "Zaawansowane struktury B2+/C1",
    },
    {
      name: "Poprawność (Accuracy)",
      maxScore: 3,
      description: "Wysoka poprawność przy złożonych strukturach",
    },
  ],
};

// ── HISTORIA ────────────────────────────────────────────────────────────────

const HISTORIA_ROZSZERZONY: EssayGuidelines = {
  systemContext: `WYTYCZNE OCENY WYPRACOWANIA — HISTORIA, POZIOM ROZSZERZONY (CKE)

Uczeń pisze wypracowanie na temat historyczny (wypowiedź argumentacyjna) o objętości min. 300 słów.

KRYTERIA OCENY (max 12 pkt):

A. REALIZACJA TEMATU I TEZA (0-1 pkt)
   - Sformułowanie stanowiska (tezy) wobec postawionego problemu
   - 0 pkt = brak tezy → max 2 pkt za argumentację

B. ARGUMENTACJA (0-6 pkt)
   - Po 2 pkt za każdy trafny argument (max 3 argumenty)
   - Argument = fakt historyczny + wyjaśnienie jego związku z tezą
   - Argumenty muszą być konkretne (daty, postacie, wydarzenia, procesy)
   - Nie wystarczy ogólnik — trzeba podać konkrety

C. UPORZĄDKOWANIE (0-2 pkt)
   - Logiczna kolejność argumentów
   - Poprawna chronologia
   - Spójność wywodu

D. JĘZYK I STYL (0-3 pkt)
   - Poprawna terminologia historyczna
   - Styl naukowy/publicystyczny
   - Poprawność językowa

WAŻNE:
- Wymagane KONKRETY: daty, nazwiska, nazwy traktatów/bitew/reform
- Błędy merytoryczne (złe daty, błędne przypisanie wydarzeń) = utrata punktów
- Anachronizmy = poważny błąd
- Oceniaj obiektywność — brak ocen wartościujących bez uzasadnienia źródłowego`,

  criteria: [
    {
      name: "Realizacja tematu i teza",
      maxScore: 1,
      description: "Sformułowanie stanowiska wobec problemu",
    },
    {
      name: "Argumentacja",
      maxScore: 6,
      description: "Max 3 argumenty po 2 pkt, konkrety historyczne",
    },
    {
      name: "Uporządkowanie",
      maxScore: 2,
      description: "Logika, chronologia, spójność",
    },
    {
      name: "Język i styl",
      maxScore: 3,
      description: "Terminologia historyczna, poprawność",
    },
  ],
};

// ── WOS ─────────────────────────────────────────────────────────────────────

const WOS_ROZSZERZONY: EssayGuidelines = {
  systemContext: `WYTYCZNE OCENY WYPRACOWANIA — WOS, POZIOM ROZSZERZONY (CKE)

Uczeń pisze wypracowanie na temat z wiedzy o społeczeństwie o objętości min. 300 słów.

KRYTERIA OCENY (max 12 pkt):

A. REALIZACJA TEMATU (0-1 pkt)
   - Podjęcie problemu, sformułowanie tezy/stanowiska
   - 0 pkt → max 2 pkt za argumentację

B. ARGUMENTACJA (0-6 pkt)
   - 3 trafne argumenty po 2 pkt
   - Argumenty muszą odnosić się do: faktów politycznych/społecznych, przepisów prawa,
     koncepcji filozoficznych/politologicznych, danych statystycznych, przykładów z życia publicznego
   - Wymagane odniesienia do konkretnych aktów prawnych (Konstytucja RP, ustawy),
     instytucji, wydarzeń politycznych/społecznych

C. UPORZĄDKOWANIE (0-2 pkt)
   - Logiczna struktura wywodu
   - Spójność argumentacji

D. JĘZYK I TERMINOLOGIA (0-3 pkt)
   - Poprawna terminologia: prawna, politologiczna, socjologiczna
   - Styl adekwatny do formy (nie potoczny)
   - Poprawność językowa

WAŻNE:
- WOS wymaga KONKRETNYCH odniesień do prawa i instytucji
- Ogólniki bez podania artykułów/przepisów = niższa ocena
- Wymagana znajomość systemu politycznego RP i instytucji UE/międzynarodowych
- Argumenty „z życia" akceptowalne jeśli poparte wiedzą merytoryczną`,

  criteria: [
    {
      name: "Realizacja tematu",
      maxScore: 1,
      description: "Sformułowanie tezy/stanowiska",
    },
    {
      name: "Argumentacja",
      maxScore: 6,
      description: "3 argumenty z odniesieniami do prawa, instytucji, faktów",
    },
    {
      name: "Uporządkowanie",
      maxScore: 2,
      description: "Logiczna struktura, spójność",
    },
    {
      name: "Język i terminologia",
      maxScore: 3,
      description: "Terminologia prawna/politologiczna",
    },
  ],
};

// ── BIOLOGIA ────────────────────────────────────────────────────────────────

const BIOLOGIA_ROZSZERZONY: EssayGuidelines = {
  systemContext: `WYTYCZNE OCENY WYPOWIEDZI PISEMNEJ — BIOLOGIA, POZIOM ROZSZERZONY (CKE)

Na maturze rozszerzonej z biologii mogą pojawić się zadania wymagające dłuższej wypowiedzi pisemnej
(opis mechanizmu, wyjaśnienie zjawiska, projekt doświadczenia, interpretacja wyników).

KRYTERIA OCENY (max 8 pkt, w zależności od polecenia):

A. POPRAWNOŚĆ MERYTORYCZNA (0-4 pkt)
   - Prawidłowe użycie terminologii biologicznej
   - Poprawność opisywanych mechanizmów/procesów
   - Znajomość związków przyczynowo-skutkowych
   - Brak błędów merytorycznych

B. KOMPLETNOŚĆ ODPOWIEDZI (0-2 pkt)
   - Uwzględnienie wszystkich elementów polecenia
   - Wystarczający poziom szczegółowości

C. LOGIKA I SPÓJNOŚĆ (0-2 pkt)
   - Logiczny tok rozumowania
   - Poprawna sekwencja etapów (np. w opisie doświadczenia)
   - Wyraźne wnioski

WAŻNE:
- Wymagana precyzyjna terminologia biologiczna (nie opisowa/potoczna)
- Procesy biochemiczne: nazwy enzymów, substratów, produktów
- Genetyka: poprawna symbolika, krzyżówki genetyczne
- Ekologia: prawidłowe nazwy zależności, terminologia ekosystemowa`,

  criteria: [
    {
      name: "Poprawność merytoryczna",
      maxScore: 4,
      description: "Terminologia, mechanizmy, związki przyczynowo-skutkowe",
    },
    {
      name: "Kompletność odpowiedzi",
      maxScore: 2,
      description: "Wszystkie elementy polecenia, szczegółowość",
    },
    {
      name: "Logika i spójność",
      maxScore: 2,
      description: "Tok rozumowania, sekwencja, wnioski",
    },
  ],
};

// ── GEOGRAFIA ───────────────────────────────────────────────────────────────

const GEOGRAFIA_ROZSZERZONY: EssayGuidelines = {
  systemContext: `WYTYCZNE OCENY WYPOWIEDZI PISEMNEJ — GEOGRAFIA, POZIOM ROZSZERZONY (CKE)

Na maturze rozszerzonej z geografii zadania otwarte wymagają dłuższych opisów,
wyjaśnień procesów, analizy danych i formułowania wniosków.

KRYTERIA OCENY (max 6 pkt):

A. POPRAWNOŚĆ MERYTORYCZNA (0-3 pkt)
   - Prawidłowe użycie terminologii geograficznej
   - Poprawne opisywanie procesów (geologicznych, klimatycznych, społeczno-ekonomicznych)
   - Znajomość zależności przestrzennych

B. WYKORZYSTANIE DANYCH (0-1 pkt)
   - Odwołanie do danych z materiału źródłowego (mapa, wykres, tabela)
   - Konkretne wartości liczbowe w argumentacji

C. LOGIKA WYWODU (0-2 pkt)
   - Logiczne powiązanie przyczyn i skutków
   - Poprawne wnioskowanie
   - Jasna struktura odpowiedzi`,

  criteria: [
    {
      name: "Poprawność merytoryczna",
      maxScore: 3,
      description: "Terminologia, procesy, zależności przestrzenne",
    },
    {
      name: "Wykorzystanie danych",
      maxScore: 1,
      description: "Odwołania do materiałów źródłowych",
    },
    {
      name: "Logika wywodu",
      maxScore: 2,
      description: "Przyczyny-skutki, wnioskowanie",
    },
  ],
};

// ── FALLBACK ────────────────────────────────────────────────────────────────

const DEFAULT_GUIDELINES: EssayGuidelines = {
  systemContext: `Oceniasz wypracowanie maturalne. Bądź szczegółowy, sprawiedliwy i merytoryczny.
Wskaż mocne strony i elementy do poprawy. Odpowiadaj po polsku.`,
  criteria: [
    {
      name: "Merytoryka",
      maxScore: 10,
      description: "Poprawność merytoryczna",
    },
    {
      name: "Argumentacja",
      maxScore: 5,
      description: "Jakość argumentów i przykładów",
    },
    {
      name: "Język i styl",
      maxScore: 3,
      description: "Poprawność językowa i stylistyczna",
    },
    {
      name: "Kompletność",
      maxScore: 2,
      description: "Wyczerpujące omówienie tematu",
    },
  ],
};

// ── GUIDELINES MAP ──────────────────────────────────────────────────────────

const GUIDELINES_MAP: Record<
  string,
  Partial<Record<EssayLevel, EssayGuidelines>>
> = {
  polski: {
    podstawowy: POLSKI_PODSTAWOWY,
    rozszerzony: POLSKI_ROZSZERZONY,
  },
  angielski: {
    podstawowy: ANGIELSKI_PODSTAWOWY,
    rozszerzony: ANGIELSKI_ROZSZERZONY,
  },
  historia: {
    rozszerzony: HISTORIA_ROZSZERZONY,
  },
  wos: {
    rozszerzony: WOS_ROZSZERZONY,
  },
  biologia: {
    rozszerzony: BIOLOGIA_ROZSZERZONY,
  },
  geografia: {
    rozszerzony: GEOGRAFIA_ROZSZERZONY,
  },
};

// ── PUBLIC API ───────────────────────────────────────────────────────────────

export function getEssayGuidelines(
  subjectSlug: string,
  level: EssayLevel = "podstawowy",
): EssayGuidelines {
  const subjectMap = GUIDELINES_MAP[subjectSlug];
  if (!subjectMap) return DEFAULT_GUIDELINES;

  // Try exact level, then fallback to any available, then default
  return (
    subjectMap[level] ??
    subjectMap.podstawowy ??
    subjectMap.rozszerzony ??
    DEFAULT_GUIDELINES
  );
}

export function getAvailableLevels(subjectSlug: string): EssayLevel[] {
  const subjectMap = GUIDELINES_MAP[subjectSlug];
  if (!subjectMap) return ["podstawowy"];
  return Object.keys(subjectMap) as EssayLevel[];
}

// ── TOPIC SUGGESTION PROMPTS ────────────────────────────────────────────────

const TOPIC_SUGGESTION_PROMPTS: Record<string, Record<string, string>> = {
  polski: {
    podstawowy: `Zaproponuj temat rozprawki maturalnej z języka polskiego na poziomie PODSTAWOWYM.
Temat musi:
- Stawiać problem do rozważenia (pytanie lub tezę do udowodnienia/obalenia)
- Wymagać odwołania do lektury obowiązkowej + innego tekstu kultury
- Być sformułowany w stylu CKE (np. "Czy szczęście zależy od nas samych? Rozważ problem...")
- Dotyczyć uniwersalnych problemów: człowiek-świat, wartości, relacje, tożsamość, wolność, moralność

Podaj TYLKO temat (1-3 zdania), bez dodatkowych komentarzy.`,

    rozszerzony: `Zaproponuj temat wypracowania maturalnego z języka polskiego na poziomie ROZSZERZONYM.
Temat musi:
- Dotyczyć problematyki literackiej LUB językowej
- Wymagać pogłębionej analizy, znajomości kontekstów (filozoficzny, historycznoliteracki)
- Być sformułowany w stylu CKE egzaminu rozszerzonego
- Wymagać odwołania do min. 3 tekstów kultury

Podaj TYLKO temat (1-3 zdania), bez dodatkowych komentarzy.`,
  },
  angielski: {
    podstawowy: `Zaproponuj temat wypowiedzi pisemnej z języka angielskiego na poziomie PODSTAWOWYM.
Forma: e-mail/list/wpis na blogu (80-130 słów).
Podaj polecenie z 4 podpunktami do zrealizowania (w stylu CKE).
Polecenie po polsku, treść do napisania po angielsku.
Podaj TYLKO polecenie, bez dodatkowych komentarzy.`,

    rozszerzony: `Zaproponuj temat wypowiedzi pisemnej z języka angielskiego na poziomie ROZSZERZONYM.
Forma: rozprawka (for-and-against / opinion essay), artykuł, recenzja lub list formalny (200-250 słów).
Polecenie po polsku, treść do napisania po angielsku.
Podaj TYLKO polecenie, bez dodatkowych komentarzy.`,
  },
  historia: {
    rozszerzony: `Zaproponuj temat wypracowania maturalnego z historii na poziomie ROZSZERZONYM.
Temat musi:
- Stawiać problem historyczny do rozważenia (tezę do argumentacji)
- Dotyczyć konkretnej epoki/okresu (starożytność–XXI w.)
- Wymagać znajomości faktów, dat, postaci
- Być sformułowany w stylu CKE

Podaj TYLKO temat (1-2 zdania), bez dodatkowych komentarzy.`,
  },
  wos: {
    rozszerzony: `Zaproponuj temat wypracowania maturalnego z WOS na poziomie ROZSZERZONYM.
Temat musi:
- Dotyczyć zagadnień politycznych, społecznych, prawnych lub filozoficznych
- Wymagać argumentacji z odwołaniem do prawa, instytucji, faktów
- Być sformułowany w stylu CKE

Podaj TYLKO temat (1-2 zdania), bez dodatkowych komentarzy.`,
  },
  _default: {
    podstawowy: `Zaproponuj temat wypracowania maturalnego na poziomie podstawowym. 
Temat powinien stawiać problem do rozważenia. Podaj TYLKO temat, bez komentarzy.`,
    rozszerzony: `Zaproponuj temat wypracowania maturalnego na poziomie rozszerzonym.
Temat powinien wymagać pogłębionej argumentacji. Podaj TYLKO temat, bez komentarzy.`,
  },
};

export function getTopicSuggestionPrompt(
  subjectSlug: string,
  level: EssayLevel = "podstawowy",
  topicName?: string,
): string {
  const subjectPrompts =
    TOPIC_SUGGESTION_PROMPTS[subjectSlug] ?? TOPIC_SUGGESTION_PROMPTS._default;
  const base =
    subjectPrompts[level] ??
    subjectPrompts.rozszerzony ??
    subjectPrompts.podstawowy!;

  if (topicName) {
    return `${base}\n\nTemat powinien nawiązywać do działu/zagadnienia: "${topicName}".`;
  }
  return base;
}
