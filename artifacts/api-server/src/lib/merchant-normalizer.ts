// Maps common raw merchant strings (from bank statements) to clean display names.
// Pattern matching is applied in order; first match wins.

interface Rule {
  pattern: RegExp;
  name: string;
}

const RULES: Rule[] = [
  // ── E-commerce / Retail ────────────────────────────────────────────────────
  { pattern: /amzn|amazon/i,            name: "Amazon" },
  { pattern: /ebay/i,                   name: "eBay" },
  { pattern: /etsy/i,                   name: "Etsy" },
  { pattern: /ali(express|baba|pay)/i,  name: "AliExpress" },
  { pattern: /asos/i,                   name: "ASOS" },
  { pattern: /zalando/i,                name: "Zalando" },
  { pattern: /shein/i,                  name: "Shein" },
  { pattern: /temu/i,                   name: "Temu" },
  { pattern: /apple\.com|apple store|itunes/i, name: "Apple" },
  { pattern: /google\s?(play|llc|one|storage|fi)/i, name: "Google" },
  { pattern: /microsoft/i,              name: "Microsoft" },

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
  { pattern: /amazon\s?prime/i,         name: "Amazon Prime" },
  { pattern: /apple\s?tv/i,             name: "Apple TV+" },
  { pattern: /hulu/i,                   name: "Hulu" },
  { pattern: /hbo\s?(max|now)?/i,       name: "HBO Max" },
  { pattern: /paramount\+?/i,           name: "Paramount+" },
  { pattern: /dazn/i,                   name: "DAZN" },
  { pattern: /sky\s?(tv|sports|go)/i,   name: "Sky" },
  { pattern: /bbc\s?iplayer|bbc\s?licence/i, name: "BBC" },
  { pattern: /now\s?tv/i,               name: "NOW TV" },
  { pattern: /apple\s?music/i,          name: "Apple Music" },
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
  { pattern: /paypal/i,                 name: "PayPal" },
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
export function normalizeMerchant(raw: string): string {
  for (const rule of RULES) {
    if (rule.pattern.test(raw)) return rule.name;
  }
  // Fallback: trim trailing reference numbers (e.g. "AMZN*AB12CD")
  return raw
    .replace(/\s*\*[A-Z0-9]{4,}\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
