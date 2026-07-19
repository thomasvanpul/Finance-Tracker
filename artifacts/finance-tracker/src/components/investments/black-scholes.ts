// Black-Scholes option pricing model with full Greeks
// Abramowitz & Stegun rational approximation for the normal CDF (maximum error: 7.5e-8)

function normCDF(x: number): number {
  const a1 = 0.319381530;
  const a2 = -0.356563782;
  const a3 = 1.781477937;
  const a4 = -1.821255978;
  const a5 = 1.330274429;
  const p = 0.2316419;
  const sign = x >= 0 ? 1 : -1;
  const z = Math.abs(x);
  const t = 1 / (1 + p * z);
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  const cdf = 1 - normPDF(z) * poly;
  return 0.5 + sign * (cdf - 0.5);
}

function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface BlackScholesResult {
  callPrice: number;
  putPrice: number;
  d1: number;
  d2: number;
  /** Call delta: ΔCall/ΔS */
  callDelta: number;
  /** Put delta: ΔPut/ΔS (negative) */
  putDelta: number;
  /** Gamma: Δ²V/ΔS² (same for calls and puts) */
  gamma: number;
  /** Vega per 1% move in implied volatility */
  vega: number;
  /** Call theta per calendar day */
  callTheta: number;
  /** Put theta per calendar day */
  putTheta: number;
  /** Call rho per 1% move in risk-free rate */
  callRho: number;
  /** Put rho per 1% move in risk-free rate */
  putRho: number;
}

/**
 * Compute Black-Scholes price and Greeks for European calls and puts.
 *
 * @param S - Current underlying price
 * @param K - Strike price
 * @param T - Time to expiry in years
 * @param r - Risk-free rate (decimal, e.g. 0.05 for 5%)
 * @param sigma - Implied volatility (decimal, e.g. 0.20 for 20%)
 */
export function blackScholes(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number
): BlackScholesResult {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    const intrinsicCall = Math.max(0, S - K);
    const intrinsicPut = Math.max(0, K - S);
    return {
      callPrice: intrinsicCall,
      putPrice: intrinsicPut,
      d1: 0,
      d2: 0,
      callDelta: S > K ? 1 : 0,
      putDelta: S < K ? -1 : 0,
      gamma: 0,
      vega: 0,
      callTheta: 0,
      putTheta: 0,
      callRho: 0,
      putRho: 0,
    };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const Nd1 = normCDF(d1);
  const Nd2 = normCDF(d2);
  const NNd1 = normCDF(-d1);
  const NNd2 = normCDF(-d2);

  const discountFactor = Math.exp(-r * T);

  const callPrice = S * Nd1 - K * discountFactor * Nd2;
  const putPrice = K * discountFactor * NNd2 - S * NNd1;

  // Greeks
  const callDelta = Nd1;
  const putDelta = Nd1 - 1; // = -N(-d1)

  const gamma = normPDF(d1) / (S * sigma * sqrtT);

  // Vega per 1% vol move (raw vega is per unit, divide by 100 for per-1%)
  const vegaRaw = S * normPDF(d1) * sqrtT;
  const vega = vegaRaw / 100;

  // Theta: annualised theta / 365 to get per-calendar-day
  const thetaCallAnnual =
    -(S * normPDF(d1) * sigma) / (2 * sqrtT) -
    r * K * discountFactor * Nd2;
  const thetaPutAnnual =
    -(S * normPDF(d1) * sigma) / (2 * sqrtT) +
    r * K * discountFactor * NNd2;

  const callTheta = thetaCallAnnual / 365;
  const putTheta = thetaPutAnnual / 365;

  // Rho per 1% interest-rate move
  const callRho = (K * T * discountFactor * Nd2) / 100;
  const putRho = (-K * T * discountFactor * NNd2) / 100;

  return {
    callPrice,
    putPrice,
    d1,
    d2,
    callDelta,
    putDelta,
    gamma,
    vega,
    callTheta,
    putTheta,
    callRho,
    putRho,
  };
}

/** Intrinsic value of an option (the in-the-money component). */
export function intrinsicValue(type: "call" | "put", S: number, K: number): number {
  return type === "call" ? Math.max(0, S - K) : Math.max(0, K - S);
}

/** Time value = total option price minus intrinsic value. */
export function timeValue(optionPrice: number, intrinsic: number): number {
  return Math.max(0, optionPrice - intrinsic);
}

/**
 * Graham Number — Benjamin Graham's conservative fair-value estimate.
 * sqrt(22.5 × EPS × BVPS)
 */
export function grahamNumber(eps: number, bvps: number): number {
  if (eps <= 0 || bvps <= 0) return 0;
  return Math.sqrt(22.5 * eps * bvps);
}

/**
 * DCF Intrinsic Value — projects EPS for 10 years at growthRate,
 * applies terminal P/E multiple at year 10, discounts back at discountRate.
 * @param eps - Current earnings per share
 * @param growthRate - Annual growth rate as decimal (e.g. 0.12 = 12%)
 * @param discountRate - Discount rate as decimal (e.g. 0.10 = 10%)
 * @param terminalPe - Terminal price-to-earnings multiple
 */
export function dcfValue(
  eps: number,
  growthRate: number,
  discountRate: number,
  terminalPe: number
): number {
  if (eps <= 0 || discountRate <= 0) return 0;
  let projectedEps = eps;
  for (let i = 0; i < 10; i++) {
    projectedEps *= 1 + growthRate;
  }
  const terminalValue = projectedEps * terminalPe;
  const presentValue = terminalValue / Math.pow(1 + discountRate, 10);
  return Math.max(0, Math.round(presentValue * 100) / 100);
}
