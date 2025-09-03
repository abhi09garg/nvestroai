// services/advisorService.js
import axios from "axios";
import NodeCache from "node-cache";
import yahooFinance from "yahoo-finance2";
import OpenAI from "openai";

const cacheTTL = Number(process.env.CACHE_TTL_SEC || 300);
const cache = new NodeCache({ stdTTL: cacheTTL, checkperiod: 60 });

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

/* -----------------------
  Helpers: data fetchers
   - Stocks/ETFs: yahoo-finance2
   - Crypto: CoinGecko public API
   - News headlines: NewsAPI
-------------------------*/

async function fetchStockQuote(symbol) {
  const key = `quote:${symbol}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const q = await yahooFinance.quote(symbol);
    cache.set(key, q);
    return q;
  } catch (err) {
    console.warn("fetchStockQuote error", symbol, err.message);
    return null;
  }
}

async function fetchHistory(symbol, periodDays = 365) {
  const key = `hist:${symbol}:${periodDays}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const to = new Date();
    const from = new Date(Date.now() - periodDays * 24 * 3600 * 1000);
    const hist = await yahooFinance.historical(symbol, { period1: from.toISOString().split("T")[0], period2: to.toISOString().split("T")[0], interval: "1d" });
    cache.set(key, hist);
    return hist;
  } catch (err) {
    console.warn("fetchHistory error", symbol, err.message);
    return [];
  }
}

async function fetchCryptoPrice(ids = ["bitcoin", "ethereum"]) {
  const key = `cg:${ids.join(",")}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price`;
    const res = await axios.get(url, { params: { ids: ids.join(","), vs_currencies: "usd", include_24hr_change: "true" } });
    cache.set(key, res.data);
    return res.data;
  } catch (err) {
    console.warn("fetchCryptoPrice error", err.message);
    return {};
  }
}

async function fetchNewsHeadlines(query = "market OR stocks OR economy", pageSize = 10) {
  const key = `news:${query}:${pageSize}`;
  if (cache.has(key)) return cache.get(key);
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) return [];
  try {
    const res = await axios.get("https://newsapi.org/v2/top-headlines", { params: { q: query, language: "en", pageSize, apiKey } });
    const headlines = (res.data.articles || []).map(a => `${a.title} ${a.description || ""}`.trim()).slice(0, pageSize);
    cache.set(key, headlines);
    return headlines;
  } catch (err) {
    console.warn("fetchNewsHeadlines error", err.message);
    return [];
  }
}

/* -----------------------
  Helpers: signal calculations
-------------------------*/

function movingAverage(arr, n) {
  if (!arr || arr.length < n) return null;
  const slice = arr.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function computeValuationScore(quote) {
  // Stocks: lower P/E better; Crypto: market cap; Bond: yield higher better
  if (!quote) return 50;
  if (quote.trailingPE) {
    const pe = quote.trailingPE;
    if (pe <= 10) return 90;
    if (pe <= 15) return 75;
    if (pe <= 25) return 55;
    return 30;
  }
  if (quote.marketCap) {
    const mc = quote.marketCap;
    if (mc >= 1e11) return 70;
    if (mc >= 1e9) return 55;
    return 35;
  }
  if (quote.yield) {
    return quote.yield >= 4 ? 75 : 55;
  }
  return 50;
}

function computeMomentumScore(historyCloses) {
  // Use SMA50 vs SMA200 ratio
  if (!historyCloses || historyCloses.length < 60) return 50;
  const sma50 = movingAverage(historyCloses, 50);
  const sma200 = movingAverage(historyCloses, 200) || movingAverage(historyCloses, Math.min(200, historyCloses.length));
  if (!sma50 || !sma200) return 50;
  return sma50 > sma200 ? 80 : 35;
}

function computeRiskScore(quote, historyCloses) {
  // Higher beta or volatility => lower risk score (scale to 0..100)
  if (quote && quote.beta) {
    const beta = quote.beta;
    if (beta < 0.8) return 80;
    if (beta < 1.2) return 60;
    return 35;
  }
  if (!historyCloses || historyCloses.length < 20) return 50;
  const last20 = historyCloses.slice(-20);
  const mean = last20.reduce((a, b) => a + b, 0) / last20.length;
  const variance = last20.reduce((a, b) => a + (b - mean) ** 2, 0) / last20.length;
  const vol = Math.sqrt(variance);
  // normalize roughly: vol / mean
  const relVol = vol / Math.max(1, mean);
  if (relVol < 0.005) return 80;
  if (relVol < 0.02) return 60;
  return 35;
}

/* -----------------------
  AI-driven sentiment
  uses OpenAI to convert headlines -> numeric 0..100
-------------------------*/
async function gptSentimentScore(headlines) {
  if (!openai) {
    // fallback: simple neutral
    return 50;
  }
  if (!headlines || headlines.length === 0) return 50;

  const prompt = `You are a financial sentiment model. Given these headlines about markets and sectors, return a single numeric sentiment score 0-100 where 0 is extremely bearish, 50 neutral, 100 extremely bullish. Headlines:\n\n${headlines.join("\n")}\n\nRespond with the number only.`;
  try {
    // Use responses.create text output to be robust across SDK versions
    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      temperature: 0
    });
    const text = resp.output_text ?? (Array.isArray(resp.output) ? resp.output.map(x => x.content?.map(c=>c.text).join("")).join("") : "");
    const numMatch = text.match(/([0-9]{1,3}(\.[0-9]+)?)/);
    if (!numMatch) return 50;
    const n = parseFloat(numMatch[1]);
    return Math.max(0, Math.min(100, n));
  } catch (err) {
    console.warn("gptSentimentScore error", err.message);
    return 50;
  }
}

/* -----------------------
  Scoring combine & allocation
-------------------------*/
function weightedConfidence(valuation, momentum, risk, sentiment) {
  // Tunable weights
  const wVal = 0.35, wMom = 0.25, wRisk = 0.2, wSent = 0.2;
  const score = wVal * valuation + wMom * momentum + wRisk * risk + wSent * sentiment;
  return Math.round(score);
}

function adviceCategory(confidence) {
  if (confidence >= 80) return "Strong Buy";
  if (confidence >= 60) return "Buy";
  if (confidence >= 45) return "Hold";
  return "Sell";
}

/* -----------------------
  Portfolio allocation routine (rule-based optimizer)
  - Start with base allocation by riskTolerance & age
  - Tilt allocations by sector signals (sectorDelta)
  - Normalize
-------------------------*/
function baseAllocationFromProfile(profile) {
  const risk = (profile.riskTolerance || "medium").toLowerCase();
  let base = { stocks: 50, bonds: 30, etfs: 10, crypto: 5, cash: 5 };
  if (risk === "low") base = { stocks: 30, bonds: 55, etfs: 10, crypto: 2, cash: 3 };
  if (risk === "high") base = { stocks: 65, bonds: 10, etfs: 10, crypto: 10, cash: 5 };
  // age tilt
  if (profile.age >= 60) { base.stocks = Math.max(10, base.stocks - 15); base.bonds = Math.min(80, base.bonds + 15); }
  if (profile.age <= 30) { base.stocks = Math.min(95, base.stocks + 10); base.cash = Math.max(0, base.cash - 5); }
  return base;
}

function applySectorTilts(baseAlloc, sectorSignals) {
  // sectorSignals: {stocks: delta, bonds: delta, crypto: delta, real_estate: delta, ...} deltas are -1..1
  const alloc = {...baseAlloc};
  // apply tilts proportional to confidence
  Object.keys(sectorSignals || {}).forEach(k => {
    const delta = sectorSignals[k];
    if (!delta) return;
    // map delta (-1..1) to -5..5 percent tilt
    const pct = Math.round(delta * 5);
    if (k === "stocks") alloc.stocks = Math.max(0, alloc.stocks + pct);
    if (k === "bonds") alloc.bonds = Math.max(0, alloc.bonds + pct);
    if (k === "crypto") alloc.crypto = Math.max(0, alloc.crypto + pct);
    if (k === "real_estate") alloc.etfs = Math.max(0, alloc.etfs + pct);
  });
  // normalize
  const numericKeys = Object.keys(alloc).filter(k => typeof alloc[k] === "number");
  const total = numericKeys.reduce((s,k)=>s+alloc[k],0) || 1;
  numericKeys.forEach(k => alloc[k] = Math.round((alloc[k]/total)*100));
  // final correction
  const diff = 100 - numericKeys.reduce((s,k)=>s+alloc[k],0);
  if (diff !== 0) alloc.stocks = alloc.stocks + diff;
  return alloc;
}

/* -----------------------
  Top-level orchestrator
-------------------------*/

export async function generateRecommendation(profile) {
  // profile: { age, income, riskTolerance, investmentHorizon, preferences }
  // 1) Base allocation
  const base = baseAllocationFromProfile(profile);

  // 2) Define the asset list / sectors we'll probe
  // For MVP we'll probe broad tickers to derive sector signals:
  const sectorTickers = {
    stocks: ["SPY"],            // broad US equities
    bonds: ["BND"],             // aggregate bond ETF
    crypto: ["BTC-USD","ETH-USD"], // using yahoo symbols for crypto
    real_estate: ["VNQ"],       // REIT ETF
    tech: ["XLK"],              // tech ETF
    energy: ["XLE"],           // energy ETF
    healthcare: ["XLV"]
  };

  // 3) For each ticker: fetch quote + history + compute scores
  const sectorScores = {};    // overall sector scores
  const sectorDetails = {};   // detailed ticker scores

for (const [assetClass, sectorsOrTickers] of Object.entries(sectorTickers)) {
  sectorScores[assetClass] = {};
  sectorDetails[assetClass] = {};

  if (assetClass === "stocks") {
    // Loop per sector
    for (const [sector, tickers] of Object.entries(sectorsOrTickers)) {
      const perTickerScores = [];
      sectorDetails[assetClass][sector] = [];

      for (const t of tickers) {
        let quote = null;
        let history = [];
        try {
          quote = await fetchStockQuote(t);
          history = (await fetchHistory(t, 365)).map(h => h.close).filter(x => typeof x === "number");
        } catch {}
        
        const valuation = computeValuationScore(quote);
        const momentum = computeMomentumScore(history);
        const risk = computeRiskScore(quote, history);
        const headlines = await fetchNewsHeadlines(t, 4);
        const sentiment = await gptSentimentScore(headlines);
        const confidence = weightedConfidence(valuation, momentum, risk, sentiment);

        perTickerScores.push(confidence);
        sectorDetails[assetClass][sector].push({
          ticker: t,
          quote: { price: quote?.regularMarketPrice, pe: quote?.trailingPE, marketCap: quote?.marketCap },
          valuation, momentum, risk, sentiment, confidence
        });
      }

      // Average confidence per sector
      sectorScores[assetClass][sector] = perTickerScores.length
        ? Math.round(perTickerScores.reduce((a, b) => a + b, 0) / perTickerScores.length)
        : 50;
    }
  } else {
    // bonds / crypto
    const tickers = sectorsOrTickers;
    const perTickerScores = [];
    sectorDetails[assetClass] = [];
    for (const t of tickers) {
      let quote = null;
      let history = [];
      try {
        quote = await fetchStockQuote(t);
        history = (await fetchHistory(t, 365)).map(h => h.close).filter(x => typeof x === "number");
      } catch {}

      const valuation = computeValuationScore(quote);
      const momentum = computeMomentumScore(history);
      const risk = computeRiskScore(quote, history);
      const headlines = await fetchNewsHeadlines(t, 4);
      const sentiment = await gptSentimentScore(headlines);
      const confidence = weightedConfidence(valuation, momentum, risk, sentiment);

      perTickerScores.push(confidence);
      sectorDetails[assetClass].push({
        ticker: t,
        quote: { price: quote?.regularMarketPrice, pe: quote?.trailingPE, marketCap: quote?.marketCap },
        valuation, momentum, risk, sentiment, confidence
      });
    }
    sectorScores[assetClass] = perTickerScores.length
      ? Math.round(perTickerScores.reduce((a, b) => a + b, 0) / perTickerScores.length)
      : 50;
  }
}


  // 4) Create simple sector signal (-1..1) by mapping sectorScores to delta
  const sectorSignals = {};
  Object.entries(sectorScores).forEach(([s, val]) => {
    // map 0..100 to -1..1 (centered at 50)
    sectorSignals[s] = (val - 50) / 50;
  });

  // 5) Tilt base allocation by aggregated sector signals (map sectors -> allocation keys)
  const mappedSignals = {
    stocks: sectorSignals.stocks || 0,
    bonds: sectorSignals.bonds || 0,
    crypto: sectorSignals.crypto || 0,
    real_estate: sectorSignals.real_estate || 0
    // additional mapping can exist
  };
  const finalAllocation = applySectorTilts(base, mappedSignals);

  // 6) Compute a portfolio-level confidence (average of sector confidences weighted by allocation)
  let overallConfidence = 0;
  let weightSum = 0;
  Object.keys(finalAllocation).forEach(k => {
    const allocPct = finalAllocation[k] || 0;
    let sectorKey = k;
    if (k === "etfs" && sectorScores.stocks) sectorKey = "stocks";
    if (k === "crypto") sectorKey = "crypto";
    const sectorScore = sectorScores[sectorKey] ?? 50;
    overallConfidence += (allocPct / 100) * sectorScore;
    weightSum += allocPct;
  });
  overallConfidence = Math.round(overallConfidence || 50);

  // 7) Human explanation via OpenAI (optional but helpful)
  let explanation = `Rule-based explanation: base -> final allocation with data-driven tilts.`;
  if (openai) {
    const headlinesAggregate = [].concat(...Object.keys(sectorTickers).map(s => {
      // flattens the per-sector headlines from earlier (we have small sets when fetched)
      // but for safety we do another short news fetch aggregated
      return [];
    }));
    // build a concise prompt
    const prompt = `
You are a professional financial advisor. Given this user profile:
${JSON.stringify(profile, null, 2)}

Base allocation: ${JSON.stringify(base)}
Final allocation: ${JSON.stringify(finalAllocation)}
Sector scores (0..100): ${JSON.stringify(sectorScores)}

Explain (2-4 sentences) why the final allocation differs from the base, referencing market and news signals in plain language. Do NOT recommend individual stocks.
Return plain text only.
    `;
    try {
      const resp = await openai.responses.create({
        model: "gpt-4o-mini",
        input: prompt,
        temperature: 0.1
      });
      explanation = resp.output_text ?? explanation;
    } catch (err) {
      console.warn("OpenAI explain error:", err.message);
    }
  }

  // 8) Return structured result
  return {
    profile,
    baseAllocation: base,
    finalAllocation,
    sectorScores,
    sectorDetails,
    overallConfidence,
    advice: adviceFromConfidence(overallConfidence),
    explanation
  };
}

/* Helper: advice text from overallConfidence */
function adviceFromConfidence(conf) {
  if (conf >= 80) return "Strongly Tilt Towards Growth / Stocks";
  if (conf >= 60) return "Moderate Growth Tilt";
  if (conf >= 45) return "Balanced / Hold";
  return "Conservative / Tilt to Bonds & Cash";
}
