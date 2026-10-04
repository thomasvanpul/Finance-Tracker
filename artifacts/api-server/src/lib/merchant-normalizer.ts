// Maps common raw merchant strings (from bank statements) to clean display names.
// Pattern matching is applied in order; first match wins.

interface Rule {
  pattern: RegExp;
  name: string;
}

const RULES: Rule[] = [
  // ── Credit products (a lender, so it is the billing entity) ───────────────
  // Wallet rails (Apple Pay, Google Pay, Samsung Pay) are not rules: they
  // are stripped before matching, see WALLET_RAILS below.
  { pattern: /paypal\s?credit/i,        name: "PayPal Credit" },

  // ── Platform billing channels (must precede the brand rules below) ────────
  //
  // PRINCIPLE: a merchant is the billing entity, not the brand that owns it.
  //
  // Large platforms bill through several unrelated channels and name the
  // channel in the descriptor. `APPLE.COM/BILL` (digital subscriptions and
  // App Store charges) and `APPLE STORE R123` (retail) share an owner and
  // nothing else — different price, different cadence, different intent.
  // Collapsing them to "Apple" puts a monthly subscription, a yearly
  // developer licence and a one-off £179 purchase into a single group, and
  // recurring-detector-server.ts rejects that group whole: it requires every
  // amount to be within ±20% of the median. The charge most worth finding is
  // the one a brand-wide key guarantees to lose.
  //
  // So: when a descriptor carries a recognisable CHANNEL token, the
  // normalised name keeps it. The bare-brand rule remains as the fallback for
  // descriptors with no channel. Store numbers, terminal ids and reference
  // suffixes are still stripped — those are noise, not channel.
  //
  // The test for channel vs noise: would two charges bearing this token be
  // expected to share an amount and a cadence? `Mktp` yes, `R123` no.
  //
  // This generalises — Google, Amazon and Microsoft have the identical shape,
  // and any future platform with more than one billing channel belongs here.

  // Apple.
  // The channel token is not always adjacent to the brand — Apple bills
  // the developer programme as `APPLE.COM/BILL DEVELOPER`, so the token
  // trails the billing domain. Match the token anywhere in an Apple-ish
  // descriptor, most specific first, and fall through to the bare
  // billing domain only when no token is present.
  { pattern: /apple.{0,20}developer/i,  name: "Apple Developer" },
  { pattern: /itunes/i,                 name: "iTunes" },
  { pattern: /icloud/i,                 name: "iCloud" },
  { pattern: /apple.{0,20}music/i,      name: "Apple Music" },
  { pattern: /apple\s?tv/i,             name: "Apple TV+" },
  { pattern: /apple.{0,20}\bone\b/i,    name: "Apple One" },
  { pattern: /apple\s?store/i,          name: "Apple Store" },
  { pattern: /apple\.com/i,             name: "Apple.com/Bill" },
  { pattern: /\bapple\b/i,              name: "Apple" },

  // Google
  { pattern: /google.{0,3}(youtube|yt\s?premium)/i, name: "YouTube Premium" },
  { pattern: /google.{0,3}workspace|g\s?suite|gsuite/i, name: "Google Workspace" },
  { pattern: /google.{0,3}cloud|\bgcp\b/i, name: "Google Cloud" },
  { pattern: /google.{0,3}(one|storage)/i, name: "Google One" },
  { pattern: /google.{0,3}play/i,       name: "Google Play" },
  { pattern: /google.{0,3}fi\b/i,       name: "Google Fi" },
  { pattern: /\bgoogle\b/i,             name: "Google" },

  // Amazon
  { pattern: /(amazon|amzn).{0,3}prime|prime\s?video/i, name: "Amazon Prime" },
  { pattern: /amazon\s?web\s?services|\baws\b/i, name: "AWS" },
  { pattern: /audible/i,                name: "Audible" },
  { pattern: /kindle/i,                 name: "Kindle" },
  { pattern: /(amzn|amazon)\s?mktpl?/i, name: "Amazon Marketplace" },
  { pattern: /amzn|amazon/i,            name: "Amazon" },

  // Microsoft
  { pattern: /(microsoft|msft).{0,3}(365|office)/i, name: "Microsoft 365" },
  { pattern: /xbox/i,                   name: "Xbox" },
  { pattern: /azure/i,                  name: "Azure" },
  { pattern: /microsoft|\bmsft\b/i,     name: "Microsoft" },


  // ── E-commerce / Retail ────────────────────────────────────────────────────
  { pattern: /ebay/i,                   name: "eBay" },
  { pattern: /etsy/i,                   name: "Etsy" },
  { pattern: /ali(express|baba|pay)/i,  name: "AliExpress" },
  { pattern: /asos/i,                   name: "ASOS" },
  { pattern: /zalando/i,                name: "Zalando" },
  { pattern: /shein/i,                  name: "Shein" },
  { pattern: /temu/i,                   name: "Temu" },
  { pattern: /argos/i,                  name: "Argos" },
  { pattern: /currys/i,                 name: "Currys" },
  { pattern: /john\s?lewis/i,           name: "John Lewis" },
  { pattern: /next\b/i,                 name: "Next" },
  { pattern: /h\s?&\s?m\b/i,            name: "H&M" },
  { pattern: /zara/i,                   name: "Zara" },
  { pattern: /primark/i,                name: "Primark" },

  // ── Food Delivery ─────────────────────────────────────────────────────────
  { pattern: /uber\s?eats/i,            name: "Uber Eats" },
  { pattern: /deliveroo/i,              name: "Deliveroo" },
  { pattern: /just\s?eat/i,             name: "Just Eat" },
  { pattern: /doordash/i,               name: "DoorDash" },
  { pattern: /grubhub/i,                name: "Grubhub" },

  // ── Streaming ─────────────────────────────────────────────────────────────
  { pattern: /netflix/i,                name: "Netflix" },
  { pattern: /spotify/i,                name: "Spotify" },
  { pattern: /youtube\s?(premium)?/i,   name: "YouTube Premium" },
  { pattern: /disney\+?/i,              name: "Disney+" },
  { pattern: /hulu/i,                   name: "Hulu" },
  { pattern: /hbo\s?(max|now)?/i,       name: "HBO Max" },
  { pattern: /paramount\+?/i,           name: "Paramount+" },
  { pattern: /dazn/i,                   name: "DAZN" },
  { pattern: /sky\s?(tv|sports|go)/i,   name: "Sky" },
  { pattern: /bbc\s?iplayer|bbc\s?licence/i, name: "BBC" },
  { pattern: /now\s?tv/i,               name: "NOW TV" },
  { pattern: /tidal/i,                  name: "Tidal" },
  { pattern: /deezer/i,                 name: "Deezer" },

  // ── Ride / Transport ──────────────────────────────────────────────────────
  { pattern: /\buber\b(?!\s?eats)/i,    name: "Uber" },
  { pattern: /lyft/i,                   name: "Lyft" },
  { pattern: /bolt\.eu|bolt\s?ride/i,   name: "Bolt" },
  { pattern: /freenow|free\s?now/i,     name: "FREE NOW" },
  { pattern: /addison\s?lee/i,          name: "Addison Lee" },
  { pattern: /trainline/i,              name: "Trainline" },
  { pattern: /tfl|transport\s?for\s?london/i, name: "TfL" },
  { pattern: /eurostar/i,               name: "Eurostar" },
  { pattern: /national\s?rail/i,        name: "National Rail" },
  { pattern: /greater\s?anglia/i,       name: "Greater Anglia" },
  { pattern: /avanti\s?west/i,          name: "Avanti West Coast" },
  { pattern: /greater\s?manchester\s?(rail|tram|supertram)/i, name: "Greater Manchester Transport" },
  { pattern: /crosscountry\s?trains/i,  name: "CrossCountry" },
  { pattern: /south\s?western\s?railway/i, name: "South Western Railway" },

  // ── Supermarkets ──────────────────────────────────────────────────────────
  { pattern: /tesco/i,                  name: "Tesco" },
  { pattern: /sainsbury/i,              name: "Sainsbury's" },
  { pattern: /waitrose/i,               name: "Waitrose" },
  { pattern: /asda/i,                   name: "ASDA" },
  { pattern: /morrisons/i,              name: "Morrisons" },
  { pattern: /lidl/i,                   name: "Lidl" },
  { pattern: /aldi/i,                   name: "Aldi" },
  { pattern: /co-?op/i,                 name: "Co-op" },
  { pattern: /marks\s?&?\s?spencer|m\s?&\s?s\s?food/i, name: "M&S Food" },
  { pattern: /whole\s?foods/i,          name: "Whole Foods" },
  { pattern: /ocado/i,                  name: "Ocado" },
  { pattern: /iceland/i,                name: "Iceland" },

  // ── Petrol / Fuel ─────────────────────────────────────────────────────────
  { pattern: /bp\b|british\s?petroleum/i, name: "BP" },
  { pattern: /shell\b/i,                name: "Shell" },
  { pattern: /esso/i,                   name: "Esso" },
  { pattern: /texaco/i,                 name: "Texaco" },
  { pattern: /exxon(mobil)?/i,          name: "ExxonMobil" },
  { pattern: /jet\b/i,                  name: "Jet" },

  // ── Coffee / Cafes ────────────────────────────────────────────────────────
  { pattern: /starbucks/i,              name: "Starbucks" },
  { pattern: /costa\s?(coffee)?/i,      name: "Costa Coffee" },
  { pattern: /caffe\s?nero/i,           name: "Caffè Nero" },
  { pattern: /pret\s?a?\s?manger/i,     name: "Pret A Manger" },
  { pattern: /greggs/i,                 name: "Greggs" },

  // ── Fast Food ─────────────────────────────────────────────────────────────
  { pattern: /mcdonald/i,               name: "McDonald's" },
  { pattern: /kfc/i,                    name: "KFC" },
  { pattern: /burger\s?king/i,          name: "Burger King" },
  { pattern: /subway\b/i,               name: "Subway" },
  { pattern: /domino/i,                 name: "Domino's" },
  { pattern: /pizza\s?hut/i,            name: "Pizza Hut" },
  { pattern: /papa\s?john/i,            name: "Papa John's" },
  { pattern: /nando/i,                  name: "Nando's" },
  { pattern: /five\s?guys/i,            name: "Five Guys" },

  // ── Finance & Banking ─────────────────────────────────────────────────────
  { pattern: /paypal(?!\s?credit)/i,    name: "PayPal" },
  { pattern: /stripe/i,                 name: "Stripe" },
  { pattern: /monzo/i,                  name: "Monzo" },
  { pattern: /starling/i,               name: "Starling Bank" },
  { pattern: /revolut/i,                name: "Revolut" },
  { pattern: /wise\b|transfer\s?wise/i, name: "Wise" },
  { pattern: /barclays/i,               name: "Barclays" },
  { pattern: /lloyds/i,                 name: "Lloyds Bank" },
  { pattern: /natwest/i,                name: "NatWest" },
  { pattern: /hsbc/i,                   name: "HSBC" },
  { pattern: /santander/i,              name: "Santander" },
  { pattern: /nationwide/i,             name: "Nationwide" },
  { pattern: /halifax/i,                name: "Halifax" },
  { pattern: /first\s?direct/i,         name: "First Direct" },
  { pattern: /metro\s?bank/i,           name: "Metro Bank" },

  // ── Utilities ─────────────────────────────────────────────────────────────
  { pattern: /british\s?gas/i,          name: "British Gas" },
  { pattern: /e\.?on|e-?on\b/i,         name: "E.ON" },
  { pattern: /octopus\s?energy/i,       name: "Octopus Energy" },
  { pattern: /bulb\b/i,                 name: "Bulb" },
  { pattern: /edf\b/i,                  name: "EDF Energy" },
  { pattern: /scottish\s?power/i,       name: "ScottishPower" },
  { pattern: /ovo\s?energy/i,           name: "OVO Energy" },
  { pattern: /npower/i,                 name: "npower" },
  { pattern: /thames\s?water/i,         name: "Thames Water" },
  { pattern: /severn\s?trent/i,         name: "Severn Trent" },
  { pattern: /bt\b|british\s?telecom/i, name: "BT" },
  { pattern: /sky\s?(broadband|mobile)/i, name: "Sky" },
  { pattern: /virgin\s?(media|mobile)/i, name: "Virgin Media" },
  { pattern: /vodafone/i,               name: "Vodafone" },
  { pattern: /o2\b/i,                   name: "O2" },
  { pattern: /three\b|3\s?mobile/i,     name: "Three" },
  { pattern: /ee\b/i,                   name: "EE" },
  { pattern: /giffgaff/i,               name: "giffgaff" },

  // ── Software / SaaS ───────────────────────────────────────────────────────
  { pattern: /github/i,                 name: "GitHub" },
  { pattern: /gitlab/i,                 name: "GitLab" },
  { pattern: /notion/i,                 name: "Notion" },
  { pattern: /figma/i,                  name: "Figma" },
  { pattern: /slack/i,                  name: "Slack" },
  { pattern: /zoom/i,                   name: "Zoom" },
  { pattern: /dropbox/i,                name: "Dropbox" },
  { pattern: /1password/i,              name: "1Password" },
  { pattern: /lastpass/i,               name: "LastPass" },
  { pattern: /nordvpn/i,                name: "NordVPN" },
  { pattern: /expressvpn/i,             name: "ExpressVPN" },
  { pattern: /proton\s?(mail|vpn)?/i,   name: "Proton" },
  { pattern: /adobe/i,                  name: "Adobe" },
  { pattern: /canva/i,                  name: "Canva" },
  { pattern: /mailchimp/i,              name: "Mailchimp" },
  { pattern: /shopify/i,                name: "Shopify" },
  { pattern: /squarespace/i,            name: "Squarespace" },
  { pattern: /wix\b/i,                  name: "Wix" },
  { pattern: /netlify/i,                name: "Netlify" },
  { pattern: /vercel/i,                 name: "Vercel" },
  { pattern: /cloudflare/i,             name: "Cloudflare" },
  { pattern: /openai/i,                 name: "OpenAI" },
  { pattern: /anthropic/i,              name: "Anthropic" },

  // ── Fitness / Health ──────────────────────────────────────────────────────
  { pattern: /pure\s?gym/i,             name: "PureGym" },
  { pattern: /gym\s?shark/i,            name: "Gymshark" },
  { pattern: /peloton/i,                name: "Peloton" },
  { pattern: /headspace/i,              name: "Headspace" },
  { pattern: /calm\b/i,                 name: "Calm" },
  { pattern: /nhs/i,                    name: "NHS" },

  // ── Travel ────────────────────────────────────────────────────────────────
  { pattern: /airbnb/i,                 name: "Airbnb" },
  { pattern: /booking\.com/i,           name: "Booking.com" },
  { pattern: /expedia/i,                name: "Expedia" },
  { pattern: /ryanair/i,                name: "Ryanair" },
  { pattern: /easyjet/i,                name: "easyJet" },
  { pattern: /british\s?airways/i,      name: "British Airways" },
  { pattern: /virgin\s?atlantic/i,      name: "Virgin Atlantic" },
];

/**
 * Normalize a raw transaction description to a clean merchant name.
 * Returns the original description if no rule matches.
 */
// A wallet is a payment rail, not a merchant. `APPLE PAY TESCO` was once
// collapsed to "Apple Pay", which put groceries, fuel and coffee in one key
// whose amounts can never pass the detector's ±20% gate, and lost Tesco.
// Decision (vault Efforts/Numeris-Decisions.md § 12, the recommended option):
// strip the rail, keep the merchant. A descriptor that is only the rail keeps
// the rail's name, since there is nothing else to call it.
const WALLET_RAILS: Rule[] = [
  { pattern: /apple\s?pay/i,   name: "Apple Pay" },
  { pattern: /google\s?pay/i,  name: "Google Pay" },
  { pattern: /samsung\s?pay/i, name: "Samsung Pay" },
];

export function normalizeMerchant(raw: string): string {
  for (const rail of WALLET_RAILS) {
    if (!rail.pattern.test(raw)) continue;
    const rest = raw.replace(rail.pattern, " ").replace(/^[\s*:\-]+|[\s*:\-]+$/g, "");
    return rest === "" ? rail.name : matchRules(rest);
  }
  return matchRules(raw);
}

function matchRules(raw: string): string {
  for (const rule of RULES) {
    if (rule.pattern.test(raw)) return rule.name;
  }
  // Fallback: trim trailing reference numbers (e.g. "AMZN*AB12CD")
  return raw
    .replace(/\s*\*[A-Z0-9]{4,}\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// What every bank-sourced ingest path writes: the display name, and the
// bank's own string beside it in transactions.raw_description, so a later
// normaliser can be re-applied and a wrong rule can be corrected. Manual
// entry does not go through this: what a person typed is not a bank
// descriptor, and rewriting it would override them.
export function ingestDescription(raw: string): { description: string; rawDescription: string } {
  return { description: normalizeMerchant(raw), rawDescription: raw };
}
