export interface CatRule {
  id: string;
  contains: string;
  category: string;
}

const STORAGE_KEY = "ft-cat-rules";

const BUILT_IN: Array<{ contains: string; category: string }> = [
  // Groceries
  { contains: "tesco", category: "Groceries" },
  { contains: "sainsbury", category: "Groceries" },
  { contains: "asda", category: "Groceries" },
  { contains: "morrisons", category: "Groceries" },
  { contains: "waitrose", category: "Groceries" },
  { contains: "marks & spencer food", category: "Groceries" },
  { contains: "aldi", category: "Groceries" },
  { contains: "lidl", category: "Groceries" },
  { contains: "co-op", category: "Groceries" },
  { contains: "iceland food", category: "Groceries" },
  { contains: "whole foods", category: "Groceries" },
  { contains: "ocado", category: "Groceries" },
  { contains: "jaya grocer", category: "Groceries" },
  { contains: "village grocer", category: "Groceries" },
  { contains: "cold storage", category: "Groceries" },
  // Eating Out
  { contains: "mcdonald", category: "Eating Out" },
  { contains: "kfc", category: "Eating Out" },
  { contains: "burger king", category: "Eating Out" },
  { contains: "nando", category: "Eating Out" },
  { contains: "pizza", category: "Eating Out" },
  { contains: "subway", category: "Eating Out" },
  { contains: "starbucks", category: "Eating Out" },
  { contains: "costa coffee", category: "Eating Out" },
  { contains: "pret a manger", category: "Eating Out" },
  { contains: "pret ", category: "Eating Out" },
  { contains: "greggs", category: "Eating Out" },
  { contains: "wagamama", category: "Eating Out" },
  { contains: "itsu", category: "Eating Out" },
  { contains: "deliveroo", category: "Eating Out" },
  { contains: "uber eats", category: "Eating Out" },
  { contains: "just eat", category: "Eating Out" },
  { contains: "foodpanda", category: "Eating Out" },
  { contains: "grabfood", category: "Eating Out" },
  // Transport
  { contains: "tfl", category: "Transport" },
  { contains: "transport for london", category: "Transport" },
  { contains: "uber", category: "Transport" },
  { contains: "bolt", category: "Transport" },
  { contains: "grab ", category: "Transport" },
  { contains: "gojek", category: "Transport" },
  { contains: "national rail", category: "Transport" },
  { contains: "trainline", category: "Transport" },
  { contains: "avanti", category: "Transport" },
  { contains: "great western", category: "Transport" },
  { contains: "southern rail", category: "Transport" },
  { contains: "petrol", category: "Transport" },
  { contains: "shell ", category: "Transport" },
  { contains: "bp fuel", category: "Transport" },
  { contains: "esso", category: "Transport" },
  { contains: "parking", category: "Transport" },
  // Subscriptions / Entertainment
  { contains: "netflix", category: "Subscriptions" },
  { contains: "spotify", category: "Subscriptions" },
  { contains: "apple music", category: "Subscriptions" },
  { contains: "amazon prime", category: "Subscriptions" },
  { contains: "disney+", category: "Subscriptions" },
  { contains: "disney plus", category: "Subscriptions" },
  { contains: "hbo", category: "Subscriptions" },
  { contains: "youtube premium", category: "Subscriptions" },
  { contains: "apple tv", category: "Subscriptions" },
  { contains: "paramount", category: "Subscriptions" },
  { contains: "audible", category: "Subscriptions" },
  { contains: "kindle unlimited", category: "Subscriptions" },
  { contains: "adobe", category: "Subscriptions" },
  { contains: "microsoft 365", category: "Subscriptions" },
  { contains: "office 365", category: "Subscriptions" },
  { contains: "icloud", category: "Subscriptions" },
  { contains: "google one", category: "Subscriptions" },
  { contains: "dropbox", category: "Subscriptions" },
  { contains: "notion", category: "Subscriptions" },
  { contains: "claude.ai", category: "Subscriptions" },
  { contains: "openai", category: "Subscriptions" },
  { contains: "chatgpt", category: "Subscriptions" },
  { contains: "github", category: "Subscriptions" },
  // Entertainment
  { contains: "cinema", category: "Entertainment" },
  { contains: "odeon", category: "Entertainment" },
  { contains: "vue cinema", category: "Entertainment" },
  { contains: "cineworld", category: "Entertainment" },
  { contains: "steam ", category: "Entertainment" },
  { contains: "playstation", category: "Entertainment" },
  { contains: "xbox", category: "Entertainment" },
  { contains: "nintendo", category: "Entertainment" },
  // Utilities
  { contains: "british gas", category: "Utilities" },
  { contains: "eon energy", category: "Utilities" },
  { contains: "octopus energy", category: "Utilities" },
  { contains: "ovo energy", category: "Utilities" },
  { contains: "bulb", category: "Utilities" },
  { contains: "water bill", category: "Utilities" },
  { contains: "thames water", category: "Utilities" },
  { contains: "bt broadband", category: "Utilities" },
  { contains: "virgin media", category: "Utilities" },
  { contains: "sky broadband", category: "Utilities" },
  { contains: "vodafone", category: "Utilities" },
  { contains: "ee mobile", category: "Utilities" },
  { contains: "o2 mobile", category: "Utilities" },
  { contains: "three mobile", category: "Utilities" },
  { contains: "council tax", category: "Utilities" },
  { contains: "tenaga nasional", category: "Utilities" },
  { contains: "unifi", category: "Utilities" },
  { contains: "maxis", category: "Utilities" },
  { contains: "celcom", category: "Utilities" },
  // Shopping
  { contains: "amazon", category: "Shopping" },
  { contains: "ebay", category: "Shopping" },
  { contains: "asos", category: "Shopping" },
  { contains: "zara", category: "Shopping" },
  { contains: "h&m", category: "Shopping" },
  { contains: "primark", category: "Shopping" },
  { contains: "next plc", category: "Shopping" },
  { contains: "marks & spencer", category: "Shopping" },
  { contains: "john lewis", category: "Shopping" },
  { contains: "argos", category: "Shopping" },
  { contains: "ikea", category: "Shopping" },
  { contains: "homebase", category: "Shopping" },
  { contains: "b&q", category: "Shopping" },
  { contains: "currys", category: "Shopping" },
  { contains: "apple store", category: "Shopping" },
  { contains: "shopee", category: "Shopping" },
  { contains: "lazada", category: "Shopping" },
  // Healthcare
  { contains: "boots pharmacy", category: "Healthcare" },
  { contains: "lloyds pharmacy", category: "Healthcare" },
  { contains: "nhs ", category: "Healthcare" },
  { contains: "dentist", category: "Healthcare" },
  { contains: "optician", category: "Healthcare" },
  { contains: "physio", category: "Healthcare" },
  { contains: "bupa", category: "Healthcare" },
  { contains: "vitality health", category: "Healthcare" },
  { contains: "axa health", category: "Healthcare" },
  { contains: "klinik", category: "Healthcare" },
  // Education
  { contains: "udemy", category: "Education" },
  { contains: "coursera", category: "Education" },
  { contains: "pluralsight", category: "Education" },
  { contains: "skillshare", category: "Education" },
  { contains: "university", category: "Education" },
  { contains: "tuition fee", category: "Education" },
  { contains: "school fee", category: "Education" },
  // Travel
  { contains: "airbnb", category: "Travel" },
  { contains: "booking.com", category: "Travel" },
  { contains: "hotels.com", category: "Travel" },
  { contains: "expedia", category: "Travel" },
  { contains: "british airways", category: "Travel" },
  { contains: "easyjet", category: "Travel" },
  { contains: "ryanair", category: "Travel" },
  { contains: "emirates", category: "Travel" },
  { contains: "malaysia airlines", category: "Travel" },
  { contains: "air asia", category: "Travel" },
  { contains: "airasia", category: "Travel" },
  // Insurance
  { contains: "aviva", category: "Insurance" },
  { contains: "direct line", category: "Insurance" },
  { contains: "admiral", category: "Insurance" },
  { contains: "churchill", category: "Insurance" },
  { contains: "hastings direct", category: "Insurance" },
  { contains: "life insurance", category: "Insurance" },
  { contains: "car insurance", category: "Insurance" },
  { contains: "home insurance", category: "Insurance" },
  { contains: "travel insurance", category: "Insurance" },
  // Rent / Housing
  { contains: "rent payment", category: "Rent" },
  { contains: "landlord", category: "Rent" },
  { contains: "estate agent", category: "Rent" },
  // Salary / Income
  { contains: "salary", category: "Salary" },
  { contains: "payroll", category: "Salary" },
  { contains: "wages", category: "Salary" },
  { contains: "hmrc", category: "Salary" },
  // Investments / Savings
  { contains: "vanguard", category: "Investments" },
  { contains: "hargreaves lansdown", category: "Investments" },
  { contains: "trading 212", category: "Investments" },
  { contains: "freetrade", category: "Investments" },
  { contains: "moneybox", category: "Savings" },
  { contains: "chip savings", category: "Savings" },
  { contains: "plum app", category: "Savings" },
];

export function loadCatRules(): CatRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CatRule[];
  } catch {
    return [];
  }
}

export function saveCatRules(rules: CatRule[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export function applyAutoCategory(description: string): string | null {
  const q = description.toLowerCase();
  // User rules take priority over built-ins
  const userRules = loadCatRules();
  for (const rule of userRules) {
    if (q.includes(rule.contains.toLowerCase())) return rule.category;
  }
  for (const rule of BUILT_IN) {
    if (q.includes(rule.contains)) return rule.category;
  }
  return null;
}
