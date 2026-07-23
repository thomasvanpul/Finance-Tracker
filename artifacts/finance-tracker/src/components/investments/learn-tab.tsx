import { useState, useCallback } from "react";
import { Lock } from "lucide-react";
import { useFintrackTheme, type FintrackTheme } from "@/contexts/theme-context";

// ── Types ─────────────────────────────────────────────────────────────────────

type Difficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

interface QuizQuestion {
  q: string;
  options: string[];
  correct: number;
  explanation: string;
}

interface TopicCard {
  id: string;
  icon: string;
  title: string;
  difficulty: Difficulty;
  xp: number;
  hook: string;
  steps: string[];      // step titles for progress bar
  requiredXP: number;   // XP needed to unlock
  category: string;
}

// ── Level system ──────────────────────────────────────────────────────────────

interface Level {
  name: string;
  minXP: number;
  color: string;
}

const LEVELS: Level[] = [
  { name: "NOVICE",   minXP: 0,   color: "var(--ft-dim)" },
  { name: "STUDENT",  minXP: 100, color: "var(--ft-green)" },
  { name: "ANALYST",  minXP: 300, color: "var(--ft-blue)" },
  { name: "SCHOLAR",  minXP: 600, color: "var(--ft-amber)" },
  { name: "MASTER",   minXP: 900, color: "var(--ft-accent)" },
];

type ThemeRarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

export interface ThemeReward {
  id: FintrackTheme;
  label: string;
  requiredXP: number;
  rarity: ThemeRarity;
  accent: string;
  base: string;
  description: string;
}

export const THEME_REWARDS: ThemeReward[] = [
  { id: "phosphor",   label: "Phosphor",   requiredXP: 0,    rarity: "COMMON",    accent: "#7FFF00", base: "#020802", description: "CRT phosphor green" },
  { id: "arctic",     label: "Arctic",     requiredXP: 0,    rarity: "COMMON",    accent: "#0052CC", base: "#F0F4F8", description: "Corporate daylight" },
  { id: "amber",      label: "Amber",      requiredXP: 200,  rarity: "UNCOMMON",  accent: "#FFD700", base: "#0A0600", description: "Warm trader console" },
  { id: "midnight",   label: "Midnight",   requiredXP: 400,  rarity: "UNCOMMON",  accent: "#4D9FFF", base: "#010817", description: "Late-night deep blue" },
  { id: "matrix",     label: "Matrix",     requiredXP: 650,  rarity: "RARE",      accent: "#00FF41", base: "#000300", description: "Decoded reality" },
  { id: "synthwave",  label: "Synthwave",  requiredXP: 750,  rarity: "RARE",      accent: "#FF007A", base: "#0D001A", description: "Neon grids, 80s midnight" },
  { id: "deep-space", label: "Deep Space", requiredXP: 800,  rarity: "RARE",      accent: "#7B5EA7", base: "#010108", description: "Cosmic observatory" },
  { id: "mario",      label: "Mario",      requiredXP: 950,  rarity: "EPIC",      accent: "#E31212", base: "#0A0F1F", description: "8-bit power-up" },
  { id: "gilded",     label: "Gilded",     requiredXP: 1100, rarity: "EPIC",      accent: "#C8941E", base: "#080600", description: "Black gold, no noise" },
  { id: "bloodline",  label: "Bloodline",  requiredXP: 1300, rarity: "LEGENDARY", accent: "#CC1A2F", base: "#0F0003", description: "Dark market, red signals" },
];

const RARITY_COLOR: Record<ThemeRarity, string> = {
  COMMON:    "var(--ft-dim)",
  UNCOMMON:  "var(--ft-green)",
  RARE:      "var(--ft-blue)",
  EPIC:      "#a855f7",
  LEGENDARY: "var(--ft-amber)",
};


export function getLevel(xp: number): Level & { next: Level | null; progress: number } {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (xp >= lvl.minXP) current = lvl;
  }
  const idx = LEVELS.indexOf(current);
  const next = LEVELS[idx + 1] ?? null;
  const progress = next
    ? ((xp - current.minXP) / (next.minXP - current.minXP)) * 100
    : 100;
  return { ...current, next, progress };
}

const CATEGORIES = ["All", "Investing", "Budgeting", "Tax & Retirement", "Personal Finance", "Economics", "Crypto"] as const;
type Category = typeof CATEGORIES[number];

// ── Topic definitions ─────────────────────────────────────────────────────────

const TOPICS: TopicCard[] = [
  {
    id: "compound-interest",
    icon: "∑",
    title: "Compound Interest",
    difficulty: "BEGINNER",
    xp: 60,
    hook: "Why time in the market beats timing the market.",
    steps: ["The Formula", "Time in Action", "The Snowball Effect", "Knowledge Check"],
    requiredXP: 0,
    category: "Investing",
  },
  {
    id: "diversification",
    icon: "◈",
    title: "Diversification",
    difficulty: "BEGINNER",
    xp: 50,
    hook: "Don't put all your eggs in one basket.",
    steps: ["Core Concept", "The Efficient Frontier", "Practical Limits", "Knowledge Check"],
    requiredXP: 0,
    category: "Investing",
  },
  {
    id: "dca",
    icon: "DCA",
    title: "Dollar-Cost Averaging",
    difficulty: "BEGINNER",
    xp: 50,
    hook: "Remove emotion from investing.",
    steps: ["What is DCA", "The Psychology", "Worked Example", "Knowledge Check"],
    requiredXP: 0,
    category: "Investing",
  },
  {
    id: "four-percent-rule",
    icon: "4%",
    title: "The 4% Rule",
    difficulty: "BEGINNER",
    xp: 60,
    hook: "How much do you need to retire?",
    steps: ["The Trinity Study", "Your FIRE Number", "Caveats", "Knowledge Check"],
    requiredXP: 0,
    category: "Investing",
  },
  {
    id: "pe-ratio",
    icon: "P/E",
    title: "P/E Ratio",
    difficulty: "INTERMEDIATE",
    xp: 75,
    hook: "Is this stock cheap or expensive?",
    steps: ["What is P/E", "Reading the Multiple", "Sector Context", "Knowledge Check"],
    requiredXP: 100,
    category: "Investing",
  },
  {
    id: "dcf-valuation",
    icon: "DCF",
    title: "DCF Valuation",
    difficulty: "INTERMEDIATE",
    xp: 100,
    hook: "What is this company actually worth?",
    steps: ["Present Value", "Building the Model", "Sensitivity", "Knowledge Check"],
    requiredXP: 200,
    category: "Investing",
  },
  {
    id: "options-101",
    icon: "⊕",
    title: "Options 101",
    difficulty: "ADVANCED",
    xp: 120,
    hook: "The right but not the obligation.",
    steps: ["Calls & Puts", "The Greeks", "Black-Scholes", "Knowledge Check"],
    requiredXP: 400,
    category: "Investing",
  },
  {
    id: "short-selling",
    icon: "↓",
    title: "Short Selling",
    difficulty: "ADVANCED",
    xp: 120,
    hook: "Profiting from falling prices.",
    steps: ["Mechanics", "The Risk Profile", "Short Squeezes", "Knowledge Check"],
    requiredXP: 500,
    category: "Investing",
  },
  // ── Budgeting ─────────────────────────────────────────────────────────────────
  { id: "emergency-fund", icon: "£!", title: "Emergency Fund", difficulty: "BEGINNER", xp: 45, hook: "The foundation of financial security.", steps: ["Why 3-6 Months", "Where to Keep It", "Building Yours", "Knowledge Check"], requiredXP: 0, category: "Budgeting" },
  { id: "fifty-thirty-twenty", icon: "503", title: "50/30/20 Rule", difficulty: "BEGINNER", xp: 45, hook: "The simplest budget framework that actually works.", steps: ["The Split", "Applying It", "Adjusting for You", "Knowledge Check"], requiredXP: 0, category: "Budgeting" },
  { id: "zero-based-budgeting", icon: "ZBB", title: "Zero-Based Budgeting", difficulty: "INTERMEDIATE", xp: 65, hook: "Every pound gets a job. No idle money.", steps: ["The Core Principle", "Building the Budget", "Monthly Reset", "Knowledge Check"], requiredXP: 50, category: "Budgeting" },
  { id: "debt-avalanche", icon: "D↓", title: "Debt Avalanche", difficulty: "BEGINNER", xp: 55, hook: "The mathematically optimal way to eliminate debt.", steps: ["Avalanche vs Snowball", "Building Your Stack", "Staying Motivated", "Knowledge Check"], requiredXP: 0, category: "Budgeting" },
  // ── Investing (additional) ───────────────────────────────────────────────────
  { id: "index-funds", icon: "IDX", title: "Index Funds", difficulty: "BEGINNER", xp: 60, hook: "Own the entire market for pennies.", steps: ["What is an Index", "Why Passive Wins", "Picking an Index Fund", "Knowledge Check"], requiredXP: 60, category: "Investing" },
  { id: "bonds-basics", icon: "B%", title: "Bonds Basics", difficulty: "BEGINNER", xp: 55, hook: "The other half of a balanced portfolio.", steps: ["What is a Bond", "Yield vs Price", "Role in a Portfolio", "Knowledge Check"], requiredXP: 0, category: "Investing" },
  { id: "reits", icon: "REIT", title: "REITs", difficulty: "INTERMEDIATE", xp: 75, hook: "Real estate exposure without buying property.", steps: ["What is a REIT", "Types of REITs", "Valuing REITs", "Knowledge Check"], requiredXP: 200, category: "Investing" },
  { id: "factor-investing", icon: "α", title: "Factor Investing", difficulty: "ADVANCED", xp: 100, hook: "The academic drivers of excess return.", steps: ["Five Factors", "Value Factor", "Momentum & Quality", "Knowledge Check"], requiredXP: 400, category: "Investing" },
  // ── Tax & Retirement ─────────────────────────────────────────────────────────
  { id: "isa-strategy", icon: "ISA", title: "ISA Strategy", difficulty: "BEGINNER", xp: 60, hook: "The UK's most powerful tax shelter.", steps: ["ISA Types", "S&S ISA Deep Dive", "Maximising the Allowance", "Knowledge Check"], requiredXP: 0, category: "Tax & Retirement" },
  { id: "pension-basics", icon: "PEN", title: "Pension Basics", difficulty: "BEGINNER", xp: 55, hook: "The best guaranteed return you'll ever get.", steps: ["How Pensions Work", "Employer Match", "Contribution Limits", "Knowledge Check"], requiredXP: 0, category: "Tax & Retirement" },
  { id: "capital-gains-tax", icon: "CGT", title: "Capital Gains Tax", difficulty: "INTERMEDIATE", xp: 75, hook: "Keep more of what you earn.", steps: ["What Triggers CGT", "Annual Allowance", "Minimising Your Bill", "Knowledge Check"], requiredXP: 100, category: "Tax & Retirement" },
  { id: "tax-loss-harvesting", icon: "TLH", title: "Tax-Loss Harvesting", difficulty: "ADVANCED", xp: 90, hook: "Turn paper losses into real tax savings.", steps: ["The Strategy", "Wash Sale Rules", "Practical Implementation", "Knowledge Check"], requiredXP: 400, category: "Tax & Retirement" },
  // ── Personal Finance ─────────────────────────────────────────────────────────
  { id: "credit-scores", icon: "CR", title: "Credit Scores", difficulty: "BEGINNER", xp: 50, hook: "The number banks obsess over.", steps: ["What Is a Score", "What Moves It", "Optimising Yours", "Knowledge Check"], requiredXP: 0, category: "Personal Finance" },
  { id: "mortgage-basics", icon: "MTG", title: "Mortgage Basics", difficulty: "INTERMEDIATE", xp: 70, hook: "The maths behind the biggest purchase of your life.", steps: ["LTV and Rates", "Repayment vs Interest-Only", "True Cost of Buying", "Knowledge Check"], requiredXP: 100, category: "Personal Finance" },
  { id: "insurance-basics", icon: "INS", title: "Insurance Basics", difficulty: "BEGINNER", xp: 50, hook: "Protecting everything you've built.", steps: ["Risk Pooling", "Types to Consider", "Avoiding Over-Insurance", "Knowledge Check"], requiredXP: 0, category: "Personal Finance" },
  // ── Economics ────────────────────────────────────────────────────────────────
  { id: "inflation", icon: "CPI", title: "Inflation", difficulty: "BEGINNER", xp: 55, hook: "The silent tax on your savings.", steps: ["What Causes Inflation", "How It's Measured", "Protecting Against It", "Knowledge Check"], requiredXP: 0, category: "Economics" },
  { id: "interest-rates", icon: "r%", title: "Interest Rates", difficulty: "INTERMEDIATE", xp: 70, hook: "How central banks move every market simultaneously.", steps: ["The Mechanism", "Rates and Asset Prices", "The Inverted Yield Curve", "Knowledge Check"], requiredXP: 100, category: "Economics" },
  { id: "yield-curve", icon: "YC", title: "Yield Curve", difficulty: "ADVANCED", xp: 85, hook: "The bond market's recession warning system.", steps: ["Reading the Curve", "Why It Inverts", "Historical Signals", "Knowledge Check"], requiredXP: 300, category: "Economics" },
  { id: "gdp-basics", icon: "GDP", title: "GDP Basics", difficulty: "BEGINNER", xp: 50, hook: "Measuring the size of an economy.", steps: ["What GDP Measures", "GDP vs GNP", "Leading Indicators", "Knowledge Check"], requiredXP: 0, category: "Economics" },
  // ── Crypto ───────────────────────────────────────────────────────────────────
  { id: "bitcoin-basics", icon: "BTC", title: "Bitcoin Basics", difficulty: "BEGINNER", xp: 60, hook: "Digital scarcity for the first time in history.", steps: ["What is Bitcoin", "The Halving Cycle", "Store of Value Case", "Knowledge Check"], requiredXP: 0, category: "Crypto" },
  { id: "blockchain-basics", icon: "⛓", title: "Blockchain Basics", difficulty: "BEGINNER", xp: 55, hook: "The technology under the hype.", steps: ["Distributed Ledgers", "Consensus Mechanisms", "What Blockchains Actually Solve", "Knowledge Check"], requiredXP: 0, category: "Crypto" },
  { id: "defi-basics", icon: "DeFi", title: "DeFi Basics", difficulty: "INTERMEDIATE", xp: 80, hook: "Finance without banks, middlemen, or office hours.", steps: ["Protocols and Liquidity", "Yield Farming Risks", "Smart Contract Risk", "Knowledge Check"], requiredXP: 200, category: "Crypto" },
  { id: "stablecoins", icon: "SBL", title: "Stablecoins", difficulty: "INTERMEDIATE", xp: 70, hook: "Crypto without the volatility — or is it?", steps: ["Types of Stablecoins", "De-Peg Risk", "Regulatory Landscape", "Knowledge Check"], requiredXP: 100, category: "Crypto" },
];

// ── Quiz definitions ──────────────────────────────────────────────────────────

const QUIZZES: Record<string, QuizQuestion[]> = {
  "compound-interest": [
    {
      q: "£1,000 invested at 7%/yr for 30 years becomes approximately:",
      options: ["£2,100", "£3,100", "£7,600", "£21,000"],
      correct: 2,
      explanation: "At 7% compounded annually: 1000 × 1.07^30 ≈ £7,612. This is the magic of compound growth over long periods.",
    },
    {
      q: "Which choice maximises compound growth?",
      options: [
        "Invest £10,000 in year 30",
        "Invest £1,000/yr for 10 years starting at age 40",
        "Invest £1,000/yr for 10 years starting at age 25, then stop",
        "Always try to time the market",
      ],
      correct: 2,
      explanation: "Starting early matters more than investing more later. The age-25 portfolio benefits from 40+ years of compounding, even with no new contributions after 10 years.",
    },
    {
      q: "The 'Rule of 72' says your money doubles every __ years at 6%/yr:",
      options: ["6 years", "12 years", "18 years", "72 years"],
      correct: 1,
      explanation: "Rule of 72: 72 ÷ interest rate = doubling time. At 6%, that's 72 ÷ 6 = 12 years.",
    },
  ],
  "diversification": [
    {
      q: "Adding a perfectly correlated asset to a portfolio:",
      options: [
        "Reduces risk significantly",
        "Does not reduce risk",
        "Always increases returns",
        "Moves you to the efficient frontier",
      ],
      correct: 1,
      explanation: "Diversification only helps if assets are NOT perfectly correlated. A perfectly correlated asset moves identically to what you already hold.",
    },
    {
      q: "Approximately how many stocks eliminate most company-specific risk?",
      options: ["5", "20–30", "200", "1,000"],
      correct: 1,
      explanation: "Research shows 20–30 uncorrelated stocks remove most unsystematic (company-specific) risk. Beyond ~30 stocks, the marginal benefit falls sharply.",
    },
    {
      q: "What risk CANNOT be diversified away?",
      options: [
        "A single company going bankrupt",
        "A product recall at one firm",
        "A recession affecting all markets",
        "A CEO scandal",
      ],
      correct: 2,
      explanation: "Systematic (market) risk — recessions, interest rate changes, geopolitical events — affects all assets simultaneously and cannot be diversified away.",
    },
  ],
  "dca": [
    {
      q: "If you invest £200/month and prices drop, DCA means you:",
      options: [
        "Pause investing until prices recover",
        "Automatically buy more shares at the lower price",
        "Sell to lock in losses early",
        "Invest less to preserve cash",
      ],
      correct: 1,
      explanation: "DCA's key advantage: your fixed £200 buys more shares when prices fall. Crashes become opportunities rather than disasters.",
    },
    {
      q: "DCA's average cost vs. the simple average of prices is:",
      options: [
        "Always higher",
        "Always equal",
        "Always lower",
        "Depends on market direction",
      ],
      correct: 2,
      explanation: "Because you buy more shares when prices are low, your average cost is mathematically always ≤ the simple average of prices. You can prove this with Jensen's inequality.",
    },
    {
      q: "DCA primarily removes which risk?",
      options: [
        "Systematic market risk",
        "Emotional / timing risk",
        "Currency risk",
        "Credit risk",
      ],
      correct: 1,
      explanation: "DCA removes the emotional risk of trying to time the market — panic-selling in downturns and FOMO-buying at peaks. It automates rational behaviour.",
    },
  ],
  "four-percent-rule": [
    {
      q: "By the 4% rule, someone spending £40,000/year needs a nest egg of:",
      options: ["£400,000", "£600,000", "£1,000,000", "£1,600,000"],
      correct: 2,
      explanation: "FIRE number = annual expenses × 25. £40,000 × 25 = £1,000,000. This is the reciprocal of 4%.",
    },
    {
      q: "The 4% rule was based on historical data going back to:",
      options: ["1980", "1950", "1926", "1900"],
      correct: 2,
      explanation: "The Trinity Study (1998) analysed US market data from 1926, covering multiple crashes, wars, and economic cycles to determine that 4% was historically safe over 30 years.",
    },
    {
      q: "For a 50-year retirement, many researchers recommend a withdrawal rate of:",
      options: ["4%", "3–3.5%", "5–6%", "7%"],
      correct: 1,
      explanation: "The 4% rule was calibrated for 30-year retirements. For longer retirements (40–50 years), 3–3.5% is more prudent to avoid portfolio depletion.",
    },
  ],
  "pe-ratio": [
    {
      q: "A stock at £180 with EPS of £6 has a P/E of:",
      options: ["6×", "18×", "30×", "180×"],
      correct: 2,
      explanation: "P/E = Price ÷ EPS = £180 ÷ £6 = 30×. This means you're paying £30 for every £1 of annual earnings.",
    },
    {
      q: "A tech stock at P/E 30× is most accurately described as:",
      options: [
        "Always overvalued",
        "Cheap relative to its peers",
        "Possibly fairly valued for a high-growth tech company",
        "Guaranteed to underperform",
      ],
      correct: 2,
      explanation: "P/E context is everything. 30× is ordinary for a high-quality tech company with strong growth. The same P/E on a utility would be alarming. Always compare to sector peers.",
    },
    {
      q: "The S&P 500's long-run average P/E is approximately:",
      options: ["8×", "16–18×", "30×", "50×"],
      correct: 1,
      explanation: "The S&P 500 has historically traded at a long-run average P/E of roughly 16–18×, though this has varied significantly across eras and interest rate environments.",
    },
  ],
  "dcf-valuation": [
    {
      q: "The 'discount rate' in DCF represents:",
      options: [
        "The company's revenue growth rate",
        "The investor's required rate of return",
        "The risk-free government bond rate",
        "The profit margin",
      ],
      correct: 1,
      explanation: "The discount rate (usually WACC) represents the minimum return an investor requires given the company's risk profile. Higher risk = higher discount rate = lower valuation.",
    },
    {
      q: "A 1% change in discount rate in a DCF model typically shifts the estimate by:",
      options: ["1–2%", "5–10%", "30–50%", "Over 100%"],
      correct: 2,
      explanation: "DCF models are extremely sensitive to the discount rate. A 1% change can shift the valuation 30–50%, which is why DCF should produce a range of values, not one number.",
    },
    {
      q: "The 'terminal value' in a DCF model represents:",
      options: [
        "The company's liquidation value",
        "Cash flows beyond the explicit forecast period",
        "The value if the company fails",
        "Current year free cash flow",
      ],
      correct: 1,
      explanation: "Terminal value captures the present value of all cash flows beyond the explicit forecast period (usually 10 years). It typically represents 60–80% of total DCF value.",
    },
  ],
  "options-101": [
    {
      q: "Buying a call option gives you the right to:",
      options: [
        "Sell shares at the strike price",
        "Buy shares at the strike price",
        "Receive dividends",
        "Borrow shares from the broker",
      ],
      correct: 1,
      explanation: "A call option gives the buyer the RIGHT (not obligation) to BUY shares at the strike price before expiry. The seller (writer) receives the premium and is obligated to sell.",
    },
    {
      q: "If you buy a call option and the stock never moves, you will:",
      options: [
        "Break even exactly",
        "Profit from the premium",
        "Lose the premium paid (time decay)",
        "Profit from the discount rate",
      ],
      correct: 2,
      explanation: "Options lose value every day due to theta (time decay). If the stock doesn't move, the option approaches zero at expiry. The buyer of an option is fighting time decay.",
    },
    {
      q: "In options trading, 'implied volatility' is:",
      options: [
        "The stock's historical price movement",
        "How much the option market expects future volatility",
        "The option's sensitivity to stock price changes",
        "The rate of time decay",
      ],
      correct: 1,
      explanation: "IV is the market's forecast of future volatility, implied by current option prices. High IV = expensive options (sellers benefit). Low IV = cheap options (buyers benefit).",
    },
  ],
  "short-selling": [
    {
      q: "The maximum theoretical loss on a short position is:",
      options: [
        "100% (your initial outlay)",
        "200%",
        "Unlimited",
        "The borrow fee",
      ],
      correct: 2,
      explanation: "A stock can theoretically rise infinitely — from $5 to $500 (like GameStop). A short seller is on the hook for the full rise, meaning losses are theoretically unlimited.",
    },
    {
      q: "A 'short squeeze' occurs when:",
      options: [
        "Short sellers profit massively",
        "A stock falls more than expected",
        "Short sellers are forced to buy, driving the price higher",
        "A company reports negative earnings",
      ],
      correct: 2,
      explanation: "In a squeeze, rising prices force short sellers to 'cover' (buy back shares). Their buying drives prices higher, forcing more covering — a vicious cycle. GameStop 2021 is the classic case.",
    },
    {
      q: "For defined-risk bearish exposure, professionals often prefer:",
      options: [
        "Short selling with no stop loss",
        "Buying put options",
        "Shorting with 10× leverage",
        "Selling call options",
      ],
      correct: 1,
      explanation: "Buying put options limits maximum loss to the premium paid, unlike short selling where losses are unlimited. This is the defined-risk bearish alternative.",
    },
  ],
  "emergency-fund": [
    { q: "Conventional financial wisdom suggests an emergency fund of:", options: ["1 week of expenses", "1-2 months of expenses", "3-6 months of expenses", "12 months of expenses"], correct: 2, explanation: "3-6 months covers most job loss scenarios while leaving capital to invest. Single-income households or freelancers should aim for 6+ months." },
    { q: "The best place to keep your emergency fund is:", options: ["Invested in equities for growth", "A high-yield easy-access savings account", "Cash under your mattress", "A fixed-term bond locked for 5 years"], correct: 1, explanation: "Easy-access savings accounts give you yield AND instant liquidity. Equities can fall 40% right when you need the money most." },
    { q: "Building an emergency fund should happen:", options: ["After paying off all debt", "Before any investing begins", "Simultaneously with investing", "Only when you have surplus income"], correct: 2, explanation: "A small emergency fund (£1,000) should come first — even before investing. Without it, every unexpected expense becomes new debt." },
  ],
  "fifty-thirty-twenty": [
    { q: "In the 50/30/20 framework, the '20' represents:", options: ["Entertainment budget", "Tax payments", "Savings and debt repayment", "Food and transport"], correct: 2, explanation: "20% goes toward savings, investments, and extra debt payments. This is wealth-building money — pay yourself first." },
    { q: "If your take-home pay is £3,000/month, your 'needs' budget is:", options: ["£300", "£600", "£1,500", "£2,400"], correct: 2, explanation: "50% of £3,000 = £1,500 for needs (rent, utilities, groceries, minimum debt payments). Needs are non-negotiable fixed costs." },
    { q: "The 50/30/20 rule was popularised by:", options: ["Warren Buffett", "Senator Elizabeth Warren", "Robert Kiyosaki", "Dave Ramsey"], correct: 1, explanation: "Elizabeth Warren introduced the 50/30/20 framework in her 2005 book 'All Your Worth.' It's deliberately simple — precise precision is less important than consistent execution." },
  ],
  "zero-based-budgeting": [
    { q: "In ZBB, 'zero-based' means:", options: ["You spend nothing", "Every pound is assigned before the month starts", "Your savings goal is zero", "You start from zero debt"], correct: 1, explanation: "Income minus all assignments = zero. Every pound has a destination: needs, wants, savings, or investments. Nothing sits unallocated." },
    { q: "The main advantage of ZBB over percentage budgets is:", options: ["It requires less work", "Forces conscious allocation of irregular income", "Automatically saves money", "Works best with stable income only"], correct: 1, explanation: "ZBB is particularly powerful for variable income — you plan each month fresh based on what you actually earned, making it ideal for freelancers and business owners." },
    { q: "What happens to a £200 surplus you didn't anticipate in a ZBB system?", options: ["It stays in your account untracked", "You must spend it immediately", "You assign it to a category before month-end", "It automatically rolls to next month"], correct: 2, explanation: "Every pound must be assigned. A windfall might go to emergency fund, investments, or a sinking fund — but it can't just sit as 'unassigned' cash." },
  ],
  "debt-avalanche": [
    { q: "The debt avalanche targets debts in order of:", options: ["Smallest balance first", "Highest balance first", "Highest interest rate first", "Oldest debt first"], correct: 2, explanation: "Avalanche = highest rate first. Mathematically optimal — you minimise total interest paid. vs Snowball (smallest balance first) which optimises for psychology." },
    { q: "You have: Card A (18% APR, £2,000), Card B (24% APR, £800), Loan (9% APR, £5,000). Avalanche order:", options: ["Loan → A → B", "B → A → Loan", "A → B → Loan", "Loan → B → A"], correct: 1, explanation: "Avalanche targets Card B (24%) first, then Card A (18%), then the loan (9%). Always highest rate regardless of balance size." },
    { q: "Compared to the debt snowball, the avalanche method typically:", options: ["Takes longer but feels better", "Saves more interest but provides fewer quick wins", "Is identical in total cost", "Is better for emotional motivation only"], correct: 1, explanation: "Avalanche saves more money in interest. Snowball provides faster wins (paying off small balances) but costs more total. Choose based on your psychology." },
  ],
  "index-funds": [
    { q: "A total market index fund's expense ratio is typically:", options: ["2-3%", "0.5-1%", "0.03-0.2%", "5%"], correct: 2, explanation: "Modern passive index funds charge 0.03-0.2% per year. Compare to actively managed funds at 1-2%+. That 1% difference compounds enormously over decades." },
    { q: "Over 15-year periods, what percentage of actively managed funds underperform their benchmark index?", options: ["25%", "50%", "70%", "92%"], correct: 3, explanation: "SPIVA data consistently shows ~92% of active funds underperform their index over 15 years after fees. This is why passive investing has grown so dramatically." },
    { q: "The Vanguard Total World ETF (VWRL) holds approximately how many stocks?", options: ["50", "500", "3,000", "9,000"], correct: 3, explanation: "VWRL holds ~9,000 stocks across 50+ countries — true global diversification in a single instrument. One buy, world exposure." },
  ],
  "bonds-basics": [
    { q: "When interest rates rise, existing bond prices:", options: ["Rise too", "Stay the same", "Fall", "Double"], correct: 2, explanation: "Inverse relationship: rising rates make new bonds more attractive (higher yield), so older lower-yield bonds must fall in price to compete. Duration determines the magnitude." },
    { q: "A bond with a face value of £1,000 and a coupon of 5% pays annually:", options: ["£5", "£50", "£500", "£1,050"], correct: 1, explanation: "Coupon = face value × coupon rate = £1,000 × 5% = £50 per year. At maturity, you also receive the £1,000 face value back." },
    { q: "In a traditional 60/40 portfolio, bonds serve to:", options: ["Maximise returns", "Reduce volatility and provide income", "Hedge against inflation", "Replace equities entirely"], correct: 1, explanation: "Bonds historically zig when equities zag. Their lower volatility and income cushion portfolio drawdowns. The correlation broke down in 2022 — worth understanding why." },
  ],
  "reits": [
    { q: "REITs are required by law to distribute at least __ of taxable income as dividends:", options: ["25%", "50%", "75%", "90%"], correct: 3, explanation: "REITs must distribute 90% of taxable income. This forces high yields and makes them income investments — but also limits reinvestment for growth." },
    { q: "The correct metric for valuing a REIT (NOT standard P/E) is:", options: ["Price-to-Earnings (P/E)", "Price-to-Book (P/B)", "Funds From Operations (FFO)", "EV/EBITDA"], correct: 2, explanation: "FFO (Funds From Operations) adds back real estate depreciation to net income. Depreciation is non-cash and doesn't reflect property value decline, so P/E understates REIT earnings." },
    { q: "Which type of REIT was most severely impacted by the COVID-19 pandemic?", options: ["Industrial REITs (warehouses)", "Data centre REITs", "Retail and office REITs", "Healthcare REITs"], correct: 2, explanation: "Retail and office REITs collapsed as tenants couldn't pay rent. Industrial and data centre REITs surged from e-commerce demand — REITs are very sensitive to their sub-sector." },
  ],
  "factor-investing": [
    { q: "The Fama-French five-factor model includes ALL of these except:", options: ["Market beta", "Value (HML)", "Momentum", "Profitability (RMW)"], correct: 2, explanation: "The five Fama-French factors are: market, size, value, profitability, and investment. Momentum is a Carhart fourth factor — powerful, but separate from the Fama-French model." },
    { q: "The 'value premium' means value stocks (low P/B) have historically:", options: ["Underperformed growth stocks", "Outperformed over the long run", "Had lower volatility than growth", "Behaved identically to growth"], correct: 1, explanation: "Value stocks (cheap relative to fundamentals) have historically outperformed growth over long periods. The premium exists partly because value stocks feel uncomfortable to hold." },
    { q: "A factor ETF typically costs more than a plain index fund because:", options: ["Factor ETFs are newer", "Active selection and rebalancing increases costs", "They hold fewer stocks", "Regulators require higher fees"], correct: 1, explanation: "Screening for factors (sorting by P/B, momentum, quality metrics) requires active rebalancing and creates higher turnover, increasing costs and potential tax drag." },
  ],
  "isa-strategy": [
    { q: "The annual ISA allowance for a UK adult in 2024/25 is:", options: ["£10,000", "£15,000", "£20,000", "£40,000"], correct: 2, explanation: "The ISA allowance is £20,000 per tax year (April to April). This is per person — a couple can shelter £40,000 per year. Unused allowance cannot be carried forward." },
    { q: "Which ISA type offers a 25% government bonus on contributions?", options: ["Stocks & Shares ISA", "Cash ISA", "Lifetime ISA (LISA)", "Innovative Finance ISA"], correct: 2, explanation: "The Lifetime ISA (LISA) gives a 25% government bonus on up to £4,000/year (max £1,000 bonus). But withdraw for non-property/non-retirement reasons and lose 25% — more than your bonus." },
    { q: "Capital gains within a Stocks & Shares ISA are:", options: ["Taxed at 18% for basic rate payers", "Taxed at 28%", "Completely tax-free", "Taxed only above £12,300"], correct: 2, explanation: "ISA wrappers are completely tax-free: no CGT, no income tax on dividends, no tax on interest. The ISA is the single most valuable tax planning tool available to UK retail investors." },
  ],
  "pension-basics": [
    { q: "If your employer matches 5% and you contribute 5%, the effective return on your contribution is:", options: ["0%", "5%", "50%", "100%"], correct: 3, explanation: "Your £100 becomes £200 (your £100 + employer's £100) instantly — a 100% return before any investment growth. No other investment guarantees this. Max your employer match first, always." },
    { q: "Tax relief on pension contributions for a higher-rate (40%) taxpayer means a £1,000 pension contribution actually costs:", options: ["£1,000", "£800", "£600", "£400"], correct: 2, explanation: "40% tax relief: a £1,000 gross contribution costs you only £600 net. The government pays £400 in tax relief. Basic rate (20%) taxpayers pay £800 for £1,000 of pension." },
    { q: "Under current UK rules, you can access your private pension from age:", options: ["55 (rising to 57 in 2028)", "60", "65", "State pension age"], correct: 0, explanation: "You can access defined contribution pensions from age 55, rising to 57 in 2028. Accessing a pension early (before minimum age) typically incurs a severe tax charge of 55%+." },
  ],
  "capital-gains-tax": [
    { q: "UK capital gains tax for a higher-rate taxpayer on share sales is currently:", options: ["10%", "18%", "24%", "40%"], correct: 2, explanation: "From October 2024, CGT on shares is 24% for higher/additional rate taxpayers. Basic rate payers pay 18%. Residential property gains are also 24% for higher rate (was 28%)." },
    { q: "The CGT annual exempt amount for 2024/25 is:", options: ["£12,300", "£6,000", "£3,000", "£1,500"], correct: 2, explanation: "The CGT annual exemption was slashed from £12,300 (2022/23) to £6,000 (2023/24) to £3,000 (2024/25+). This makes ISAs and pension wrappers more important than ever." },
    { q: "Spousal transfers of assets are CGT-exempt because:", options: ["HMRC allows £20,000 of transfers", "Transfers between spouses happen at no gain/no loss", "Both spouses share one allowance", "Marriage creates a trust structure"], correct: 1, explanation: "Transfers between UK-resident spouses are treated as no gain/no loss — CGT crystallises only when the receiving spouse eventually sells. This is a powerful household CGT planning tool." },
  ],
  "tax-loss-harvesting": [
    { q: "Tax-loss harvesting involves:", options: ["Delaying selling winners", "Selling losers to crystallise losses that offset gains", "Moving assets into an ISA after a loss", "Donating losing shares to charity"], correct: 1, explanation: "You sell a losing position to realise a capital loss, which offsets capital gains elsewhere. You can then buy back a similar (but not identical in some jurisdictions) position to maintain market exposure." },
    { q: "The 'wash sale' restriction (in the US) prevents:", options: ["Selling at a loss in December", "Buying back the identical security within 30 days", "Selling more than £3,000 in losses", "Harvesting losses inside an ISA"], correct: 1, explanation: "US wash sale rules disallow the loss if you buy back the same security within 30 days before or after. UK HMRC has a similar 30-day rule. Solution: buy a similar but different fund." },
    { q: "Tax-loss harvesting is most valuable when:", options: ["You have no capital gains", "You have realised large capital gains to offset", "Interest rates are rising", "You're in a basic rate tax bracket"], correct: 1, explanation: "Harvesting losses is only useful if you have gains to offset, or can use losses against future gains. The higher your marginal CGT rate, the more each £1 of loss is worth." },
  ],
  "credit-scores": [
    { q: "In the UK, the main credit reference agencies are:", options: ["FICO and VantageScore", "Experian, Equifax, and TransUnion", "Barclaycard and HSBC", "The Bank of England and FCA"], correct: 1, explanation: "UK credit data is held by Experian, Equifax, and TransUnion (formerly Callcredit). FICO is the dominant US scoring model. UK lenders use their own proprietary scores using CRA data." },
    { q: "Which factor typically has the LARGEST impact on your credit score?", options: ["Credit utilisation ratio", "Payment history", "Age of accounts", "Number of hard inquiries"], correct: 1, explanation: "Payment history (35% of FICO score) has the biggest impact. A single missed payment can persist on your file for 6 years in the UK. Set up direct debits for at least minimums, always." },
    { q: "Credit utilisation above __ typically starts damaging your score:", options: ["10%", "30%", "50%", "80%"], correct: 1, explanation: "Using more than 30% of your available credit is seen as a risk signal. Keeping utilisation under 30% (ideally under 10%) optimises your score. You can request a credit limit increase to lower utilisation without spending more." },
  ],
  "mortgage-basics": [
    { q: "Loan-to-Value (LTV) of 90% means:", options: ["You earn 90% of the property value annually", "You've borrowed 90% and put down 10% deposit", "The property has 90% occupancy", "You repay 90% over the mortgage term"], correct: 1, explanation: "LTV = loan / property value. 90% LTV = 10% deposit. Higher LTV = higher risk to lender = higher interest rate. Each 5% extra deposit typically unlocks a better rate tier." },
    { q: "On a repayment mortgage, in the early years most of your payment goes to:", options: ["Principal repayment", "Interest", "Fees and insurance", "Equal split of principal and interest"], correct: 1, explanation: "Amortisation front-loads interest. On a 25-year mortgage, the first payment might be 80%+ interest. This gradually shifts — by year 20, most goes to principal. Interest-only mortgages never reduce the debt." },
    { q: "The total cost of a £300,000 mortgage at 4.5% over 25 years vs 20 years:", options: ["Identical total cost", "25-year term costs roughly £30,000 more in interest", "20-year term costs more due to higher payments", "The difference is less than £5,000"], correct: 1, explanation: "A 25-year term has lower monthly payments but significantly more total interest. The 5 extra years of a large balance compounding at 4.5% adds ~£25-35k. Overpaying reduces this dramatically." },
  ],
  "insurance-basics": [
    { q: "The economic principle behind insurance is:", options: ["Speculation on risk", "Risk pooling across many people", "Guaranteed profit for insurers", "Government welfare provision"], correct: 1, explanation: "Insurance pools risk: many people pay small premiums so the few who suffer large losses are covered. Each individual trades a small certain cost (premium) for protection against a catastrophic uncertain cost." },
    { q: "Which insurance is typically considered most critical for working adults?", options: ["Pet insurance", "Income protection insurance", "Mobile phone insurance", "Travel insurance"], correct: 1, explanation: "Your ability to earn an income is your most valuable asset. Income protection covers 50-70% of salary if you can't work due to illness/injury. Far more important than insuring possessions." },
    { q: "Increasing the excess (deductible) on an insurance policy typically:", options: ["Increases the premium", "Has no effect on premium", "Reduces the premium", "Doubles the coverage"], correct: 2, explanation: "Higher excess = lower premium. You're taking on more of the small-loss risk yourself, so the insurer charges less. Optimal: set excess to the maximum you could comfortably self-fund." },
  ],
  "inflation": [
    { q: "The Bank of England's target inflation rate is:", options: ["0%", "2%", "5%", "10%"], correct: 1, explanation: "The Bank of England targets 2% CPI inflation. Low positive inflation encourages spending now (vs deflation which incentivises waiting). Below 1% triggers a letter to the Chancellor." },
    { q: "£10,000 in a savings account earning 1% during a period of 4% inflation:", options: ["Grows in real terms", "Stays the same in real terms", "Loses real purchasing power", "Doubles in 10 years"], correct: 2, explanation: "Real return = nominal return - inflation = 1% - 4% = -3%. Your £10,000 buys £300 less of goods each year in real terms. Inflation is the most insidious tax — it's silent." },
    { q: "Historically, the best inflation hedges include:", options: ["Long-duration government bonds", "Cash deposits", "Equities and real assets", "Fixed-rate mortgages as borrower"], correct: 2, explanation: "Equities represent ownership of businesses that can raise prices with inflation. Real assets (property, commodities, inflation-linked bonds) also protect. Nominal bonds and cash lose real value." },
  ],
  "interest-rates": [
    { q: "When the Bank of England raises the base rate, the IMMEDIATE effect on bond prices is:", options: ["They rise", "They fall", "They are unaffected", "They are only affected after 6 months"], correct: 1, explanation: "Rising rates = falling bond prices (inverse relationship). Duration determines sensitivity — a 30-year bond falls ~18% for a 1% rate rise. Short-duration bonds are more resilient." },
    { q: "Higher interest rates tend to affect which sector most negatively?", options: ["Energy companies", "Utility and real estate companies", "Defence contractors", "Healthcare companies"], correct: 1, explanation: "Utilities and REITs carry large debt loads and trade on dividend yield. Rising rates increase their borrowing costs AND make their yields look less attractive vs risk-free bonds — a double negative." },
    { q: "The Taylor Rule suggests central banks should raise rates when:", options: ["Unemployment is rising", "Inflation exceeds target AND/OR output gap is positive", "The government requests it", "Currency is depreciating"], correct: 1, explanation: "The Taylor Rule (roughly): rate = 2% + inflation gap + 0.5 × output gap. When inflation > target or economy is running hot, rates should rise. It's a guideline, not a mandate." },
  ],
  "yield-curve": [
    { q: "A yield curve inverts when:", options: ["Short-term rates exceed long-term rates", "Long-term rates exceed short-term rates", "All rates converge to zero", "The Fed raises rates"], correct: 0, explanation: "Inversion: 2-year yield > 10-year yield. This happens when markets expect future rate CUTS — meaning they expect the economy to weaken. Historically, every US recession was preceded by an inverted curve." },
    { q: "The 2s10s spread that most closely tracks recession probability is:", options: ["2-year minus 1-year", "10-year minus 2-year", "30-year minus 10-year", "Federal Funds Rate minus 10-year"], correct: 1, explanation: "The 2s10s (10-year minus 2-year Treasury yield) is the most-watched recession indicator. When negative (inverted), recession has historically followed within 6-18 months in the US." },
    { q: "A 'bear flattener' yield curve move describes:", options: ["Short rates fall faster than long rates", "Short rates rise faster than long rates", "Both short and long rates fall", "The entire curve shifts down"], correct: 1, explanation: "Bear flattener: short rates rise more than long rates, flattening the curve. Typically driven by central bank tightening. Often precedes inversion and signals late cycle." },
  ],
  "gdp-basics": [
    { q: "GDP can be measured as:", options: ["Income approach only", "Expenditure approach only", "Production, income, or expenditure approach — all give the same result", "Population × average salary"], correct: 2, explanation: "Three equivalent approaches: Output (sum of value added), Expenditure (C+I+G+NX), Income (wages+profits+rents). They must equal each other — national accounting identity." },
    { q: "Nominal GDP of £2.5 trillion with deflator of 105 gives real GDP of approximately:", options: ["£2.5 trillion", "£2.38 trillion", "£2.62 trillion", "£1.25 trillion"], correct: 1, explanation: "Real GDP = Nominal GDP / Price deflator × 100 = £2.5T / 105 × 100 ≈ £2.38T. Real GDP strips out inflation to show actual output growth." },
    { q: "GDP is a lagging indicator because:", options: ["It predicts future growth", "It reflects economic activity that has already occurred", "It adjusts in advance of market moves", "Central banks control it directly"], correct: 1, explanation: "GDP data is released months after the period measured, based on activity that already occurred. Leading indicators (PMI, yield curve, building permits) are more useful for anticipating turns." },
  ],
  "bitcoin-basics": [
    { q: "Bitcoin's maximum supply is capped at:", options: ["10 million", "21 million", "100 million", "Unlimited"], correct: 1, explanation: "21 million BTC is hard-coded into Bitcoin's protocol. ~19.7M are already mined (2024). This hard cap is the foundation of Bitcoin's 'digital scarcity' value proposition — unlike all fiat currencies." },
    { q: "A Bitcoin halving event (roughly every 4 years) reduces:", options: ["Transaction fees", "The block reward paid to miners by 50%", "The total supply by 50%", "Bitcoin's price by 50%"], correct: 1, explanation: "The halving cuts the new BTC issued per block in half — reducing inflation rate. Each halving historically preceded a bull market (correlation ≠ causation, but the supply shock is real)." },
    { q: "Bitcoin's proof-of-work consensus mechanism primarily prevents:", options: ["Price volatility", "Double-spending without a central authority", "Government seizure", "High transaction fees"], correct: 1, explanation: "Proof-of-work makes it computationally expensive to rewrite transaction history. Attacking the Bitcoin network would require >50% of global mining power — an 'honest' miner earns more by following rules." },
  ],
  "blockchain-basics": [
    { q: "A blockchain is 'immutable' because:", options: ["It's stored on government servers", "Altering one block requires recomputing all subsequent blocks and outpacing the honest network", "Transactions are encrypted", "It uses quantum computing"], correct: 1, explanation: "Each block contains the hash of the previous block. Change one block → change its hash → invalidate all subsequent blocks. An attacker must redo all that proof-of-work and outrun the rest of the network." },
    { q: "Proof-of-Stake (PoS) differs from Proof-of-Work (PoW) by:", options: ["Using less computation but requiring validators to stake crypto as collateral", "Being controlled by a central authority", "Using more energy than PoW", "Having no security model"], correct: 0, explanation: "PoS validators stake their own crypto as collateral (penalised/slashed for dishonest behaviour) rather than burning energy. Ethereum's switch to PoS ('The Merge', 2022) cut energy use 99.95%." },
    { q: "Smart contracts are best described as:", options: ["Digital signatures", "Self-executing code stored on-chain that runs automatically when conditions are met", "Legal contracts digitised as PDFs", "Insurance policies on crypto"], correct: 1, explanation: "Smart contracts are programs that execute automatically when predefined conditions are met — no intermediary needed. They enable DeFi, NFTs, DAOs, and stablecoins. Ethereum pioneered them." },
  ],
  "defi-basics": [
    { q: "An Automated Market Maker (AMM) like Uniswap sets prices using:", options: ["Order books like traditional exchanges", "A mathematical formula (e.g. x×y=k)", "Centrally managed pricing", "News feeds and sentiment analysis"], correct: 1, explanation: "AMMs use a constant product formula (x×y=k): as you buy token X, its price rises automatically as Y increases. No counterparty needed — you trade against a liquidity pool." },
    { q: "'Impermanent loss' in DeFi liquidity provision refers to:", options: ["Permanent theft of funds", "Loss vs simply holding, when pool assets diverge in price", "Smart contract bugs", "Transaction fees eating profits"], correct: 1, explanation: "If you provide BTC/ETH liquidity and BTC doubles vs ETH, the pool rebalances to hold more ETH and less BTC. You end up with less BTC than if you'd just held. The 'loss' vs holding is impermanent (unless you exit)." },
    { q: "The main risk unique to DeFi (vs traditional finance) is:", options: ["Market risk", "Inflation risk", "Smart contract vulnerabilities (exploits, rug pulls)", "Counterparty default"], correct: 2, explanation: "DeFi removes counterparty risk but introduces code risk. Smart contract bugs, exploits, and outright fraud (rug pulls) are unique to DeFi. Over $10B has been lost to DeFi exploits." },
  ],
  "stablecoins": [
    { q: "A fiat-backed stablecoin like USDC is backed by:", options: ["Algorithmic stabilisation", "USD reserves and Treasury bills held by the issuer", "Other cryptocurrencies", "Central bank guarantees"], correct: 1, explanation: "Fiat-backed stablecoins (USDC, USDT) are backed ~1:1 by USD cash and equivalents. They require trust in the issuer to hold reserves honestly and allow redemptions — centralisation risk." },
    { q: "TerraUSD (UST) lost its dollar peg in May 2022 because:", options: ["The US government banned it", "Its algorithmic stabilisation mechanism had a fatal reflexivity loop that caused collapse", "Reserves were stolen", "Regulators froze it"], correct: 1, explanation: "UST was 'algorithmic' — backed by LUNA, not real dollars. When confidence wavered, LUNA was minted to defend the peg, inflating supply, crashing LUNA's price, destroying the backing. A classic bank run." },
    { q: "The primary use case for stablecoins in practice is:", options: ["Long-term wealth storage", "Volatility speculation", "On-chain trading, DeFi, and cross-border payments without exiting to fiat", "Replacing government currency"], correct: 2, explanation: "Stablecoins are the backbone of on-chain activity: you hold USDC between trades, use it in DeFi, or send money cross-border without touching traditional banking rails. They're infrastructure, not investments." },
  ],
};

// ── localStorage helpers ──────────────────────────────────────────────────────

const PROGRESS_KEY = "nr-learn-progress";

function loadProgress(): string[] {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export function getLearnXP(): number {
  try {
    const ids = loadProgress();
    return ids.reduce((sum, id) => {
      const topic = TOPICS.find((t) => t.id === id);
      return sum + (topic?.xp ?? 0);
    }, 0);
  } catch { return 0; }
}

function saveProgress(ids: string[]): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(ids));
}

// ── Shared style helpers ──────────────────────────────────────────────────────

const DIFF_COLORS: Record<Difficulty, string> = {
  BEGINNER: "var(--ft-green)",
  INTERMEDIATE: "var(--ft-amber)",
  ADVANCED: "var(--ft-red)",
};

function DiffBadge({ level }: { level: Difficulty }) {
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: DIFF_COLORS[level], background: `${DIFF_COLORS[level]}18`, border: `1px solid ${DIFF_COLORS[level]}40`, padding: "1px 6px", letterSpacing: "0.08em" }}>
      {level}
    </span>
  );
}

function LsnSection({ label }: { label: string }) {
  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.12em", paddingBottom: 6, borderBottom: "1px solid var(--ft-border)", marginBottom: 12, marginTop: 22 }}>
      {label}
    </div>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-cyan)", background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.16)", padding: "8px 12px", margin: "10px 0", lineHeight: 1.8, whiteSpace: "pre-wrap" as const }}>
      {children}
    </div>
  );
}

function Takeaway({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", borderLeft: "3px solid var(--ft-amber)", padding: "10px 14px", fontSize: 12, color: "var(--ft-muted)", lineHeight: 1.6, marginTop: 20 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-amber)", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>KEY TAKEAWAY</span>
      {children}
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--ft-muted)", lineHeight: 1.7, marginBottom: 10 }}>{children}</div>;
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(88,166,255,0.06)", border: "1px solid rgba(88,166,255,0.2)", borderLeft: "3px solid var(--ft-blue)", padding: "10px 14px", fontSize: 12, color: "var(--ft-muted)", lineHeight: 1.6, margin: "12px 0" }}>
      {children}
    </div>
  );
}

// ── Calculator helpers ────────────────────────────────────────────────────────

function CalcField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginBottom: 4 }}>{label}</div>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ft-text)", background: "var(--ft-base)", border: "1px solid var(--ft-border2)", padding: "5px 8px", width: 110, outline: "none" }} />
    </div>
  );
}

function CalcResult({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ft-accent)", lineHeight: 1, padding: "6px 0" }}>{value}</div>
    </div>
  );
}

function CalcShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: 14, marginTop: 12 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.1em", marginBottom: 12 }}>{title}</div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" as const }}>{children}</div>
    </div>
  );
}

// ── Calculators ───────────────────────────────────────────────────────────────

function PECalculator() {
  const [price, setPrice] = useState("150");
  const [eps, setEps] = useState("6");
  const pe = parseFloat(price) > 0 && parseFloat(eps) > 0 ? (parseFloat(price) / parseFloat(eps)).toFixed(1) + "×" : "—";
  return (
    <CalcShell title="CALCULATOR — P/E RATIO">
      <CalcField label="Share price (£)" value={price} onChange={setPrice} />
      <CalcField label="EPS (£)" value={eps} onChange={setEps} />
      <CalcResult label="P/E RATIO" value={pe} />
    </CalcShell>
  );
}

function CompoundCalculator() {
  const [principal, setPrincipal] = useState("1000");
  const [rate, setRate] = useState("7");
  const [years, setYears] = useState("20");
  const result = (() => {
    const p = parseFloat(principal), r = parseFloat(rate) / 100, y = parseFloat(years);
    if (isNaN(p) || isNaN(r) || isNaN(y) || p <= 0 || y <= 0) return "—";
    return `£${(p * Math.pow(1 + r, y)).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
  })();
  return (
    <CalcShell title="CALCULATOR — COMPOUND GROWTH">
      <CalcField label="Principal (£)" value={principal} onChange={setPrincipal} />
      <CalcField label="Annual rate (%)" value={rate} onChange={setRate} />
      <CalcField label="Years" value={years} onChange={setYears} />
      <CalcResult label="FINAL VALUE" value={result} />
    </CalcShell>
  );
}

function RetirementCalculator() {
  const [monthly, setMonthly] = useState("2500");
  const annual = parseFloat(monthly) * 12;
  const nest = isNaN(annual) ? "—" : `£${(annual * 25).toLocaleString("en-GB")}`;
  return (
    <CalcShell title="CALCULATOR — FIRE NUMBER">
      <CalcField label="Monthly expenses (£)" value={monthly} onChange={setMonthly} />
      <CalcResult label="TARGET NEST EGG" value={nest} />
    </CalcShell>
  );
}

function EmergencyFundCalculator() {
  const [monthly, setMonthly] = useState("2000");
  const m = parseFloat(monthly);
  const min = isNaN(m) || m <= 0 ? "—" : `£${(m * 3).toLocaleString("en-GB")}`;
  const max = isNaN(m) || m <= 0 ? "—" : `£${(m * 6).toLocaleString("en-GB")}`;
  return (
    <CalcShell title="CALCULATOR — EMERGENCY FUND">
      <CalcField label="Monthly expenses (£)" value={monthly} onChange={setMonthly} />
      <CalcResult label="3-MONTH TARGET" value={min} />
      <CalcResult label="6-MONTH TARGET" value={max} />
    </CalcShell>
  );
}

function BudgetCalculator() {
  const [income, setIncome] = useState("3000");
  const m = parseFloat(income);
  const needs = isNaN(m) || m <= 0 ? "—" : `£${(m * 0.5).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
  const wants = isNaN(m) || m <= 0 ? "—" : `£${(m * 0.3).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
  const savings = isNaN(m) || m <= 0 ? "—" : `£${(m * 0.2).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
  return (
    <CalcShell title="CALCULATOR — 50/30/20 SPLIT">
      <CalcField label="Take-home pay (£/mo)" value={income} onChange={setIncome} />
      <CalcResult label="NEEDS (50%)" value={needs} />
      <CalcResult label="WANTS (30%)" value={wants} />
      <CalcResult label="SAVINGS (20%)" value={savings} />
    </CalcShell>
  );
}

function MortgageCalculator() {
  const [loan, setLoan] = useState("300000");
  const [rate, setRate] = useState("4.5");
  const [years, setYears] = useState("25");
  const result = (() => {
    const p = parseFloat(loan), r = parseFloat(rate) / 100 / 12, n = parseFloat(years) * 12;
    if ([p, r, n].some(isNaN) || p <= 0 || r <= 0 || n <= 0) return { monthly: "—", total: "—", interest: "—" };
    const monthly = (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const total = monthly * n;
    return {
      monthly: `£${monthly.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`,
      total: `£${total.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`,
      interest: `£${(total - p).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`,
    };
  })();
  return (
    <CalcShell title="CALCULATOR — MORTGAGE">
      <CalcField label="Loan amount (£)" value={loan} onChange={setLoan} />
      <CalcField label="Annual rate (%)" value={rate} onChange={setRate} />
      <CalcField label="Term (years)" value={years} onChange={setYears} />
      <CalcResult label="MONTHLY PAYMENT" value={result.monthly} />
      <CalcResult label="TOTAL INTEREST" value={result.interest} />
    </CalcShell>
  );
}

function InflationCalculator() {
  const [principal, setPrincipal] = useState("10000");
  const [inflRate, setInflRate] = useState("3");
  const [yrs, setYrs] = useState("10");
  const result = (() => {
    const p = parseFloat(principal), r = parseFloat(inflRate) / 100, y = parseFloat(yrs);
    if ([p, r, y].some(isNaN) || p <= 0 || y <= 0) return "—";
    return `£${(p / Math.pow(1 + r, y)).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
  })();
  return (
    <CalcShell title="CALCULATOR — REAL VALUE AFTER INFLATION">
      <CalcField label="Amount today (£)" value={principal} onChange={setPrincipal} />
      <CalcField label="Inflation rate (%)" value={inflRate} onChange={setInflRate} />
      <CalcField label="Years" value={yrs} onChange={setYrs} />
      <CalcResult label="REAL VALUE" value={result} />
    </CalcShell>
  );
}

function DCFCalculator() {
  const [revenue, setRevenue] = useState("100");
  const [growth, setGrowth] = useState("12");
  const [margin, setMargin] = useState("15");
  const [discount, setDiscount] = useState("10");
  const estimate = (() => {
    const r = parseFloat(revenue), g = parseFloat(growth) / 100, m = parseFloat(margin) / 100, d = parseFloat(discount) / 100;
    if ([r, g, m, d].some(isNaN) || d <= 0.02) return "—";
    let pv = 0, rev = r;
    for (let i = 1; i <= 10; i++) { rev *= 1 + g; pv += (rev * m) / Math.pow(1 + d, i); }
    const tv = (rev * m * 1.02) / (d - 0.02);
    pv += tv / Math.pow(1 + d, 10);
    return `£${pv.toLocaleString("en-GB", { maximumFractionDigits: 0 })}M`;
  })();
  return (
    <CalcShell title="CALCULATOR — SIMPLE DCF (£M)">
      <CalcField label="Revenue yr0 (£M)" value={revenue} onChange={setRevenue} />
      <CalcField label="Growth rate (%)" value={growth} onChange={setGrowth} />
      <CalcField label="FCF margin (%)" value={margin} onChange={setMargin} />
      <CalcField label="Discount rate (%)" value={discount} onChange={setDiscount} />
      <CalcResult label="DCF ESTIMATE" value={estimate} />
    </CalcShell>
  );
}

// ── Lesson steps ──────────────────────────────────────────────────────────────

function LessonStep({ id, step }: { id: string; step: number }) {
  switch (id) {
    case "compound-interest":
      if (step === 0) return (
        <>
          <LsnSection label="The core formula" />
          <Body>Compound interest means you earn returns not just on your original investment, but on all the returns you have previously earned. The money grows on itself — it snowballs.</Body>
          <Formula>{`A = P × (1 + r/n)^(n × t)\n\nP = principal    r = annual interest rate\nn = compounds/year   t = time in years`}</Formula>
          <Body>The key insight: with simple interest, you earn the same amount every year. With compound interest, you earn <em style={{ color: "var(--ft-text)" }}>more and more</em> each year as the base grows.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>WORKED EXAMPLE</strong><br />
            £1,000 at 7% simple interest: earns £70 every year → £2,400 after 20 years.<br />
            £1,000 at 7% compound interest: grows to £3,870 after 20 years — 61% more.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="What time actually does" />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px", lineHeight: 2.2, marginBottom: 10 }}>
            {[
              ["10 years", "£1,967", "+97%", "var(--ft-dim)"],
              ["20 years", "£3,870", "+287%", "var(--ft-blue)"],
              ["30 years", "£7,612", "+661%", "var(--ft-green)"],
              ["40 years", "£14,974", "+1,397%", "var(--ft-accent)"],
            ].map(([yr, val, pct, col]) => (
              <div key={yr} style={{ display: "flex", gap: 20 }}>
                <span style={{ color: "var(--ft-dim)", minWidth: 80 }}>{yr}</span>
                <span style={{ color: col as string, minWidth: 80, fontWeight: 700 }}>{val}</span>
                <span style={{ color: "var(--ft-muted)" }}>{pct}</span>
              </div>
            ))}
          </div>
          <Body>Notice the jump from year 30 to year 40 is almost as large as year 0 to year 30 combined. The acceleration keeps increasing — that is compound growth.</Body>
          <CompoundCalculator />
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="The snowball effect" />
          <Body>Warren Buffett famously called compound interest "the eighth wonder of the world." The Rule of 72 lets you estimate doubling time in your head:</Body>
          <Formula>{`Doubling time ≈ 72 ÷ annual interest rate\n\n6% → doubles every 12 years\n9% → doubles every 8 years\n12% → doubles every 6 years`}</Formula>
          <LsnSection label="Why starting matters more than the rate" />
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>AGE 25 vs AGE 35</strong><br />
            Alice invests £5,000/yr from age 25–35 (10 years), then stops → £602,000 at 65.<br />
            Bob invests £5,000/yr from age 35–65 (30 years) → £566,000 at 65.<br />
            Alice contributed £50,000 total. Bob contributed £150,000. Alice wins.
          </InfoBox>
          <Takeaway>Starting 10 years earlier beats investing 3× as much later. The most powerful investment decision you will ever make is to start today, not when you feel "ready."</Takeaway>
        </>
      );
      return null;

    case "diversification":
      if (step === 0) return (
        <>
          <LsnSection label="Correlation is the key concept" />
          <Body>Diversification doesn't just mean "owning different things." Two assets are only truly diversifying if they have low correlation — meaning they don't move together in the same direction at the same time.</Body>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "14px 0" }}>
            {[
              { label: "HIGH CORRELATION", color: "var(--ft-red)", bg: "rgba(248,81,73,0.06)", text: "UK banks + US banks — tend to fall together in credit crises. Little diversification benefit." },
              { label: "LOW CORRELATION", color: "var(--ft-green)", bg: "rgba(63,185,80,0.06)", text: "Equities + Government bonds — historically move opposite each other in risk-off events." },
            ].map((o) => (
              <div key={o.label} style={{ padding: "10px 12px", background: o.bg, border: `1px solid ${o.color}30` }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: o.color, marginBottom: 6 }}>{o.label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)", lineHeight: 1.6 }}>{o.text}</div>
              </div>
            ))}
          </div>
          <Body>Correlation is measured from −1 (perfectly opposite) to +1 (perfectly in sync). You want assets closer to 0 or negative correlation.</Body>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="The efficient frontier" />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-cyan)", background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.15)", padding: "12px 14px", lineHeight: 1.9, whiteSpace: "pre" as const, overflowX: "auto", marginBottom: 12 }}>
            {`Return ▲\n         ·  ·  ·  ← efficient frontier\n      ·           (best return per unit of risk)\n   ·\n  ·   ← dominated portfolios\n─────────────────────────────► Risk`}
          </div>
          <Body>The efficient frontier is the set of portfolios that offer the highest possible return for a given level of risk. Any portfolio below the line gives you the same return for more risk — irrational.</Body>
          <Body>Diversification moves your portfolio toward the efficient frontier by reducing risk without reducing expected return. It's a genuine free lunch.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>MODERN PORTFOLIO THEORY</strong><br />
            Harry Markowitz won the 1990 Nobel Prize in Economics for showing mathematically that combining risky assets can produce a portfolio with less risk than any individual component.
          </InfoBox>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="How many stocks?" />
          <Body>Research shows you can eliminate most company-specific (unsystematic) risk with just 20–30 uncorrelated stocks. Beyond ~30, the marginal benefit falls sharply.</Body>
          <LsnSection label="What you can't diversify away" />
          <Body>Systematic risk — recessions, interest rate changes, geopolitical events — affects all assets and cannot be reduced by adding more holdings. This is why markets compensate you for systematic risk (the equity risk premium) but not for company-specific risk you could have diversified away.</Body>
          <Takeaway>A global index fund (e.g. MSCI World) gives instant diversification across 1,600+ companies in 23 countries at near-zero cost. You don't need to pick stocks to be well-diversified.</Takeaway>
        </>
      );
      return null;

    case "dca":
      if (step === 0) return (
        <>
          <LsnSection label="What DCA is" />
          <Body>Dollar-Cost Averaging means investing a fixed amount of money at fixed time intervals — regardless of market conditions. The price doesn't matter; the schedule does.</Body>
          <Formula>Average cost per share = Total invested ÷ Total shares accumulated</Formula>
          <Body>Because you invest the same amount each time, you automatically buy <em style={{ color: "var(--ft-text)" }}>more shares when prices are low</em> and fewer when prices are high. No analysis required.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>VS LUMP SUM</strong><br />
            Research (Vanguard, 2012) shows lump sum investing outperforms DCA about 2/3 of the time, because markets trend upward. But DCA almost always beats <em>not investing at all</em>, and it's far easier to stick to psychologically.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="The psychology" />
          <Body>The biggest enemy of investment returns isn't market volatility — it's human emotion. Studies show individual investors chronically underperform the market by buying high (FOMO) and selling low (panic).</Body>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "12px 14px", lineHeight: 1.9, marginBottom: 12 }}>
            <div style={{ color: "var(--ft-red)", marginBottom: 6 }}>✗  EMOTIONAL INVESTOR</div>
            <div>Jan  Market up 40% → "I should buy!"   (bought high)</div>
            <div>Mar  Market down 35% → "I should sell!"  (sold low)</div>
            <div style={{ color: "var(--ft-green)", marginTop: 10, marginBottom: 6 }}>✓  DCA INVESTOR</div>
            <div>Jan  Buys £200 on the 1st. Always.</div>
            <div>Mar  Buys £200 on the 1st. Always.</div>
            <div>Dec  Buys £200 on the 1st. Always.</div>
          </div>
          <Body>DCA removes both decisions. You invest on autopilot. Crashes become opportunities because your fixed contribution buys more shares.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Worked example — £200/month over 6 months" />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px", lineHeight: 2, marginBottom: 10 }}>
            {[["Jan","£100/share","2.00 shares"],["Feb","£120/share","1.67 shares"],["Mar","£80/share","2.50 shares"],["Apr","£90/share","2.22 shares"],["May","£110/share","1.82 shares"],["Jun","£95/share","2.11 shares"],["","",""],["Total","£1,200 invested","12.32 shares"]].map(([m,p,s], i) => (
              i === 7
                ? <div key={m} style={{ borderTop: "1px solid var(--ft-border)", marginTop: 4, paddingTop: 4, display: "flex", gap: 16 }}>
                    <span style={{ color: "var(--ft-dim)", minWidth: 46 }}>{m}</span>
                    <span style={{ color: "var(--ft-muted)", minWidth: 100 }}>{p}</span>
                    <span style={{ color: "var(--ft-accent)", fontWeight: 700 }}>{s}</span>
                  </div>
                : i === 6 ? null
                : <div key={m} style={{ display: "flex", gap: 16 }}>
                    <span style={{ color: "var(--ft-dim)", minWidth: 46 }}>{m}</span>
                    <span style={{ color: "var(--ft-muted)", minWidth: 100 }}>{p}</span>
                    <span style={{ color: "var(--ft-green)" }}>{s}</span>
                  </div>
            ))}
          </div>
          <Body>Average cost: £1,200 ÷ 12.32 = <strong style={{ color: "var(--ft-text)" }}>£97.40</strong>. Simple average of monthly prices: £99.17. DCA cost is lower because you automatically bought more at £80 and £90.</Body>
          <Takeaway>Set up an automatic monthly investment into a global index fund. Never check the price before it executes. This single habit, maintained for 20+ years, underpins most successful retail portfolios.</Takeaway>
        </>
      );
      return null;

    case "four-percent-rule":
      if (step === 0) return (
        <>
          <LsnSection label="The Trinity Study" />
          <Body>In 1998, Philip Cooley, Carl Hubbard, and Daniel Walz at Trinity University analysed every 30-year rolling period since 1926, asking: "What withdrawal rate would have never depleted a portfolio?"</Body>
          <Body>Their finding: <strong style={{ color: "var(--ft-text)" }}>a 4% initial withdrawal rate, adjusted for inflation annually, had near-100% historical success</strong> over 30-year periods — through crashes, wars, stagflation, and everything in between.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>THE MECHANISM</strong><br />
            Year 1: Withdraw 4% of portfolio. If portfolio = £1,000,000 → withdraw £40,000.<br />
            Year 2: Withdraw last year's amount + inflation. E.g. £40,000 × 1.03 = £41,200.<br />
            Years 3+: Same formula. The withdrawal amount grows with inflation forever.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Calculating your FIRE number" />
          <Body>The 4% rule implies a simple equation: your target portfolio is 25× your annual expenses. (25 = 1 ÷ 0.04)</Body>
          <Formula>FIRE Number = Annual Expenses × 25</Formula>
          <RetirementCalculator />
          <LsnSection label="Every pound saved matters more than you think" />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px", lineHeight: 2, marginBottom: 10 }}>
            {[
              ["Cut £100/month spend", "→ Need £30,000 less"],
              ["Cut £500/month spend", "→ Need £150,000 less"],
              ["Cut £1,000/month spend", "→ Need £300,000 less"],
            ].map(([cut, result]) => (
              <div key={cut} style={{ display: "flex", gap: 16 }}>
                <span style={{ color: "var(--ft-green)", minWidth: 200 }}>{cut}</span>
                <span style={{ color: "var(--ft-text)" }}>{result}</span>
              </div>
            ))}
          </div>
          <Body>Every pound you reduce from annual expenses cuts your FIRE target by 25×. Frugality is a superpower in this framework.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Caveats and refinements" />
          <Body>The 4% rule has limits to understand:</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "12px 0" }}>
            {[
              { label: "US-centric data", text: "The study used US market data. Other markets may have lower returns. A globally diversified portfolio may be safer." },
              { label: "30-year horizon", text: "For 40–50 year retirements (early retirees), many researchers recommend 3–3.5% to be safe." },
              { label: "Sequence-of-returns risk", text: "A major crash in years 1–5 of retirement is far more damaging than one later, because you're selling shares into a down market to fund withdrawals." },
              { label: "It's not 'safe'", text: "There were historical scenarios where 4% failed. It had ~90–95% success rates, not 100%. Consider it a starting point, not a guarantee." },
            ].map(({ label, text }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-amber)", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)", lineHeight: 1.5 }}>{text}</div>
              </div>
            ))}
          </div>
          <Takeaway>Financial independence = 25× annual expenses. Track your savings rate religiously — it's the single biggest lever. Work becomes optional when you hit your number.</Takeaway>
        </>
      );
      return null;

    case "pe-ratio":
      if (step === 0) return (
        <>
          <LsnSection label="What the P/E ratio measures" />
          <Body>The Price-to-Earnings ratio answers a simple question: <em style={{ color: "var(--ft-text)" }}>how many pounds are investors willing to pay for each pound of annual profit?</em></Body>
          <Formula>P/E = Share Price ÷ Earnings Per Share (EPS)</Formula>
          <Body>A P/E of 20× means you're paying £20 today for £1 of annual earnings. It takes 20 years of earnings (at current rate) to "pay back" the price — though growth changes that math.</Body>
          <PECalculator />
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>TWO TYPES OF P/E</strong><br />
            <strong>Trailing P/E:</strong> Uses the last 12 months of actual earnings. Backward-looking and factual.<br />
            <strong>Forward P/E:</strong> Uses analyst forecasts for next 12 months. More relevant but based on estimates that can be wrong.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="What different P/Es mean" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { range: "Below 10×", interp: "Deep value or distressed — could be a bargain or a value trap", color: "var(--ft-green)" },
              { range: "10–18×", interp: "Generally reasonable; near the S&P 500 long-run average", color: "var(--ft-muted)" },
              { range: "18–30×", interp: "Growth premium — market expects above-average earnings growth", color: "var(--ft-amber)" },
              { range: "Above 30×", interp: "High growth expectations — or speculative bubble territory", color: "var(--ft-red)" },
            ].map(({ range, interp, color }) => (
              <div key={range} style={{ display: "flex", gap: 12, background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 12px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color, fontWeight: 700, minWidth: 80, flexShrink: 0 }}>{range}</span>
                <span style={{ fontSize: 12, color: "var(--ft-muted)" }}>{interp}</span>
              </div>
            ))}
          </div>
          <Body>These are rough guides only. The S&P 500's long-run average P/E is ~16–18×, but it trades well above this during low-interest-rate environments and technology booms.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Sector context is everything" />
          <Body>Never compare P/Es across sectors. Utilities and banks trade at low multiples because they grow slowly. Technology companies command higher multiples because investors are paying for future growth.</Body>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px", lineHeight: 2, marginBottom: 10 }}>
            {[
              ["Utilities", "10–16×", "Slow, regulated growth"],
              ["Financials", "8–14×", "Capital-intensive, cyclical"],
              ["Consumer staples", "18–24×", "Stable earnings, brand moats"],
              ["Technology", "25–40×", "High growth expectations"],
              ["Biotech", "∞ / negative", "Pre-revenue or loss-making"],
            ].map(([sector, range, note]) => (
              <div key={sector} style={{ display: "flex", gap: 16 }}>
                <span style={{ color: "var(--ft-dim)", minWidth: 140 }}>{sector}</span>
                <span style={{ color: "var(--ft-accent)", minWidth: 80 }}>{range}</span>
                <span style={{ color: "var(--ft-muted)" }}>{note}</span>
              </div>
            ))}
          </div>
          <Takeaway>A stock's P/E is only meaningful relative to its peers and its own history. A 30× P/E is ordinary in tech and alarming in industrials. Always ask: "what growth is baked in, and is that realistic?"</Takeaway>
        </>
      );
      return null;

    case "dcf-valuation":
      if (step === 0) return (
        <>
          <LsnSection label="The time value of money" />
          <Body>£100 today is worth more than £100 in 10 years. Why? Because you could invest £100 today and have more than £100 in 10 years. DCF formalises this: it converts all future cash flows into their equivalent value <em style={{ color: "var(--ft-text)" }}>today</em>.</Body>
          <Formula>{`Present Value = Future Cash Flow ÷ (1 + r)^n\n\nr = discount rate (required return)\nn = years until cash flow arrives`}</Formula>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>SIMPLE EXAMPLE</strong><br />
            A company will pay you £1,000 in 5 years. Your required return is 8%/yr.<br />
            Present Value = £1,000 ÷ 1.08^5 = <strong>£680.58</strong> today.<br />
            That's what you should pay maximum for this promise.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Building the DCF model" />
          <Body>A full DCF model adds up the present value of all future free cash flows (FCF) plus a "terminal value" that captures everything beyond the forecast period:</Body>
          <Formula>{`Value = Σ [FCF_n ÷ (1+r)^n] + Terminal Value / (1+r)^N\n\nTerminal Value = FCF_N × (1+g) ÷ (r − g)\nr = discount rate · g = terminal growth rate`}</Formula>
          <DCFCalculator />
          <Body>Note how sensitive the output is to small changes in the discount rate or terminal growth rate. This is normal — try adjusting by 1% and see the shift.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Why it's an art, not a science" />
          <Body>A 1% change in the discount rate can shift the DCF estimate by 30–50%. Small changes in long-term growth assumptions produce massive valuation swings. This is why DCF should produce a <em style={{ color: "var(--ft-text)" }}>range of values</em>, not a single price.</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "Bull case", note: "9% discount, 12% growth", range: "High estimate" },
              { label: "Base case", note: "10% discount, 8% growth", range: "Central estimate" },
              { label: "Bear case", note: "12% discount, 4% growth", range: "Low estimate" },
            ].map(({ label, note, range }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 12px", display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 11, color: "var(--ft-dim)" }}>{note}</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--ft-muted)", alignSelf: "center" }}>{range}</div>
              </div>
            ))}
          </div>
          <Takeaway>The value of a DCF model is not the number it outputs — it's the questions it forces you to ask. If today's stock price implies 20% growth for 10 years, is that realistic? That's the useful question.</Takeaway>
        </>
      );
      return null;

    case "options-101":
      if (step === 0) return (
        <>
          <LsnSection label="Calls and puts" />
          <Body>An option gives you the <strong style={{ color: "var(--ft-text)" }}>right, but not the obligation</strong>, to buy (call) or sell (put) an asset at a fixed price (strike) before or on a set date (expiry). You pay a premium for this right. The seller receives the premium and takes on the obligation.</Body>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "14px 0" }}>
            {[
              { label: "CALL OPTION", color: "var(--ft-green)", bg: "rgba(63,185,80,0.06)", text: "Right to BUY at strike. Profits if price rises above (strike + premium). Maximum loss: premium paid." },
              { label: "PUT OPTION", color: "var(--ft-red)", bg: "rgba(248,81,73,0.06)", text: "Right to SELL at strike. Profits if price falls below (strike − premium). Works like insurance on a stock." },
            ].map((o) => (
              <div key={o.label} style={{ padding: "10px 12px", background: o.bg, border: `1px solid ${o.color}30` }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: o.color, marginBottom: 6 }}>{o.label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)", lineHeight: 1.6 }}>{o.text}</div>
              </div>
            ))}
          </div>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>KEY TERMS</strong><br />
            <strong>Strike price:</strong> The fixed price at which you can buy/sell.<br />
            <strong>Expiry:</strong> The date the option expires (worthless if not exercised).<br />
            <strong>Premium:</strong> The price you pay for the option contract.<br />
            <strong>In the money (ITM):</strong> The option has intrinsic value right now.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="The Greeks — sensitivity measures" />
          {[["Delta (Δ)", "Rate of change in option price per £1 move in the underlying. Call = 0 to +1. Put = −1 to 0."],["Gamma (Γ)","Rate of change of Delta itself. High gamma = option value accelerates as it moves ITM."],["Theta (Θ)","Time decay — how much value the option loses each day. Time is always working against buyers."],["Vega (ν)","Sensitivity to implied volatility. Options get expensive when IV spikes (fear events)."],["Rho (ρ)","Sensitivity to interest rate changes. Mainly relevant for long-dated options."]].map(([name, def]) => (
            <div key={name} style={{ display: "flex", gap: 12, fontSize: 12, marginBottom: 10, lineHeight: 1.5, background: "var(--ft-raised)", padding: "8px 10px", border: "1px solid var(--ft-border)" }}>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--ft-accent)", fontWeight: 700, minWidth: 90, flexShrink: 0 }}>{name}</span>
              <span style={{ color: "var(--ft-muted)" }}>{def}</span>
            </div>
          ))}
          <Body>Most retail option buyers need to understand Delta (how much will this option move with the stock?) and Theta (how fast am I losing value to time decay?).</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Black-Scholes in plain English" />
          <Body>The Black-Scholes model (1973, Nobel Prize 1997) provides a formula to price European options from five inputs:</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              ["Stock price (S)", "Current price of the underlying"],
              ["Strike price (K)", "The fixed price in the contract"],
              ["Time to expiry (T)", "In years — more time = more valuable"],
              ["Risk-free rate (r)", "Government bond yield"],
              ["Implied volatility (σ)", "Market's forecast of future movement"],
            ].map(([input, desc]) => (
              <div key={input} style={{ display: "flex", gap: 10, background: "var(--ft-raised)", padding: "6px 10px", border: "1px solid var(--ft-border)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-cyan)", minWidth: 160, flexShrink: 0 }}>{input}</span>
                <span style={{ fontSize: 12, color: "var(--ft-muted)" }}>{desc}</span>
              </div>
            ))}
          </div>
          <Body>The most important input traders focus on is <strong style={{ color: "var(--ft-text)" }}>implied volatility (IV)</strong>. High IV = expensive options. Experienced traders sell options when IV is high and buy when IV is low.</Body>
          <Takeaway>For buyers: maximum loss is always the premium paid. For sellers: premium is collected upfront but potential loss is large. Options are precision instruments — learn them before trading them.</Takeaway>
        </>
      );
      return null;

    case "short-selling":
      if (step === 0) return (
        <>
          <LsnSection label="How it works — step by step" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              ["Step 1", "Borrow shares from a broker (and pay an ongoing borrow fee)."],
              ["Step 2", "Immediately sell those borrowed shares at the current market price."],
              ["Step 3", "Wait — hoping the price falls."],
              ["Step 4", "Buy the shares back at the lower price (covering the short)."],
              ["Step 5", "Return the shares to the broker. Profit = (sell price − buy price − fees)."],
            ].map(([step, desc]) => (
              <div key={step} style={{ display: "flex", gap: 12, background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 12px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)", minWidth: 55, flexShrink: 0 }}>{step}</span>
                <span style={{ fontSize: 12, color: "var(--ft-muted)", lineHeight: 1.5 }}>{desc}</span>
              </div>
            ))}
          </div>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>EXAMPLE</strong><br />
            Borrow and sell 100 shares at £50 each = £5,000 received.<br />
            Price falls to £30. Buy 100 shares back = £3,000 paid.<br />
            Profit: £5,000 − £3,000 − fees = ~£1,900.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="The asymmetric risk profile" />
          <Body>Short selling has a fundamentally different risk profile from buying stocks:</Body>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "14px 0" }}>
            {[
              { label: "BUYING STOCK (LONG)", color: "var(--ft-green)", bg: "rgba(63,185,80,0.06)", text: "Maximum loss: 100% (stock falls to zero). Maximum gain: unlimited (stock rises indefinitely). Time is on your side." },
              { label: "SHORT SELLING", color: "var(--ft-red)", bg: "rgba(248,81,73,0.06)", text: "Maximum gain: 100% (stock falls to zero). Maximum loss: UNLIMITED (stock can rise forever). Plus you pay borrow fees daily." },
            ].map((o) => (
              <div key={o.label} style={{ padding: "10px 12px", background: o.bg, border: `1px solid ${o.color}30` }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: o.color, marginBottom: 6 }}>{o.label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)", lineHeight: 1.6 }}>{o.text}</div>
              </div>
            ))}
          </div>
          <Body>This asymmetry is the central danger of short selling. A long investor sleeps through a 20% drop. A short investor is margin-called and potentially forced to cover at exactly the wrong time.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="The GameStop short squeeze — 2021" />
          <Body>GameStop was over 140% short-sold (meaning the same shares were lent multiple times, legally). Reddit's WallStreetBets community co-ordinated massive buying.</Body>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px", lineHeight: 2, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 16 }}>
              <span style={{ color: "var(--ft-dim)", minWidth: 100 }}>Jan 12, 2021</span>
              <span style={{ color: "var(--ft-muted)" }}>GME: $20</span>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <span style={{ color: "var(--ft-dim)", minWidth: 100 }}>Jan 27, 2021</span>
              <span style={{ color: "var(--ft-accent)", fontWeight: 700 }}>GME: $483 (peak)</span>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <span style={{ color: "var(--ft-dim)", minWidth: 100 }}>Melvin Capital</span>
              <span style={{ color: "var(--ft-red)" }}>Lost ~53% in January alone</span>
            </div>
          </div>
          <Body>Short sellers scrambling to cover (buy back shares) pushed the price higher, forcing more covering — a vicious feedback loop. The squeeze cost short sellers billions.</Body>
          <Takeaway>If you want defined-risk bearish exposure, buy put options — maximum loss is the premium. Short selling has unlimited theoretical downside and can be squeezed by coordinated buying at any time.</Takeaway>
        </>
      );
      return null;

    case "emergency-fund":
      if (step === 0) return (
        <>
          <LsnSection label="Why 3-6 months?" />
          <Body>An emergency fund is liquid cash held outside your investment portfolio — instantly accessible, zero market risk. Its purpose is to prevent you from being forced to sell investments at the worst possible time: during a downturn that triggered the very expense you're trying to cover.</Body>
          <Body>The 3-6 month range is calibrated against the average UK job search time. Single-income households, freelancers, and those in volatile industries should skew toward 6 months. Dual-income households with stable employment can get away with 3.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>WHAT COUNTS AS AN EXPENSE</strong><br />
            Include: rent/mortgage, utilities, food, transport, minimum debt payments, insurance.<br />
            Exclude: discretionary spending, subscriptions, savings contributions — you'd cut these immediately in a crisis.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Where to keep it" />
          <Body>The emergency fund must satisfy two competing requirements: it must earn a real return (beating or matching inflation), and it must be accessible in 24-48 hours without penalty. This rules out equities (volatility) and fixed-term bonds (lockup).</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "High-yield easy-access ISA", color: "var(--ft-green)", text: "Best option: tax-free interest, next-day access, competitive rates." },
              { label: "High-yield savings account", color: "var(--ft-green)", text: "Good option: competitive rates, instant access, no tax shelter." },
              { label: "Current account", color: "var(--ft-amber)", text: "Acceptable for 1-month buffer. Rates too low for the full fund." },
              { label: "Equities / ISA invested", color: "var(--ft-red)", text: "Wrong: could be down 40% the day you need it." },
            ].map(({ label, color, text }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: `1px solid ${color}30`, padding: "8px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)" }}>{text}</div>
              </div>
            ))}
          </div>
          <EmergencyFundCalculator />
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Building yours" />
          <Body>If you're starting from zero, the goal isn't to build the full fund before doing anything else — it's to get to a small buffer (£500-1,000) as fast as possible, then split contributions between investing and building the full fund.</Body>
          <Formula>{`Phase 1: £0 → £1,000  (blitz all surplus income here first)\nPhase 2: £1,000 → 3-month fund  (50% emergency / 50% invest)\nPhase 3: At 3 months, reassess — extend to 6 if appropriate`}</Formula>
          <Takeaway>The emergency fund isn't a savings goal — it's infrastructure. Without it, every unexpected expense creates debt or forces you to liquidate investments at a loss. Fund it first, then invest everything else.</Takeaway>
        </>
      );
      return null;

    case "fifty-thirty-twenty":
      if (step === 0) return (
        <>
          <LsnSection label="The three buckets" />
          <Body>The 50/30/20 framework divides take-home pay into three categories: 50% for needs (non-negotiable fixed costs), 30% for wants (discretionary spending), and 20% for savings and debt repayment. The power is in its simplicity — there are only three numbers to track.</Body>
          <Formula>{`Needs (50%)   = rent, utilities, groceries, insurance, minimum payments\nWants (30%)  = restaurants, subscriptions, entertainment, clothing\nSavings (20%) = emergency fund, investments, extra debt payments`}</Formula>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>USE TAKE-HOME, NOT GROSS</strong><br />
            Always apply the percentages to your net income (after tax and NI). Gross income includes tax you never actually receive — budgeting on it creates a systematic shortfall.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Applying it" />
          <BudgetCalculator />
          <div style={{ marginTop: 12 }}><Body>The framework is descriptive before it's prescriptive — track your current spending for one month first and see where you actually land. Most people find their "wants" category is significantly larger than 30%.</Body></div>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>COMMON REASSIGNMENTS</strong><br />
            Gym membership → needs (if used regularly) or wants (if aspirational).<br />
            Dining out → wants. Buying lunch at work every day → arguably needs for some roles.<br />
            Netflix/Spotify → wants. Label honestly — precision matters more than perfection.
          </InfoBox>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Adjusting for your situation" />
          <Body>The 50/30/20 rule is a starting framework, not a law. High-cost-of-living cities (London) may see needs consume 60-65% — in that case, compress wants to 20% and hold savings at 15-20%.</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "High-debt phase", text: "Redirect 'wants' money to debt: 50/20/30 (needs/wants/savings+debt)" },
              { label: "London / high CoL", text: "Accept 55-60% needs; protect the 20% savings rate above all else" },
              { label: "FIRE / high earner", text: "Push savings to 40-50%; compress both needs and wants aggressively" },
              { label: "New grad / low income", text: "Start with any savings rate > 0. Even 5% builds the habit." },
            ].map(({ label, text }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)" }}>{text}</div>
              </div>
            ))}
          </div>
          <Takeaway>The 50/30/20 rule gives you a starting point and a language for talking about money. The specific percentages matter less than the habit of allocating deliberately rather than spending and hoping something's left over.</Takeaway>
        </>
      );
      return null;

    case "zero-based-budgeting":
      if (step === 0) return (
        <>
          <LsnSection label="The core principle" />
          <Body>Zero-based budgeting requires that income minus all budget assignments equals exactly zero before the month begins. Every pound has a named destination: a specific category, savings goal, or investment. There is no "miscellaneous" and no "leftover."</Body>
          <Formula>{`Income − Σ(all assignments) = 0\n\nIf positive: assign the surplus to a category NOW\nIf negative: reduce category allocations until balanced`}</Formula>
          <Body>This is fundamentally different from tracking spending after the fact. ZBB is prospective — you decide where the money goes before it arrives, not after it's gone.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>SINKING FUNDS</strong><br />
            ZBB introduces sinking funds — monthly contributions toward irregular future expenses. Car insurance due in 6 months? Divide by 6 and assign that amount monthly. When the bill arrives, the money exists.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Building the budget" />
          <Body>Start with last month's actual spending as your category baseline. List every recurring expense, then every irregular one (annual fees, holidays, car servicing). Add savings goals and investment contributions. Sum everything. If it exceeds income, cut wants categories.</Body>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px", lineHeight: 2, marginBottom: 10 }}>
            {[["Rent","£1,200"],["Groceries","£280"],["Transport","£120"],["Utilities","£95"],["Emergency fund","£150"],["S&S ISA","£300"],["Dining out","£120"],["Entertainment","£80"],["Car insurance sinking","£50"],["Holiday sinking","£100"],["—","—"],["TOTAL","£2,495 = income"]].map(([cat, amt], i) => (
              i === 10 ? null :
              i === 11 ? <div key={cat} style={{ borderTop: "1px solid var(--ft-border)", marginTop: 4, paddingTop: 4, display: "flex", gap: 20 }}><span style={{ color: "var(--ft-dim)", flex: 1 }}>{cat}</span><span style={{ color: "var(--ft-accent)", fontWeight: 700 }}>{amt}</span></div> :
              <div key={cat} style={{ display: "flex", gap: 20 }}><span style={{ color: "var(--ft-dim)", flex: 1 }}>{cat}</span><span style={{ color: "var(--ft-muted)" }}>{amt}</span></div>
            ))}
          </div>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="The monthly reset" />
          <Body>Every month is a new zero-based budget. Last month's allocations are a template, not a guarantee. December looks nothing like August — ZBB forces you to confront seasonality explicitly rather than letting unexpected expenses blow up your plan.</Body>
          <Body>Mid-month overspending in one category must be offset immediately: either pull from a wants category or accept a reduced sinking fund contribution. The constraint is real-time, not retrospective.</Body>
          <Takeaway>ZBB is the most intensive budgeting method but also the most powerful for variable income earners. The monthly planning session — typically 30-60 minutes — is an investment in financial clarity. You stop wondering where the money went because you already decided.</Takeaway>
        </>
      );
      return null;

    case "debt-avalanche":
      if (step === 0) return (
        <>
          <LsnSection label="Avalanche vs snowball" />
          <Body>Two competing debt elimination strategies: the avalanche (mathematically optimal) and the snowball (psychologically optimal). Both involve making minimum payments on all debts, then directing all surplus cash to a single target debt.</Body>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "14px 0" }}>
            {[
              { label: "AVALANCHE", color: "var(--ft-blue)", bg: "rgba(88,166,255,0.06)", text: "Target the highest interest rate debt first. Minimises total interest paid. Mathematically optimal. Slower to see wins on large balances." },
              { label: "SNOWBALL", color: "var(--ft-green)", bg: "rgba(63,185,80,0.06)", text: "Target the smallest balance first. More quick wins. Builds momentum. Costs more in total interest vs avalanche." },
            ].map((o) => (
              <div key={o.label} style={{ padding: "10px 12px", background: o.bg, border: `1px solid ${o.color}30` }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: o.color, marginBottom: 6 }}>{o.label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)", lineHeight: 1.6 }}>{o.text}</div>
              </div>
            ))}
          </div>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>WHICH TO CHOOSE</strong><br />
            If you trust your own discipline, avalanche saves money. If you've tried and failed to pay off debt before, snowball's quick wins may keep you on track. The best method is the one you'll actually stick to.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Building your stack" />
          <Body>List all debts with their balance, minimum payment, and APR. Sort by APR descending. Direct every spare pound to the top item while paying minimums on everything else.</Body>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px", lineHeight: 2, marginBottom: 10 }}>
            {[["1 (target)","Store card","£800","29.9% APR","var(--ft-red)"],["2","Credit card","£2,400","21.9% APR","var(--ft-amber)"],["3","Personal loan","£6,000","9.9% APR","var(--ft-muted)"],["4","Student loan","£24,000","RPI+2.75%","var(--ft-dim)"]].map(([rank, type, bal, apr, color]) => (
              <div key={rank} style={{ display: "flex", gap: 14 }}>
                <span style={{ color: "var(--ft-dim)", minWidth: 80 }}>{rank}</span>
                <span style={{ color: "var(--ft-muted)", minWidth: 100 }}>{type}</span>
                <span style={{ color: "var(--ft-muted)", minWidth: 60 }}>{bal}</span>
                <span style={{ color: color as string }}>{apr}</span>
              </div>
            ))}
          </div>
          <Body>When the store card is paid off, redirect its former minimum payment plus your surplus to the credit card. The "freed minimum" accelerates subsequent debts — the avalanche gains speed as it descends.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Staying motivated" />
          <Body>The avalanche's weakness is that paying off a £6,000 loan before a £800 card can feel disheartening. The monthly progress is real but invisible as a milestone. Reframe the win: calculate total interest saved and track that number, not just the balance remaining.</Body>
          <Formula>{`Interest saved = (original APR × original balance × time) − (accelerated payoff interest)\n\nA 29.9% APR on £800 paid off 18 months early saves ~£360 in interest`}</Formula>
          <Takeaway>The avalanche always beats the snowball in total cost. The difference is smallest when balances are similar; it widens dramatically when a high-APR debt has a large balance. Run the numbers for your specific situation before choosing.</Takeaway>
        </>
      );
      return null;

    case "index-funds":
      if (step === 0) return (
        <>
          <LsnSection label="What is an index?" />
          <Body>A market index is a rules-based list of securities representing a market segment. The FTSE 100 contains the 100 largest UK companies by market capitalisation. The S&P 500 contains 500 large US companies. Indices are not investments — they're benchmarks.</Body>
          <Body>An index fund is a portfolio constructed to track an index as closely as possible. When you buy an S&P 500 index fund, you own a proportional slice of 500 companies simultaneously. The fund rebalances automatically as the index changes.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>MARKET CAP WEIGHTING</strong><br />
            Most major indices are market-cap weighted: larger companies get a bigger weight. Apple at ~7% of the S&P 500 means 7p of every £1 you invest goes to Apple. Concentration at the top is a feature — the largest companies are largest because they're valuable — but also a risk.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Why passive wins" />
          <Body>SPIVA (S&P Indices vs Active) publishes annual data on how many active funds beat their index after fees. The results are consistent: roughly 92% of active funds underperform their benchmark over 15 years. The reason is compounding cost drag.</Body>
          <Formula>{`Active fund: 7% gross return − 1.5% fees = 5.5% net\nIndex fund:  7% gross return − 0.05% fees = 6.95% net\n\n£10,000 over 30 years:\nActive: £48,600\nIndex:  £76,100  (+£27,500 from lower fees alone)`}</Formula>
          <Body>The performance gap is almost entirely explained by fees. The average active manager is not incompetent — they're fighting a cost battle they cannot win in aggregate.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Picking an index fund" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "Vanguard FTSE Global All Cap (VWRP)", note: "~9,000 stocks, 50+ countries, 0.23% OCF. Near-total global exposure." },
              { label: "iShares Core MSCI World ETF (SWDA)", note: "~1,600 developed market stocks, 0.20% OCF. Excludes emerging markets." },
              { label: "Vanguard S&P 500 ETF (VUSA)", note: "500 US large caps, 0.07% OCF. Heavy US concentration." },
              { label: "Vanguard FTSE 100 ETF (VUKE)", note: "100 UK large caps, 0.09% OCF. High energy/finance concentration." },
            ].map(({ label, note }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-cyan)", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)" }}>{note}</div>
              </div>
            ))}
          </div>
          <Takeaway>For most retail investors, a single global index fund (VWRP or equivalent) is the optimal portfolio. It's not exciting. That's the point — the strategy succeeds precisely because it removes all the ways you can harm yourself.</Takeaway>
        </>
      );
      return null;

    case "bonds-basics":
      if (step === 0) return (
        <>
          <LsnSection label="What is a bond?" />
          <Body>A bond is a loan you make to a government or corporation. In return, they promise to pay you a fixed interest rate (the coupon) periodically, and return the face value (principal) at maturity. Unlike equities, the return profile is pre-specified — no upside participation, but defined income.</Body>
          <Formula>{`Bond return = Coupon payments + (Face value − Purchase price) ÷ years held\n\nExample: £1,000 face, 4% coupon, bought at £950, 5 years to maturity\nYTM ≈ (£40 + £10/year) ÷ £975 ≈ 5.1%`}</Formula>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>TYPES OF BONDS</strong><br />
            <strong>Gilts:</strong> UK government bonds — lowest credit risk, lowest yield.<br />
            <strong>Investment grade:</strong> High-quality corporate bonds (AAA to BBB). Some credit risk, higher yield.<br />
            <strong>High yield (junk):</strong> Below BBB. Significant default risk, equity-like returns.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Yield vs price — the inverse relationship" />
          <Body>The most important concept in fixed income: bond prices and yields move in opposite directions. When you buy a bond at £1,000 paying 4%, the yield is 4%. If rates rise to 5%, your bond (still paying 4%) becomes less attractive — buyers will only pay ~£950 for it, pushing the yield to 5%.</Body>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px", lineHeight: 2, marginBottom: 10 }}>
            {[["Rates rise 1%","Bond price falls","Short-duration bond: −2%","Long-duration: −15%"],["Rates fall 1%","Bond price rises","Short-duration bond: +2%","Long-duration: +15%"]].map(([event, dir, short, long]) => (
              <div key={event} style={{ display: "flex", gap: 14 }}>
                <span style={{ color: "var(--ft-dim)", minWidth: 100 }}>{event}</span>
                <span style={{ color: "var(--ft-muted)", minWidth: 100 }}>{dir}</span>
                <span style={{ color: "var(--ft-amber)", minWidth: 120 }}>{short}</span>
                <span style={{ color: "var(--ft-red)" }}>{long}</span>
              </div>
            ))}
          </div>
          <Body>Duration measures a bond's price sensitivity to interest rates. Higher duration = more sensitive. In 2022, long-duration bonds fell 30%+ as rates rose sharply — a reminder that "safe" bonds can have large capital losses.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Role in a portfolio" />
          <Body>Bonds traditionally serve as ballast in a diversified portfolio — their negative correlation to equities (in normal market conditions) reduces portfolio volatility without proportionally reducing expected returns. A 60/40 equity/bond portfolio has historically delivered ~80% of equity returns at ~60% of the volatility.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>THE 2022 BREAKDOWN</strong><br />
            In 2022, both equities and bonds fell simultaneously as inflation surged and central banks hiked rates aggressively. The 60/40 portfolio fell ~17% — its worst year since 1937. The correlation regime can shift. Bonds are not risk-free.
          </InfoBox>
          <Takeaway>Bonds earn less than equities over the long run — that's the price of their stability. Use them to reduce portfolio volatility as you approach your investment horizon, or as income-generating assets in retirement. The younger you are, the fewer bonds you typically need.</Takeaway>
        </>
      );
      return null;

    case "reits":
      if (step === 0) return (
        <>
          <LsnSection label="What is a REIT?" />
          <Body>A Real Estate Investment Trust (REIT) is a company that owns income-producing real estate and is structured to pass most of its rental income directly to shareholders. By law, REITs must distribute at least 90% of taxable income as dividends — this creates high, consistent yields.</Body>
          <Body>REITs allow retail investors to access commercial real estate (office towers, shopping centres, logistics warehouses, data centres) that would otherwise require millions in capital. They trade on stock exchanges like ordinary shares — liquid, divisible, and transparent.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>UK REITS — TAX TREATMENT</strong><br />
            UK REITs pay no corporate tax on qualifying property income. Dividends from UK REITs are treated as property income (taxed at marginal income tax rate, not dividend rates). Hold in an ISA to shelter entirely.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Types of REITs" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "Industrial / Logistics", color: "var(--ft-green)", text: "Warehouses, distribution centres. Strong secular tailwind from e-commerce. Examples: SEGRO, Prologis." },
              { label: "Data Centre", color: "var(--ft-blue)", text: "AI infrastructure demand. Extremely capital-intensive. Examples: Equinix, Digital Realty." },
              { label: "Retail", color: "var(--ft-amber)", text: "Shopping centres, high street. Structural headwinds from online retail. Valuation dependent on lease terms." },
              { label: "Office", color: "var(--ft-red)", text: "Severely disrupted by WFH. Prime London/NYC still resilient; regional suburban office struggling." },
              { label: "Healthcare / Residential", color: "var(--ft-cyan)", text: "Care homes, BTR housing. Demographic tailwinds. Long, inflation-linked leases." },
            ].map(({ label, color, text }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: `1px solid ${color}30`, padding: "8px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)" }}>{text}</div>
              </div>
            ))}
          </div>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Valuing REITs — why FFO matters" />
          <Body>Standard P/E ratios misrepresent REITs because real estate depreciation is a non-cash charge that reduces accounting earnings but doesn't reflect actual property value decline. The correct metric is Funds From Operations (FFO):</Body>
          <Formula>{`FFO = Net Income + Depreciation + Amortisation − Gains on property sales\n\nP/FFO replaces P/E for REIT comparison\nTypical range: 15-25× for quality REITs`}</Formula>
          <Body>Also watch: Net Asset Value (NAV) — the market value of properties minus debt. A REIT trading at a discount to NAV may be cheap; a premium to NAV implies the market expects rental income growth.</Body>
          <Takeaway>REITs offer real estate exposure without the management burden or capital concentration of owning physical property. They're particularly useful for income investors. Understand the sub-sector: industrial and data centre REITs are very different businesses from retail REITs.</Takeaway>
        </>
      );
      return null;

    case "factor-investing":
      if (step === 0) return (
        <>
          <LsnSection label="The five factors" />
          <Body>Factor investing (aka smart beta) is the systematic pursuit of documented, persistent return premiums. Rather than picking stocks, you tilt your portfolio toward characteristics that have historically produced excess returns above the market. The academic foundation comes from decades of peer-reviewed research.</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "Market (Beta)", desc: "Excess return of stocks over risk-free rate. The original factor." },
              { label: "Size (SMB)", desc: "Small-cap stocks outperform large-caps over time. Higher risk, higher return." },
              { label: "Value (HML)", desc: "Cheap stocks (low P/B) outperform expensive stocks long-term." },
              { label: "Profitability (RMW)", desc: "Highly profitable firms outperform weak firms." },
              { label: "Investment (CMA)", desc: "Conservative-investing firms outperform aggressive ones." },
            ].map(({ label, desc }) => (
              <div key={label} style={{ display: "flex", gap: 12, background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 12px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-cyan)", minWidth: 130, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 12, color: "var(--ft-muted)" }}>{desc}</span>
              </div>
            ))}
          </div>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="The value factor" />
          <Body>The value premium — cheap stocks outperforming expensive stocks — is one of the most documented phenomena in finance, observed across markets and time periods. Value stocks are identified by low price-to-book, price-to-earnings, or price-to-cash-flow ratios.</Body>
          <Body>Why does the premium exist? Two competing theories: (1) Risk-based — value stocks are genuinely riskier (distressed, cyclical), and the premium compensates for that risk. (2) Behavioural — investors overpay for glamorous growth stocks and neglect boring value stocks. Both likely contribute.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>THE LOST DECADE</strong><br />
            Value massively underperformed growth from 2010-2020, causing many to declare the premium dead. It roared back in 2022 as rising rates crushed growth stocks. Factor premiums can be dormant for a decade — you need conviction and a very long horizon.
          </InfoBox>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Momentum and quality" />
          <Body>Beyond Fama-French, momentum (stocks that have risen over 12 months continue to rise) is arguably the strongest documented factor — a 1-year momentum premium has been observed in virtually every studied market. It's also the most difficult to hold: it crashes suddenly and viciously (momentum crashes in reversals).</Body>
          <Body>Quality (high profitability, stable earnings, low leverage) has strong intuitive and empirical support. Quality companies tend to survive drawdowns better and compound steadily over time. Warren Buffett's long-term outperformance is largely explained by his quality and low-beta tilt.</Body>
          <Takeaway>Factor investing sits between pure passive and stock picking. It's systematic, evidence-based, and slightly more costly than plain index funds. The trade-off: you accept long periods of underperformance (value's lost decade) in exchange for a historically documented premium over very long horizons.</Takeaway>
        </>
      );
      return null;

    case "isa-strategy":
      if (step === 0) return (
        <>
          <LsnSection label="ISA types" />
          <Body>The Individual Savings Account (ISA) is a government-created tax wrapper allowing UK residents to shelter up to £20,000 per year from income tax, capital gains tax, and dividend tax. Returns within the ISA compound tax-free forever — no forms, no reporting, no annual tax calculations.</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "Cash ISA", color: "var(--ft-dim)", text: "Savings account wrapper. Tax-free interest. Poor real returns in high-inflation environments." },
              { label: "Stocks & Shares ISA", color: "var(--ft-green)", text: "Invest in equities, ETFs, funds within the wrapper. All gains and income are tax-free forever." },
              { label: "Lifetime ISA (LISA)", color: "var(--ft-amber)", text: "18-39 only. 25% government bonus on up to £4,000/year. For first property or retirement. Harsh early withdrawal penalty." },
              { label: "Innovative Finance ISA", color: "var(--ft-dim)", text: "P2P lending. Higher risk. Limited platforms. Generally unsuitable for most investors." },
            ].map(({ label, color, text }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: `1px solid ${color}30`, padding: "8px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)" }}>{text}</div>
              </div>
            ))}
          </div>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Stocks and Shares ISA deep dive" />
          <Body>The S&S ISA is the cornerstone of UK retail investing. Inside the wrapper, you can hold individual stocks, ETFs, investment trusts, gilts, and funds. Dividends are reinvested without tax. Capital gains never trigger CGT. You never need to report ISA returns on a tax return.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>THE POWER OF TAX-FREE COMPOUNDING</strong><br />
            £20,000 invested at 8% for 30 years:<br />
            — In a taxable account (20% CGT): ~£155,000 after tax<br />
            — In an ISA (0% CGT): ~£201,000<br />
            The ISA advantage grows every year you're invested.
          </InfoBox>
          <Body>Platforms for S&S ISAs: Vanguard (lowest cost for Vanguard funds), Trading 212 (free trades), Hargreaves Lansdown (best interface, higher fees), Freetrade (mobile-first). For long-term passive investing, Vanguard's own platform with a VWRP/VUSA allocation is hard to beat on cost.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Maximising the allowance" />
          <Body>The £20,000 annual ISA allowance resets every 5 April. Unused allowance is permanently lost — it cannot be carried forward. For high earners, maxing the ISA should be a non-negotiable annual priority before any taxable investing.</Body>
          <Formula>{`Priority order (most people):\n1. Employer pension match (100% return, immediate)\n2. Emergency fund (£1,000 minimum)\n3. LISA (if under 40, buying a home, or retirement)\n4. S&S ISA (£20,000/year wrapper)\n5. Pension above employer match (further tax relief)\n6. General investment account (taxable, after above)`}</Formula>
          <Takeaway>The ISA is the most valuable financial tool available to UK retail investors. Use it every year without exception. Even if you can only contribute £100/month, do it inside the ISA wrapper from day one — the tax-free compounding advantage compounds just as much as the investment returns do.</Takeaway>
        </>
      );
      return null;

    case "pension-basics":
      if (step === 0) return (
        <>
          <LsnSection label="How pensions work" />
          <Body>A pension is a tax-advantaged account for retirement saving. Contributions receive income tax relief — the government refunds the tax you paid on that money, effectively boosting every contribution immediately. Returns grow tax-free inside the wrapper, and withdrawals in retirement may be in a lower tax bracket than your working years.</Body>
          <Formula>{`Basic rate (20%) taxpayer: contribute £800 → receives £1,000 in pension\nHigher rate (40%) taxpayer: contribute £600 → receives £1,000 in pension\nAdditional rate (45%): contribute £550 → receives £1,000 in pension\n\nHigher/additional rate payers claim extra relief via self-assessment`}</Formula>
          <Body>The "three-way tax advantage": relief on the way in (contributions), tax-free growth inside, and a 25% tax-free lump sum on the way out (up to the lump sum limit).</Body>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Employer match — the guaranteed 100% return" />
          <Body>Auto-enrolment requires UK employers to contribute at least 3% of qualifying earnings. Most also match employee contributions up to a limit. This employer match is a 100% instant return on your contribution — no investment in the world guarantees that. It must be prioritised above all other investment decisions.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>EXAMPLE</strong><br />
            Employer matches up to 5%. Employee contributes 5% of £40,000 salary = £2,000/year.<br />
            Employer adds £2,000. Total pension contribution: £4,000. Your cost (after 20% tax relief): £1,600.<br />
            Effective return on your £1,600: 150% instantly, before any investment growth.
          </InfoBox>
          <Body>Common mistake: contributing below the employer match threshold to keep more take-home pay. This is one of the most financially damaging decisions an employee can make. The employer contribution is part of your compensation — not claiming it is leaving salary on the table.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Contribution limits" />
          <Body>The Annual Allowance for pension contributions is £60,000 (2024/25) — or 100% of your earnings if lower. Contributions above this incur a tax charge that claws back the relief. For most earners, this limit is never a concern.</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "Annual Allowance", value: "£60,000 (2024/25)", note: "Total employee + employer contributions" },
              { label: "Tapered Annual Allowance", value: "Down to £10,000", note: "For high earners with income > £260,000" },
              { label: "Money Purchase AA", value: "£10,000", note: "After you've accessed pension flexibly (drawdown)" },
              { label: "Lump sum allowance", value: "£268,275", note: "Maximum tax-free cash you can take at retirement" },
            ].map(({ label, value, note }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 12px", display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 11, color: "var(--ft-dim)" }}>{note}</div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)", alignSelf: "center", whiteSpace: "nowrap" as const }}>{value}</div>
              </div>
            ))}
          </div>
          <Takeaway>Pension = ISA + employer free money + income tax relief. If you're employed and not contributing enough to get the full employer match, that is the single highest-priority change you can make to your finances today.</Takeaway>
        </>
      );
      return null;

    case "capital-gains-tax":
      if (step === 0) return (
        <>
          <LsnSection label="What triggers CGT?" />
          <Body>Capital Gains Tax applies when you dispose of an asset at a profit. "Dispose" includes selling, gifting, swapping, or otherwise transferring ownership. The gain is the difference between the disposal proceeds and the original cost (plus allowable costs such as broker fees and improvement costs for property).</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>DOES NOT APPLY TO:</strong><br />
            — ISA and pension disposals (completely exempt)<br />
            — Main residence (Private Residence Relief)<br />
            — Gifts between spouses (no gain/no loss)<br />
            — Premium Bonds and government gilts<br />
            — Cars (even classic cars are exempt)
          </InfoBox>
          <Body>CGT rates from October 2024: shares and most assets — 18% (basic rate) / 24% (higher/additional rate). Residential property — 18% / 24%. Business assets with Business Asset Disposal Relief — 14% (rising to 18% from April 2026).</Body>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Annual exempt amount" />
          <Body>Every UK individual has a CGT Annual Exempt Amount — gains below this threshold are tax-free. The exemption was cut sharply in recent years, making the ISA wrapper far more important.</Body>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px", lineHeight: 2, marginBottom: 10 }}>
            {[["2022/23","£12,300"],["2023/24","£6,000"],["2024/25+","£3,000"]].map(([yr, amt]) => (
              <div key={yr} style={{ display: "flex", gap: 20 }}>
                <span style={{ color: "var(--ft-dim)", minWidth: 80 }}>{yr}</span>
                <span style={{ color: yr === "2024/25+" ? "var(--ft-red)" : "var(--ft-muted)" }}>{amt}</span>
              </div>
            ))}
          </div>
          <Body>With only £3,000 exempt, even modest gains on non-ISA investments create a CGT liability. A portfolio worth £50,000 returning 7% generates £3,500 in gains — already above the exemption. This is exactly why ISA allowances should be used annually before taxable accounts.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Minimising your bill" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "Use the ISA allowance first", text: "All gains inside an ISA are exempt. Prioritise maxing your ISA." },
              { label: "Bed and ISA", text: "Sell gains from a taxable account and rebuy inside an ISA. Crystallise the gain, reset the cost basis, shelter future growth." },
              { label: "Spousal transfers", text: "Transfer assets to a spouse before selling — use both annual exemptions." },
              { label: "Tax-loss harvesting", text: "Sell assets at a loss to offset gains elsewhere in the same tax year." },
              { label: "Timing disposals", text: "Spread gains across two tax years to use exemptions twice. Sell half by 5 April, half on 6 April." },
            ].map(({ label, text }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-amber)", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)" }}>{text}</div>
              </div>
            ))}
          </div>
          <Takeaway>CGT is largely optional for disciplined investors: hold assets inside an ISA, use your annual allowance, and defer sales. The investors who pay the most CGT are often those who actively trade in taxable accounts. Buy-and-hold passive investing inside an ISA generates zero CGT indefinitely.</Takeaway>
        </>
      );
      return null;

    case "tax-loss-harvesting":
      if (step === 0) return (
        <>
          <LsnSection label="The strategy" />
          <Body>Tax-loss harvesting involves deliberately selling investments that are showing a paper loss in order to realise that loss for tax purposes. The realised loss offsets capital gains elsewhere, reducing your CGT bill. You then reinvest the proceeds in a similar (but not identical) position to maintain market exposure.</Body>
          <Formula>{`Tax saving = Realised loss × CGT rate\n\nExample: £5,000 loss, 24% CGT rate\nTax saved: £5,000 × 0.24 = £1,200\n\nReinvest £5,000 − £0 tax = maintain full market exposure`}</Formula>
          <Body>The strategy doesn't eliminate the loss — it converts a paper loss into a cash tax benefit. The new position has a lower cost basis, so future gains (when you eventually sell) will be larger. It's a deferral, not elimination, for most investors.</Body>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Wash sale rules" />
          <Body>The core risk in tax-loss harvesting is the "wash sale" or "bed and breakfast" rule — anti-avoidance legislation that disallows the tax loss if you buy back the same or substantially identical security too quickly.</Body>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "14px 0" }}>
            {[
              { label: "UK (HMRC)", color: "var(--ft-amber)", text: "'30-day rule': if you sell and repurchase the same share within 30 days, the loss is disallowed. Matched against the buyback price instead." },
              { label: "US (IRS)", color: "var(--ft-blue)", text: "'Wash sale rule': same 30-day window, applies 30 days before AND after. Substantially identical securities (same ETF via different provider) may also trigger it." },
            ].map((o) => (
              <div key={o.label} style={{ padding: "10px 12px", background: "var(--ft-raised)", border: `1px solid ${o.color}30` }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: o.color, marginBottom: 6 }}>{o.label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)", lineHeight: 1.6 }}>{o.text}</div>
              </div>
            ))}
          </div>
          <Body>Solution: sell iShares MSCI World and immediately buy Vanguard MSCI World (same index, different provider). You maintain equivalent exposure but avoid the wash sale — they're not "identical" securities.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Practical implementation" />
          <Body>Tax-loss harvesting is most valuable in taxable (non-ISA, non-pension) accounts, during market downturns, and for investors in higher CGT brackets. In the UK, the 24% CGT rate for higher-rate taxpayers means each £1,000 of harvested loss is worth £240 of real cash.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>WHEN NOT TO HARVEST</strong><br />
            — Inside an ISA or pension (gains already exempt — irrelevant)<br />
            — If you have no other gains to offset (losses carry forward but are less immediate)<br />
            — If transaction costs eat the tax saving<br />
            — If the loss is small relative to CGT annual exemption
          </InfoBox>
          <Takeaway>Tax-loss harvesting is a genuine alpha source for taxable investors — one of the few strategies where skill and attention generate real, after-tax returns above doing nothing. It's particularly powerful at year-end (before 5 April) when the full picture of your gains and losses for the tax year is clear.</Takeaway>
        </>
      );
      return null;

    case "credit-scores":
      if (step === 0) return (
        <>
          <LsnSection label="What is a credit score?" />
          <Body>A credit score is a numerical summary of your credit history — a prediction of how likely you are to repay future debt based on past behaviour. UK lenders don't use a single universal score; they use proprietary models built from data supplied by the three Credit Reference Agencies (CRAs): Experian, Equifax, and TransUnion.</Body>
          <Body>Each CRA may hold slightly different data (not all lenders report to all three agencies) and use different scoring scales. A "good" score on Experian (721-880) is different from a "good" score on Equifax (420-465). What matters is the direction, not the absolute number.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>CHECK YOUR REPORT FREE</strong><br />
            Experian: free basic score via ClearScore or MSE Credit Club.<br />
            Equifax: free via ClearScore.<br />
            TransUnion: free via Credit Karma.<br />
            Check all three — errors on one may not appear on others.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="What moves your score?" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "Payment history (35%)", color: "var(--ft-red)", text: "Biggest factor. A single missed payment stays on file 6 years in the UK. Set up direct debits for at least minimums on ALL credit." },
              { label: "Credit utilisation (30%)", color: "var(--ft-amber)", text: "Using >30% of available credit is a risk signal. Pay balances in full monthly; request higher limits to reduce utilisation ratio." },
              { label: "Credit history length (15%)", color: "var(--ft-muted)", text: "Older accounts help. Never close your oldest credit card — even if unused." },
              { label: "Credit mix (10%)", color: "var(--ft-dim)", text: "Having a mix (card, loan, mortgage) shows you can manage multiple credit types." },
              { label: "New credit inquiries (10%)", color: "var(--ft-dim)", text: "Hard searches (applications) temporarily lower score. Soft searches (eligibility checks) do not." },
            ].map(({ label, color, text }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: `1px solid ${color}30`, padding: "8px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)" }}>{text}</div>
              </div>
            ))}
          </div>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Optimising your score" />
          <Body>Credit score optimisation is straightforward for someone with no derogatory marks — it's largely a waiting and consistency game. For someone with past defaults, the path is longer but the same fundamentals apply.</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              "Register on the electoral roll at your current address — adds ~50 points at many CRAs",
              "Pay every bill on time, every month — set up direct debits",
              "Keep credit card utilisation below 30% (ideally below 10%)",
              "Never close your oldest credit card — it lengthens your history",
              "Use a credit builder card if you have no credit history",
              "Space out applications — each hard search knocks points temporarily",
            ].map((tip, i) => (
              <div key={i} style={{ display: "flex", gap: 10, background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 12px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)", minWidth: 18 }}>{i + 1}.</span>
                <span style={{ fontSize: 12, color: "var(--ft-muted)" }}>{tip}</span>
              </div>
            ))}
          </div>
          <Takeaway>A strong credit score is infrastructure — it determines your mortgage rate, which can be worth £50,000+ over a lifetime. The difference between an 80% and a 90% LTV mortgage rate is often 0.5-1%, which on a £300k mortgage is thousands of pounds per year.</Takeaway>
        </>
      );
      return null;

    case "mortgage-basics":
      if (step === 0) return (
        <>
          <LsnSection label="LTV and rates" />
          <Body>Loan-to-Value (LTV) is the single most important variable in mortgage pricing. It represents the loan as a percentage of the property value. A 10% deposit = 90% LTV. Lenders offer progressively better rates at lower LTV thresholds because their risk exposure is lower.</Body>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px", lineHeight: 2, marginBottom: 10 }}>
            {[["95% LTV","5% deposit","Highest rate","Limited lenders"],["90% LTV","10% deposit","Better rate","Most lenders"],["85% LTV","15% deposit","Good rate",""],["75% LTV","25% deposit","Very good rate","Better products"],["60% LTV","40% deposit","Best rates","Full product range"]].map(([ltv, dep, rate, note]) => (
              <div key={ltv} style={{ display: "flex", gap: 14 }}>
                <span style={{ color: "var(--ft-accent)", minWidth: 70 }}>{ltv}</span>
                <span style={{ color: "var(--ft-dim)", minWidth: 90 }}>{dep}</span>
                <span style={{ color: "var(--ft-muted)", minWidth: 100 }}>{rate}</span>
                <span style={{ color: "var(--ft-dim)" }}>{note}</span>
              </div>
            ))}
          </div>
          <MortgageCalculator />
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Repayment vs interest-only" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "14px 0" }}>
            {[
              { label: "REPAYMENT", color: "var(--ft-green)", bg: "rgba(63,185,80,0.06)", text: "Monthly payment covers both interest and capital. Balance falls every month. You own the property outright at term end. Default path for residential buyers." },
              { label: "INTEREST ONLY", color: "var(--ft-amber)", bg: "rgba(245,158,11,0.06)", text: "Monthly payment covers interest only. Balance unchanged after 25 years — you must repay the full loan at term end. Requires a credible repayment vehicle (investments, property sale). Higher risk." },
            ].map((o) => (
              <div key={o.label} style={{ padding: "10px 12px", background: o.bg, border: `1px solid ${o.color}30` }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: o.color, marginBottom: 6 }}>{o.label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)", lineHeight: 1.6 }}>{o.text}</div>
              </div>
            ))}
          </div>
          <Body>Interest-only mortgages are not inherently bad — they're a tool. Buy-to-let investors commonly use them to maximise cash flow, with the property value (and rental income) serving as the repayment vehicle. For homeowners, repayment is overwhelmingly the safer choice.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="True cost of buying" />
          <Body>The sticker price of property is only part of the cost. Buyers consistently underestimate transaction costs and ongoing maintenance:</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "Stamp Duty (SDLT)", text: "0% on first £250k (FTB relief up to £425k). 5% on £250k-£925k. Additional 3% surcharge for second properties." },
              { label: "Solicitor fees", text: "£1,500-3,000 typical for conveyancing. Survey: £500-1,500 depending on level." },
              { label: "Mortgage arrangement fee", text: "£999-1,500 typical. Can be added to mortgage (but then you pay interest on it)." },
              { label: "Ongoing maintenance", text: "Budget 1-2% of property value annually for repairs, decoration, appliances." },
            ].map(({ label, text }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-amber)", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)" }}>{text}</div>
              </div>
            ))}
          </div>
          <Takeaway>On a £300,000 property, transaction costs alone can total £8,000-12,000. The true breakeven period vs renting is often 5-7 years. Run the full numbers — the rent vs buy decision is highly location and market dependent, not a universal truth.</Takeaway>
        </>
      );
      return null;

    case "insurance-basics":
      if (step === 0) return (
        <>
          <LsnSection label="Risk pooling" />
          <Body>Insurance is the transfer of financial risk from an individual to a large group in exchange for a premium. The insurer pools premiums from many people and pays out to the few who suffer losses. The law of large numbers makes this profitable for insurers and affordable for individuals.</Body>
          <Formula>{`Expected premium = (Probability of loss × Size of loss) + Insurer's margin\n\nExample: 1 in 1,000 houses burns down per year at £200,000 average loss\nFair premium ≈ £200 + insurer margin + admin`}</Formula>
          <Body>Insurance only makes rational economic sense for low-probability, high-severity risks — events that would be financially catastrophic but are unlikely. Insuring high-probability, low-severity events (phone screen cracks) is almost always poor value; the insurer's margin makes it negative EV.</Body>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Types to consider" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "Income protection", color: "var(--ft-green)", priority: "CRITICAL", text: "Covers 50-70% of salary if unable to work due to illness/injury. The most under-owned essential insurance for working adults." },
              { label: "Life insurance / term", color: "var(--ft-green)", priority: "CRITICAL if dependants", text: "Lump sum on death. Only needed if others depend on your income. Level term for a mortgage is cheapest." },
              { label: "Critical illness cover", color: "var(--ft-amber)", priority: "IMPORTANT", text: "Lump sum on diagnosis of specified serious illnesses. Complements income protection." },
              { label: "Buildings and contents", color: "var(--ft-amber)", priority: "IMPORTANT", text: "Buildings required by mortgage lender. Contents protects possessions." },
              { label: "Private health insurance", color: "var(--ft-dim)", priority: "OPTIONAL", text: "Faster access to specialists. NHS provides baseline. Valuable for self-employed with no sick pay." },
            ].map(({ label, color, priority, text }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: `1px solid ${color}30`, padding: "8px 12px" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color }}>{label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>{priority}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)" }}>{text}</div>
              </div>
            ))}
          </div>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Avoiding over-insurance" />
          <Body>Insurance companies are profitable because they charge more than the actuarial cost of claims, on average. Over-insuring wastes money on negative-expected-value products. The goal is to insure catastrophic risks and self-insure everything else.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>POOR VALUE INSURANCE TO SKIP</strong><br />
            — Extended warranties (overpriced; use a credit card with free cover instead)<br />
            — Mobile phone insurance (excess is often £100+; replacement cost is predictable)<br />
            — Payment protection insurance (PPI — overpriced and often mis-sold)<br />
            — Flight cancellation insurance if you paid by credit card (free s75 protection)
          </InfoBox>
          <Body>Increase excess (deductibles) on all policies to the highest level you could comfortably fund from savings. This significantly reduces premiums and removes the insurer's margin on small, manageable claims you can absorb yourself.</Body>
          <Takeaway>Insure your income (most valuable asset), your life if you have dependants, and your home (legally required and catastrophic if uninsured). Skip insurance on everything you could replace from 3 months of savings. The emergency fund and income protection are two sides of the same risk management strategy.</Takeaway>
        </>
      );
      return null;

    case "inflation":
      if (step === 0) return (
        <>
          <LsnSection label="What causes inflation?" />
          <Body>Inflation is a sustained rise in the general price level — the same basket of goods costs more over time. The primary causes are: demand-pull (too much money chasing too few goods), cost-push (supply-side shocks like energy price spikes), and monetary (excessive money supply growth reducing currency purchasing power).</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>TYPES OF INFLATION</strong><br />
            <strong>CPI (Consumer Price Index):</strong> Basket of ~700 goods and services. Official BoE target measure.<br />
            <strong>RPI (Retail Price Index):</strong> Older, higher measure. Used for student loan rates, rail fares, gilt indexing.<br />
            <strong>Core CPI:</strong> CPI excluding food and energy (more volatile). Watched by central banks as the "underlying" trend.
          </InfoBox>
          <Body>The Bank of England targets 2% CPI. Below 1% requires a letter to the Chancellor. Above 3% also requires a letter. The 2% target isn't arbitrary — it provides a buffer against deflation (falling prices, which can be economically catastrophic) while maintaining currency stability.</Body>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="How it's measured" />
          <Body>CPI is calculated monthly by the Office for National Statistics. Researchers visit thousands of shops and websites, collecting ~180,000 prices across ~700 items weighted by typical household spending. The basket is updated annually to reflect changing consumption patterns.</Body>
          <Formula>{`CPI = (Cost of basket in current year ÷ Cost of basket in base year) × 100\n\nReal return = Nominal return − Inflation\n\nExample: savings at 2%, inflation at 4% → real return of −2%\n£10,000 loses £200 in purchasing power per year`}</Formula>
          <InflationCalculator />
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Protecting against it" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "Equities", color: "var(--ft-green)", text: "Best long-term inflation hedge. Companies can raise prices; earnings and dividends grow with inflation over time." },
              { label: "Index-linked gilts (ILGs)", color: "var(--ft-green)", text: "UK government bonds where both principal and coupon grow with RPI. Direct inflation protection." },
              { label: "Property (real assets)", color: "var(--ft-amber)", text: "Rental income and property values tend to rise with inflation. Leveraged via mortgage amplifies the effect." },
              { label: "Commodities", color: "var(--ft-amber)", text: "Often a direct input to inflation. Oil, metals, agriculture tend to rise during inflationary periods." },
              { label: "Cash (nominal)", color: "var(--ft-red)", text: "Guaranteed real loss if rate below inflation. Fine as short-term buffer; wealth-destroying long-term." },
            ].map(({ label, color, text }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: `1px solid ${color}30`, padding: "8px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)" }}>{text}</div>
              </div>
            ))}
          </div>
          <Takeaway>Inflation at 3% halves the real value of cash in 24 years. The emergency fund earns near-inflation rates; everything beyond that should be invested in real assets. Failing to invest isn't "playing it safe" — it's accepting a guaranteed real loss.</Takeaway>
        </>
      );
      return null;

    case "interest-rates":
      if (step === 0) return (
        <>
          <LsnSection label="The mechanism" />
          <Body>The Bank of England's Monetary Policy Committee (MPC) sets the Bank Rate — the interest rate at which commercial banks borrow from the central bank. This rate transmits through the economy: it influences mortgage rates, savings rates, corporate borrowing costs, and the exchange rate.</Body>
          <Formula>{`Rate transmission mechanism:\nBank Rate → short-term money markets → bank lending rates\n→ mortgage and corporate borrowing costs\n→ consumer spending and investment\n→ aggregate demand\n→ inflation`}</Formula>
          <Body>Raising rates makes borrowing more expensive, reducing consumer spending and business investment. Lower demand cools inflation. Cutting rates does the reverse — stimulating spending and risking higher inflation. The lag between rate changes and economic impact is typically 12-18 months.</Body>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Rates and asset prices" />
          <Body>Interest rates are the gravity of the financial system — they affect the value of every asset class simultaneously. The direction of rates is the single most important macro variable for investors to understand.</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "Bonds", col: "var(--ft-red)", up: "Prices fall (inverse relationship)", down: "Prices rise" },
              { label: "Equities (growth)", col: "var(--ft-amber)", up: "Negative — future cash flows discounted harder", down: "Very positive — low discount rate inflates value" },
              { label: "Equities (value)", col: "var(--ft-green)", up: "Less negative — near-term earnings matter more", down: "Less positive — less distortion to valuations" },
              { label: "Property / REITs", col: "var(--ft-red)", up: "Negative — higher mortgage costs, higher cap rates", down: "Positive — cheaper financing, yield less competitive" },
              { label: "Cash / savings", col: "var(--ft-green)", up: "Positive — higher interest income", down: "Negative — lower yields" },
            ].map(({ label, col, up, down }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: col, marginBottom: 4 }}>{label}</div>
                <div style={{ display: "flex", gap: 10, fontSize: 11 }}>
                  <span style={{ color: "var(--ft-red)", minWidth: 30 }}>↑</span><span style={{ color: "var(--ft-muted)" }}>{up}</span>
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 11, marginTop: 2 }}>
                  <span style={{ color: "var(--ft-green)", minWidth: 30 }}>↓</span><span style={{ color: "var(--ft-muted)" }}>{down}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="The inverted yield curve" />
          <Body>Normally, longer-term bonds yield more than shorter-term ones (compensation for locking money up longer). When the 2-year yield exceeds the 10-year yield, the curve "inverts" — a signal that markets expect the economy to weaken and rates to be cut.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>HISTORICAL RECORD</strong><br />
            The 2-year/10-year yield curve inverted before every US recession since the 1970s. It inverted in March 2022 and remained inverted through 2023-24 — the longest inversion in decades. As of late 2024, it un-inverted, which historically precedes recession by 3-6 months.
          </InfoBox>
          <Takeaway>You don't need to predict where rates go — you need to understand how your portfolio responds to different rate scenarios. A portfolio heavy in long-duration bonds and high-growth tech stocks is very sensitive to rate changes. A portfolio in short-duration bonds and value stocks is more resilient.</Takeaway>
        </>
      );
      return null;

    case "yield-curve":
      if (step === 0) return (
        <>
          <LsnSection label="Reading the curve" />
          <Body>The yield curve is a plot of government bond yields at different maturities — from 1-month to 30 years. It shows what the bond market expects interest rates and economic conditions to look like at each point in the future. It's the most information-dense chart in macroeconomics.</Body>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-cyan)", background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.15)", padding: "12px 14px", lineHeight: 2.0, whiteSpace: "pre" as const, overflowX: "auto", marginBottom: 12 }}>
            {`Yield ▲\n5.5% ┤                              ·  30yr (normal)\n5.0% ┤               ·  10yr\n4.5% ┤        · 5yr\n4.0% ┤   · 2yr\n3.5% ┤ · 1yr\n     └──────────────────────────────► Maturity`}
          </div>
          <Body>Normal (upward sloping): longer maturities yield more. Investors demand compensation for the uncertainty of locking money up longer. Flat: rates expected to stay the same. Inverted: short rates exceed long rates — recession signal.</Body>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Why it inverts" />
          <Body>Yield curve inversion happens when the market expects the central bank to cut rates in the future. Why? If investors believe the economy will weaken (recession), they expect the central bank to respond by cutting rates to stimulate growth. Buying long-dated bonds locks in today's higher rates before the cuts arrive — driving long-term yields down below short-term yields.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>THE 2022-2024 INVERSION</strong><br />
            The US 2s10s inverted in March 2022 as the Fed began its fastest hiking cycle since the 1980s. It reached -108bps (1.08%) in July 2023 — deepest inversion in 40 years. It un-inverted in September 2024. Historically, recessions arrive 6-18 months after un-inversion.
          </InfoBox>
          <Body>Inversion doesn't cause recessions — it reflects market expectations of one. The causal chain: tight monetary policy → credit contraction → reduced business investment and consumer spending → recession.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Historical signals" />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px", lineHeight: 2, marginBottom: 10 }}>
            {[["1989","Inverted","1990-91 recession","12 months"],["2000","Inverted","Dot-com recession","13 months"],["2006","Inverted","2008 GFC","24 months"],["2019","Brief inversion","2020 recession","7 months"],["2022","Inverted","Pending","—"]].map(([yr, sig, rec, lag]) => (
              <div key={yr} style={{ display: "flex", gap: 14 }}>
                <span style={{ color: "var(--ft-dim)", minWidth: 50 }}>{yr}</span>
                <span style={{ color: "var(--ft-amber)", minWidth: 100 }}>{sig}</span>
                <span style={{ color: "var(--ft-muted)", minWidth: 150 }}>{rec}</span>
                <span style={{ color: "var(--ft-dim)" }}>{lag}</span>
              </div>
            ))}
          </div>
          <Body>The predictive record is strong but noisy — the lag varies enormously and the 2019-2020 recession was caused by a pandemic, not the inversion. The curve is a probabilistic signal, not a trading timer.</Body>
          <Takeaway>The yield curve is the bond market's collective intelligence — thousands of professional investors with trillions at stake, pricing future rate expectations. When it inverts, take the signal seriously. It doesn't mean sell everything; it means review your portfolio's resilience to a slowdown scenario.</Takeaway>
        </>
      );
      return null;

    case "gdp-basics":
      if (step === 0) return (
        <>
          <LsnSection label="What GDP measures" />
          <Body>Gross Domestic Product (GDP) is the monetary value of all final goods and services produced within a country's borders in a given period. It's the most widely used measure of economic output and the primary metric used to define recession (two consecutive quarters of negative GDP growth).</Body>
          <Formula>{`Expenditure approach: GDP = C + I + G + (X − M)\n\nC = private consumption (households)\nI = investment (business capital expenditure)\nG = government spending\nX = exports  M = imports\n\nUK GDP 2023: ~£2.5 trillion`}</Formula>
          <Body>GDP per capita is more useful for comparing living standards across countries of different sizes — the UAE has much higher GDP per capita than India despite India's larger total GDP.</Body>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Nominal vs real GDP" />
          <Body>Nominal GDP is measured in current prices — it rises even if the economy doesn't grow, simply because prices rise with inflation. Real GDP strips out inflation using a price deflator, showing true output growth. Central banks and investors focus on real GDP.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>GDP vs GNP</strong><br />
            <strong>GDP:</strong> Production within a country's borders — includes output by foreign companies operating domestically.<br />
            <strong>GNP:</strong> Production by a country's citizens — includes overseas earnings, excludes foreign firms.<br />
            For most large economies, GDP and GNP are similar. For small open economies (Ireland), they can diverge dramatically.
          </InfoBox>
          <Body>GDP growth decomposition is useful for investors: if growth is consumption-driven (sustainable), it reads differently than if it's government-spending-driven (may not persist). Tracking each component provides texture beyond the headline number.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Leading indicators" />
          <Body>GDP is a lagging indicator — it tells you what the economy did, not what it's about to do. For investment purposes, leading indicators (which move ahead of the economic cycle) are more useful for anticipating turns.</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "PMI (Purchasing Managers Index)", type: "Leading", text: "Business survey: above 50 = expansion, below 50 = contraction. Released monthly, before GDP." },
              { label: "Yield curve", type: "Leading", text: "Inverted curve precedes recession by 6-18 months historically." },
              { label: "Building permits / housing starts", type: "Leading", text: "Construction is highly cyclical — collapses before recession, recovers before expansion." },
              { label: "Unemployment rate", type: "Lagging", text: "Rises after recession has started; peak unemployment occurs after GDP trough." },
              { label: "GDP itself", type: "Lagging", text: "Published with a lag; subject to significant revisions." },
            ].map(({ label, type, text }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "8px 12px" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)" }}>{label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: type === "Leading" ? "var(--ft-green)" : "var(--ft-dim)" }}>{type}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)" }}>{text}</div>
              </div>
            ))}
          </div>
          <Takeaway>GDP tells you where the economy has been. PMI, the yield curve, and credit spreads tell you where it's going. For investment decision-making, track leading indicators and use GDP prints to confirm what the forward-looking data already implied.</Takeaway>
        </>
      );
      return null;

    case "bitcoin-basics":
      if (step === 0) return (
        <>
          <LsnSection label="What is Bitcoin?" />
          <Body>Bitcoin is a decentralised digital currency — a peer-to-peer payment network with no central issuer, no central control, and a fixed maximum supply of 21 million coins. It was created in 2009 by the pseudonymous Satoshi Nakamoto as a response to the 2008 financial crisis, designed to function without banks or governments.</Body>
          <Body>Every transaction is recorded on a public, immutable ledger called the blockchain. Miners (powerful computers worldwide) compete to validate and add transactions, receiving newly created Bitcoin as a reward. This proof-of-work mechanism secures the network and creates new supply at a predetermined, decreasing rate.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>SUPPLY SCHEDULE</strong><br />
            Total supply: 21,000,000 BTC (hard cap)<br />
            Mined so far: ~19.7M (2024)<br />
            Remaining: ~1.3M — to be mined over the next ~120 years<br />
            New supply growth rate (2024): ~0.85% per year — lower than gold
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="The halving cycle" />
          <Body>Every 210,000 blocks (~4 years), the reward paid to Bitcoin miners is cut in half. This "halving" reduces the rate of new Bitcoin issuance, creating a predictable supply shock. There have been four halvings (2012, 2016, 2020, 2024) and each was followed by a significant bull market, though causation and correlation are contested.</Body>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px", lineHeight: 2, marginBottom: 10 }}>
            {[["2009-2012","50 BTC/block"],["2012-2016","25 BTC/block"],["2016-2020","12.5 BTC/block"],["2020-2024","6.25 BTC/block"],["2024+","3.125 BTC/block"]].map(([period, reward]) => (
              <div key={period} style={{ display: "flex", gap: 20 }}>
                <span style={{ color: "var(--ft-dim)", minWidth: 100 }}>{period}</span>
                <span style={{ color: "var(--ft-amber)" }}>{reward}</span>
              </div>
            ))}
          </div>
          <Body>By 2140, all 21 million Bitcoin will have been mined. Miners will then be paid only transaction fees. This creates a long-term security question: will fee revenue be sufficient to incentivise mining at scale? An open and debated question.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Store of value case" />
          <Body>Bitcoin's primary use case evolved from "digital cash" (2009 whitepaper) to "digital gold" — a non-sovereign, inflation-resistant store of value. The argument: central banks can print unlimited currency; Bitcoin cannot exceed 21M coins. In an environment of persistent monetary expansion, fixed-supply digital assets may hold or increase purchasing power.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>INSTITUTIONAL ADOPTION</strong><br />
            2024: US SEC approved spot Bitcoin ETFs (BlackRock iShares IBIT launched). Institutions can now hold Bitcoin via regulated, familiar wrappers. Accumulation by BlackRock, Fidelity, and corporate treasuries represents a structural demand shift from earlier cycles.
          </InfoBox>
          <Takeaway>Bitcoin is the highest-volatility, highest-asymmetry asset in any mainstream portfolio. Annual drawdowns of 50-80% are historically normal. If you allocate, size it to what you can hold through an 80% decline without panicking. 1-5% portfolio weight is the common institutional range for high-risk tolerance.</Takeaway>
        </>
      );
      return null;

    case "blockchain-basics":
      if (step === 0) return (
        <>
          <LsnSection label="Distributed ledgers" />
          <Body>A blockchain is a distributed ledger — a database that is simultaneously stored on thousands of computers worldwide, with no single copy being authoritative. Transactions are grouped into blocks; each block references the previous block's cryptographic hash, forming a chain. Altering any historical entry invalidates every subsequent block.</Body>
          <Body>This architecture solves the "double-spend problem" — how to prevent digital money from being copied and spent twice without a central authority (like a bank) tracking balances. Bitcoin solved this in 2009 for the first time in computing history.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>BLOCK STRUCTURE</strong><br />
            Each block contains: timestamp, transaction list, previous block's hash (linking the chain), and a "nonce" (number used in the mining puzzle). The hash of the previous block is what makes the chain immutable.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Consensus mechanisms" />
          <Body>A consensus mechanism is the set of rules by which distributed nodes agree on the valid state of the ledger — without trusting each other and without a central authority. The two dominant mechanisms are:</Body>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "14px 0" }}>
            {[
              { label: "PROOF OF WORK (PoW)", color: "var(--ft-amber)", bg: "rgba(245,158,11,0.06)", text: "Miners compete to solve computationally expensive puzzles. Winner adds the next block. Extremely energy-intensive. Used by: Bitcoin, Litecoin." },
              { label: "PROOF OF STAKE (PoS)", color: "var(--ft-green)", bg: "rgba(63,185,80,0.06)", text: "Validators stake crypto as collateral. Selected proportional to stake to validate blocks. 99.95% less energy. Used by: Ethereum, Cardano, Solana." },
            ].map((o) => (
              <div key={o.label} style={{ padding: "10px 12px", background: o.bg, border: `1px solid ${o.color}30` }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: o.color, marginBottom: 6 }}>{o.label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)", lineHeight: 1.6 }}>{o.text}</div>
              </div>
            ))}
          </div>
          <Body>Ethereum's "Merge" in September 2022 switched from PoW to PoS, cutting energy consumption by 99.95% while maintaining security. This was one of the most significant engineering events in crypto history.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="What blockchains actually solve" />
          <Body>Blockchain technology is powerful but misapplied. The innovation is specifically: enabling trustless coordination among parties who don't know or trust each other, without a central authority. This is a narrow but genuinely valuable use case.</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "GOOD USE CASES", color: "var(--ft-green)", items: ["Digital bearer assets (Bitcoin, crypto)", "Smart contract automation (DeFi, NFTs, DAOs)", "Transparent supply chains (when immutability is needed)", "Cross-border payments (without correspondent banks)"] },
              { label: "BAD USE CASES", color: "var(--ft-red)", items: ["Databases where a trusted admin exists (just use PostgreSQL)", "Voting (key management is the hard problem, not the ledger)", "Most corporate 'blockchain projects' (private blockchain = expensive database)"] },
            ].map(({ label, color, items }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: `1px solid ${color}30`, padding: "10px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color, marginBottom: 8 }}>{label}</div>
                {items.map((item, i) => <div key={i} style={{ fontSize: 12, color: "var(--ft-muted)", marginBottom: 4 }}>— {item}</div>)}
              </div>
            ))}
          </div>
          <Takeaway>Blockchain = trustless, immutable, decentralised ledger. When those three properties are needed simultaneously, blockchain is uniquely suited. When even one is unnecessary (you have a trusted admin), a traditional database is simpler, faster, and cheaper. Most enterprise blockchain projects fail this test.</Takeaway>
        </>
      );
      return null;

    case "defi-basics":
      if (step === 0) return (
        <>
          <LsnSection label="Protocols and liquidity" />
          <Body>Decentralised Finance (DeFi) is a collection of open-source financial protocols built on smart contract blockchains (primarily Ethereum) that replicate banking services — lending, borrowing, trading, earning yield — without banks, brokers, or intermediaries. Users interact directly with code; there are no accounts, no KYC, and no business hours.</Body>
          <Body>The key innovation is the Automated Market Maker (AMM). Instead of an order book matching buyers and sellers, AMMs use liquidity pools: users deposit token pairs (e.g. ETH + USDC) and earn fees when others trade against the pool. A mathematical formula (x×y=k) determines prices automatically.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>KEY PROTOCOLS (2024)</strong><br />
            Uniswap: Largest DEX, ~$1.5T lifetime volume.<br />
            Aave: Lending protocol, borrow against crypto collateral.<br />
            Compound: Money market protocol for earning interest.<br />
            MakerDAO: Issues DAI stablecoin against collateral.
          </InfoBox>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="Yield farming risks" />
          <Body>Yield farming involves depositing assets into DeFi protocols to earn rewards — typically protocol token emissions plus a share of trading fees. Advertised APYs can appear extremely high (100%+) but these rates are unsustainable and denominated in volatile tokens that may depreciate faster than the yield accrues.</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "Impermanent loss", color: "var(--ft-amber)", text: "As pool assets diverge in price, your share rebalances toward the underperforming asset. You end up with less of the outperformer than if you'd simply held." },
              { label: "Token inflation dilution", color: "var(--ft-amber)", text: "High APY from new token emissions causes inflation of that token. Real yield = APY − token depreciation rate." },
              { label: "Protocol insolvency", color: "var(--ft-red)", text: "If a lending protocol's collateral falls below the loan value faster than liquidation can occur, a shortfall (bad debt) occurs. See: Iron Finance collapse." },
              { label: "Regulatory risk", color: "var(--ft-red)", text: "Regulators globally are targeting DeFi. SEC enforcement has shut down major protocols. Regulatory risk is non-trivial." },
            ].map(({ label, color, text }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: `1px solid ${color}30`, padding: "8px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)" }}>{text}</div>
              </div>
            ))}
          </div>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Smart contract risk" />
          <Body>Every DeFi protocol is only as secure as its code. Smart contracts are immutable once deployed — bugs cannot be patched, only worked around via governance upgrades (if the protocol has them). Over $10 billion has been lost to DeFi exploits since 2020.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>NOTABLE EXPLOITS</strong><br />
            Poly Network (2021): $611M stolen via cross-chain bridge exploit.<br />
            Ronin Bridge (2022): $625M stolen — largest DeFi hack.<br />
            Euler Finance (2023): $197M stolen via flash loan exploit.<br />
            These were not scams — they were legitimate protocols with audited code.
          </InfoBox>
          <Body>Mitigation: use only protocols with multiple independent audits, high TVL (Total Value Locked), and a long track record. Uniswap v3 (launched 2021, billions locked, no major exploit) is far safer than a new protocol with an attractive APY and an anonymous team.</Body>
          <Takeaway>DeFi is genuinely innovative infrastructure — it enables financial services that couldn't exist any other way. But the user bears all protocol risk, there's no FSCS protection, and hacks are an occupational hazard. Approach with the same caution you'd apply to a very early-stage investment.</Takeaway>
        </>
      );
      return null;

    case "stablecoins":
      if (step === 0) return (
        <>
          <LsnSection label="Types of stablecoins" />
          <Body>A stablecoin is a crypto token designed to maintain a fixed value (usually $1 or £1) relative to a reference asset. They're the backbone of the crypto economy — enabling traders, DeFi participants, and cross-border payment users to hold value on-chain without exposure to crypto volatility. Three main mechanisms exist:</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "Fiat-backed (USDC, USDT)", color: "var(--ft-green)", text: "Backed 1:1 by USD held in bank accounts and T-bills. Most stable. Requires trust in issuer. Centralisation risk — Circle/Tether can freeze individual addresses." },
              { label: "Crypto-collateralised (DAI)", color: "var(--ft-amber)", text: "Backed by over-collateralised crypto deposits (e.g. 150% ETH). Decentralised. Stable in normal conditions; stress-tested in severe downturns." },
              { label: "Algorithmic (UST, FRAX)", color: "var(--ft-red)", text: "Maintained by algorithmic mechanisms and incentives, not real collateral. Terra/UST's collapse in 2022 wiped $40B — showed fatal reflexivity in pure algorithmic models." },
            ].map(({ label, color, text }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: `1px solid ${color}30`, padding: "8px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)" }}>{text}</div>
              </div>
            ))}
          </div>
        </>
      );
      if (step === 1) return (
        <>
          <LsnSection label="De-peg risk" />
          <Body>Even "safe" fiat-backed stablecoins carry de-peg risk. USDC briefly fell to $0.87 in March 2023 when $3.3 billion of Circle's reserves were held at Silicon Valley Bank during its failure. The peg recovered fully within 48 hours once the FDIC guaranteed all deposits — but the event revealed concentration risk.</Body>
          <InfoBox>
            <strong style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", fontSize: 10 }}>TERRA/UST COLLAPSE — MAY 2022</strong><br />
            UST was algorithmic — backed by LUNA token, not real dollars. A large withdrawal triggered selling of LUNA to defend the peg, collapsing LUNA's price, destroying the backing, requiring more LUNA to be printed, collapsing faster. $40B evaporated in 4 days. A classic reflexivity death spiral.
          </InfoBox>
          <Body>USDT (Tether) has never published a full audit of reserves and has settled with regulators multiple times. Despite this, it remains the most widely used stablecoin by volume (~$90B market cap). Counterparty risk on Tether is a persistent concern in the crypto community.</Body>
        </>
      );
      if (step === 2) return (
        <>
          <LsnSection label="Regulatory landscape" />
          <Body>Stablecoins are the primary target of crypto regulation globally. Regulators see them as potential payment system disruptors and systemic risks. The EU's MiCA regulation (effective 2024) requires stablecoin issuers to be authorised, hold 1:1 liquid reserves, and meet redemption obligations within 24 hours.</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {[
              { label: "EU (MiCA)", color: "var(--ft-green)", text: "Clear regulatory framework from 2024. Authorised issuers, reserve requirements, redemption rights. USDC, EURC positioned well." },
              { label: "UK (FCA)", color: "var(--ft-amber)", text: "Fiat-backed stablecoins under FCA remit. Consultation ongoing. UK aiming for pro-innovation framework." },
              { label: "US", color: "var(--ft-red)", text: "No federal stablecoin legislation as of 2024. SEC and CFTC jurisdiction dispute. USDT/USDC operating in regulatory grey zone." },
            ].map(({ label, color, text }) => (
              <div key={label} style={{ background: "var(--ft-raised)", border: `1px solid ${color}30`, padding: "8px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--ft-muted)" }}>{text}</div>
              </div>
            ))}
          </div>
          <Takeaway>Stablecoins are infrastructure, not investments. Use them as a unit of account within the crypto ecosystem — holding between trades, accessing DeFi, or sending value cross-border. Don't hold large amounts long-term in unregulated stablecoins; the reserve and counterparty risks are real even if the peg appears stable.</Takeaway>
        </>
      );
      return null;

    default:
      return <Body>Content not available.</Body>;
  }
}

// ── Quiz component ────────────────────────────────────────────────────────────

function QuizView({
  topicId,
  xp,
  onPass,
}: {
  topicId: string;
  xp: number;
  onPass: () => void;
}) {
  const questions = QUIZZES[topicId] ?? [];
  const [answers, setAnswers] = useState<(number | null)[]>(questions.map(() => null));
  const [submitted, setSubmitted] = useState(false);

  const score = submitted
    ? answers.filter((a, i) => a === questions[i].correct).length
    : 0;
  const passed = score >= Math.ceil(questions.length * 0.67);

  function handleSelect(qi: number, opt: number) {
    if (submitted) return;
    setAnswers(prev => prev.map((a, i) => i === qi ? opt : a));
  }

  function handleSubmit() {
    if (answers.some(a => a === null)) return;
    setSubmitted(true);
    if (passed) onPass();
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid var(--ft-border)" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-amber)", letterSpacing: "0.1em" }}>KNOWLEDGE CHECK</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>· {questions.length} questions · need 2/3 to pass</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {questions.map((q, qi) => {
          const selected = answers[qi];
          const isCorrect = submitted && selected === q.correct;
          const isWrong = submitted && selected !== null && selected !== q.correct;

          return (
            <div key={qi} style={{ background: "var(--ft-surface)", border: `1px solid ${submitted ? (isCorrect || (submitted && selected !== q.correct && selected === null) ? "var(--ft-border)" : isCorrect ? "rgba(63,185,80,0.3)" : isWrong ? "rgba(248,81,73,0.3)" : "var(--ft-border)") : "var(--ft-border)"}`, padding: 14 }}>
              <div style={{ fontSize: 13, color: "var(--ft-text)", marginBottom: 12, fontWeight: 500, lineHeight: 1.5 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginRight: 8 }}>Q{qi + 1}</span>
                {q.q}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {q.options.map((opt, oi) => {
                  const isThisSelected = selected === oi;
                  const isThisCorrect = submitted && oi === q.correct;
                  const isThisWrong = submitted && isThisSelected && oi !== q.correct;

                  return (
                    <button
                      key={oi}
                      onClick={() => handleSelect(qi, oi)}
                      disabled={submitted}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: isThisCorrect
                          ? "rgba(63,185,80,0.1)"
                          : isThisWrong
                          ? "rgba(248,81,73,0.1)"
                          : isThisSelected
                          ? "var(--ft-raised)"
                          : "var(--ft-base)",
                        border: `1px solid ${isThisCorrect ? "rgba(63,185,80,0.4)" : isThisWrong ? "rgba(248,81,73,0.4)" : isThisSelected ? "var(--ft-border2)" : "var(--ft-border)"}`,
                        color: isThisCorrect ? "var(--ft-green)" : isThisWrong ? "var(--ft-red)" : "var(--ft-muted)",
                        padding: "8px 12px",
                        cursor: submitted ? "default" : "pointer",
                        textAlign: "left",
                        fontSize: 12,
                        lineHeight: 1.4,
                        transition: "all 0.1s",
                        width: "100%",
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, minWidth: 18, color: isThisCorrect ? "var(--ft-green)" : isThisWrong ? "var(--ft-red)" : "var(--ft-dim)" }}>
                        {isThisCorrect ? "✓" : isThisWrong ? "✗" : String.fromCharCode(65 + oi)}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
              {submitted && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderLeft: "3px solid var(--ft-amber)", fontSize: 11, color: "var(--ft-muted)", lineHeight: 1.5 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-amber)", fontWeight: 700 }}>EXPLANATION  </span>
                  {q.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={answers.some(a => a === null)}
          style={{
            marginTop: 20,
            width: "100%",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: answers.some(a => a === null) ? "var(--ft-dim)" : "#000",
            background: answers.some(a => a === null) ? "var(--ft-raised)" : "var(--ft-accent)",
            border: `1px solid ${answers.some(a => a === null) ? "var(--ft-border)" : "transparent"}`,
            padding: "12px 0",
            cursor: answers.some(a => a === null) ? "default" : "pointer",
          }}
        >
          SUBMIT ANSWERS
        </button>
      )}

      {submitted && (
        <div style={{ marginTop: 16, padding: "14px 16px", background: passed ? "rgba(63,185,80,0.08)" : "rgba(248,81,73,0.08)", border: `1px solid ${passed ? "rgba(63,185,80,0.3)" : "rgba(248,81,73,0.3)"}`, textAlign: "center" as const }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: passed ? "var(--ft-green)" : "var(--ft-red)", marginBottom: 4 }}>
            {passed ? `✓ PASSED — ${score}/${questions.length} correct` : `✗ FAILED — ${score}/${questions.length} correct`}
          </div>
          {passed && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-amber)" }}>
              +{xp} XP EARNED
            </div>
          )}
          {!passed && (
            <div style={{ fontSize: 12, color: "var(--ft-muted)", marginTop: 4 }}>
              Review the lesson and try again — you need {Math.ceil(questions.length * 0.67)}/{questions.length} to earn XP.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Topic card ────────────────────────────────────────────────────────────────

function TopicCard({
  topic,
  isComplete,
  isLocked,
  totalXP,
  onStart,
}: {
  topic: TopicCard;
  isComplete: boolean;
  isLocked: boolean;
  totalXP: number;
  onStart: (id: string) => void;
}) {
  return (
    <div
      style={{
        background: "var(--ft-surface)",
        border: `1px solid ${isComplete ? "rgba(63,185,80,0.3)" : isLocked ? "var(--ft-border)" : "var(--ft-border)"}`,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        position: "relative" as const,
        opacity: isLocked ? 0.55 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {isComplete && (
        <div style={{ position: "absolute", top: 10, right: 10, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-green)" }}>✓</div>
      )}
      {isLocked && (
        <div style={{ position: "absolute", top: 10, right: 10, color: "var(--ft-dim)" }}>
          <Lock size={12} />
        </div>
      )}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontWeight: 700,
          color: isLocked ? "var(--ft-dim)" : "var(--ft-accent)",
          background: isLocked ? "var(--ft-raised)" : "rgba(245,158,11,0.1)",
          border: `1px solid ${isLocked ? "var(--ft-border)" : "rgba(245,158,11,0.2)"}`,
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {topic.icon}
      </div>
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)", marginBottom: 6, lineHeight: 1.2 }}>{topic.title}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" as const }}>
          <DiffBadge level={topic.difficulty} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-amber)", letterSpacing: "0.06em" }}>+{topic.xp} XP</span>
          {isLocked && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
              REQUIRES {topic.requiredXP} XP (you have {totalXP})
            </span>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--ft-dim)", lineHeight: 1.4, flex: 1 }}>{topic.hook}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
        {topic.steps.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 2, background: i === topic.steps.length - 1 ? "var(--ft-amber)" : "var(--ft-border)", borderRadius: 1 }} />
        ))}
      </div>
      <button
        onClick={() => !isLocked && onStart(topic.id)}
        disabled={isLocked}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: isLocked ? "var(--ft-dim)" : isComplete ? "var(--ft-green)" : "var(--ft-text)",
          background: isLocked ? "transparent" : isComplete ? "rgba(63,185,80,0.08)" : "var(--ft-raised)",
          border: `1px solid ${isLocked ? "var(--ft-border)" : isComplete ? "rgba(63,185,80,0.25)" : "var(--ft-border2)"}`,
          padding: "6px 14px",
          cursor: isLocked ? "not-allowed" : "pointer",
          alignSelf: "flex-start",
        }}
      >
        {isLocked ? "LOCKED" : isComplete ? "REVIEW →" : "START →"}
      </button>
    </div>
  );
}

// ── Lesson view ───────────────────────────────────────────────────────────────

function LessonView({
  topic,
  isComplete,
  onBack,
  onComplete,
}: {
  topic: TopicCard;
  isComplete: boolean;
  onBack: () => void;
  onComplete: (id: string) => void;
}) {
  const contentSteps = topic.steps.length - 1; // last step is the quiz
  const [currentStep, setCurrentStep] = useState(0);
  const [quizPassed, setQuizPassed] = useState(isComplete);

  const isQuizStep = currentStep === topic.steps.length - 1;

  function handleQuizPass() {
    setQuizPassed(true);
    onComplete(topic.id);
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", background: "none", border: "none", cursor: "pointer", padding: "0 0 16px" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-muted)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-dim)"; }}
      >
        ← BACK TO TOPICS
      </button>

      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--ft-border)", paddingBottom: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
          <DiffBadge level={topic.difficulty} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-amber)", letterSpacing: "0.06em" }}>+{topic.xp} XP</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
            {topic.steps.length - 1} steps + quiz
          </span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-text)", lineHeight: 1.2, marginBottom: 4 }}>{topic.title}</div>
        <div style={{ fontSize: 13, color: "var(--ft-muted)" }}>{topic.hook}</div>
      </div>

      {/* Step progress */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {topic.steps.map((label, i) => (
          <button
            key={i}
            onClick={() => setCurrentStep(i)}
            title={label}
            style={{
              flex: 1,
              height: 4,
              border: "none",
              cursor: "pointer",
              background: i < currentStep
                ? "var(--ft-green)"
                : i === currentStep
                ? (i === topic.steps.length - 1 ? "var(--ft-amber)" : "var(--ft-accent)")
                : "var(--ft-border)",
              transition: "background 0.2s",
              padding: 0,
            }}
          />
        ))}
      </div>

      {/* Step label */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isQuizStep ? "var(--ft-amber)" : "var(--ft-accent)", fontWeight: 700, letterSpacing: "0.08em" }}>
          {isQuizStep ? "STEP 4 · KNOWLEDGE CHECK" : `STEP ${currentStep + 1} · ${topic.steps[currentStep].toUpperCase()}`}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
          {currentStep + 1} / {topic.steps.length}
        </div>
      </div>

      {/* Step content */}
      {isQuizStep ? (
        <QuizView
          topicId={topic.id}
          xp={topic.xp}
          onPass={handleQuizPass}
        />
      ) : (
        <LessonStep id={topic.id} step={currentStep} />
      )}

      {/* Navigation */}
      {!isQuizStep && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28, gap: 8 }}>
          <button
            onClick={() => setCurrentStep(s => Math.max(0, s - 1))}
            disabled={currentStep === 0}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: currentStep === 0 ? "var(--ft-border)" : "var(--ft-muted)",
              background: "var(--ft-raised)",
              border: `1px solid ${currentStep === 0 ? "var(--ft-border)" : "var(--ft-border2)"}`,
              padding: "10px 20px",
              cursor: currentStep === 0 ? "default" : "pointer",
            }}
          >
            ← PREV
          </button>
          <button
            onClick={() => setCurrentStep(s => Math.min(topic.steps.length - 1, s + 1))}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#000",
              background: currentStep === contentSteps - 1 ? "var(--ft-amber)" : "var(--ft-accent)",
              border: "none",
              padding: "10px 20px",
              cursor: "pointer",
              flex: 1,
              maxWidth: 200,
            }}
          >
            {currentStep === contentSteps - 1 ? "TAKE QUIZ →" : "NEXT →"}
          </button>
        </div>
      )}

      {/* Already completed note */}
      {isQuizStep && quizPassed && !isComplete && (
        <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-green)", textAlign: "center" as const }}>
          ✓ XP awarded — return to topics to continue your path
        </div>
      )}
      {isQuizStep && isComplete && (
        <div style={{ marginTop: 12, padding: "10px 0", background: "rgba(63,185,80,0.05)", border: "1px solid rgba(63,185,80,0.2)", textAlign: "center" as const, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-green)" }}>
          ✓ ALREADY COMPLETED — +{topic.xp} XP EARNED
        </div>
      )}
    </div>
  );
}

// ── Level badge ───────────────────────────────────────────────────────────────

function LevelBadge({ xp }: { xp: number }) {
  const lvl = getLevel(xp);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: lvl.color, background: `${lvl.color}18`, border: `1px solid ${lvl.color}40`, padding: "1px 8px", letterSpacing: "0.1em" }}>
        {lvl.name}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ width: 80, height: 3, background: "var(--ft-border)" }}>
          <div style={{ height: "100%", width: `${lvl.progress}%`, background: lvl.color, transition: "width 400ms ease" }} />
        </div>
        {lvl.next && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
            {lvl.next.minXP - xp} XP to {lvl.next.name}
          </span>
        )}
      </div>
    </div>
  );
}

export function ThemeRewardsPanel({ totalXP }: { totalXP: number }) {
  const { theme, setTheme } = useFintrackTheme();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {THEME_REWARDS.map((reward) => {
        const unlocked = totalXP >= reward.requiredXP;
        const active = theme === reward.id;
        const rarityColor = RARITY_COLOR[reward.rarity];
        return (
          <div
            key={reward.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              background: active ? `${reward.accent}10` : unlocked ? "var(--ft-raised)" : "var(--ft-surface)",
              border: `1px solid ${active ? reward.accent : unlocked ? "var(--ft-border2)" : "var(--ft-border)"}`,
              opacity: unlocked ? 1 : 0.5,
              transition: "all 0.15s",
            }}
          >
            <div style={{ width: 28, height: 28, borderRadius: 4, background: reward.base, border: `2px solid ${reward.accent}`, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: unlocked ? reward.accent : "var(--ft-dim)" }}>{reward.label}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, letterSpacing: "0.1em", color: rarityColor, background: `${rarityColor}18`, border: `1px solid ${rarityColor}44`, padding: "1px 5px" }}>{reward.rarity}</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 1 }}>{reward.description}</div>
            </div>
            <div style={{ flexShrink: 0 }}>
              {unlocked ? (
                <button
                  onClick={() => setTheme(active ? "void" : reward.id)}
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
                    padding: "4px 10px",
                    border: `1px solid ${active ? reward.accent : "var(--ft-border2)"}`,
                    background: active ? reward.accent : "transparent",
                    color: active ? "#000" : "var(--ft-muted)",
                    cursor: "pointer", transition: "all 0.1s",
                  }}
                >{active ? "✓ ACTIVE" : "ACTIVATE"}</button>
              ) : (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 4 }}>
                  <Lock size={9} />
                  <span>{reward.requiredXP} XP</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function LearnTab() {
  const [completedIds, setCompletedIds] = useState<string[]>(() => loadProgress());
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category>("All");

  const totalXP = completedIds.reduce((sum, id) => {
    const topic = TOPICS.find((t) => t.id === id);
    return sum + (topic?.xp ?? 0);
  }, 0);

  const handleStart = useCallback((id: string) => setActiveLessonId(id), []);
  const handleBack = useCallback(() => setActiveLessonId(null), []);

  const handleComplete = useCallback((id: string) => {
    setCompletedIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      saveProgress(next);
      return next;
    });
  }, []);

  const activeTopicData = activeLessonId ? TOPICS.find((t) => t.id === activeLessonId) ?? null : null;

  const filteredTopics = selectedCategory === "All"
    ? TOPICS
    : TOPICS.filter((t) => t.category === selectedCategory);

  // When "All" is selected, group by category for section headers
  const categoryGroups = selectedCategory === "All"
    ? (CATEGORIES.slice(1) as string[]).map(cat => ({
        label: cat,
        topics: TOPICS.filter(t => t.category === cat),
      })).filter(g => g.topics.length > 0)
    : null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid var(--ft-border)", flexWrap: "wrap" as const, gap: 8 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.1em", marginBottom: 4 }}>FINANCIAL EDUCATION</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>{completedIds.length} of {TOPICS.length} topics completed</div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ft-amber)" }}>{totalXP}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>XP TOTAL</span>
          </div>
          <LevelBadge xp={totalXP} />
        </div>
      </div>

      {activeTopicData ? (
        <LessonView
          topic={activeTopicData}
          isComplete={completedIds.includes(activeTopicData.id)}
          onBack={handleBack}
          onComplete={handleComplete}
        />
      ) : (
        <>
          {/* Category filter bar */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 16 }}>
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: isSelected ? "#000" : "var(--ft-dim)",
                    background: isSelected ? "var(--ft-accent)" : "var(--ft-raised)",
                    border: `1px solid ${isSelected ? "transparent" : "var(--ft-border)"}`,
                    padding: "4px 10px",
                    cursor: "pointer",
                    transition: "all 0.1s",
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Topic grid — grouped when "All" selected */}
          {categoryGroups ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {categoryGroups.map((group) => (
                <div key={group.label}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      color: "var(--ft-accent)",
                    }}>{group.label.toUpperCase()}</span>
                    <div style={{ flex: 1, height: 1, background: "var(--ft-border)" }} />
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      color: "var(--ft-dim)",
                    }}>
                      {group.topics.filter(t => completedIds.includes(t.id)).length}/{group.topics.length}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                    {group.topics.map((topic) => (
                      <TopicCard
                        key={topic.id}
                        topic={topic}
                        isComplete={completedIds.includes(topic.id)}
                        isLocked={totalXP < topic.requiredXP}
                        totalXP={totalXP}
                        onStart={handleStart}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {filteredTopics.map((topic) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  isComplete={completedIds.includes(topic.id)}
                  isLocked={totalXP < topic.requiredXP}
                  totalXP={totalXP}
                  onStart={handleStart}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
