import { GoogleGenAI, Schema, Type } from "@google/genai";
import { ChartAnalysis, SimulationResult, MarketData, GhostCandle, BacktestResult } from "../types";
import { MODEL_NAME } from "../constants";

// Declare process to avoid TypeScript build errors
declare var process: {
  env: {
    API_KEY?: string;
    [key: string]: string | undefined;
  };
};

const getApiKey = (): string => {
  if (process.env.API_KEY) return process.env.API_KEY;
  try {
    // @ts-ignore
    const viteEnv = import.meta.env;
    if (viteEnv) {
      return viteEnv.VITE_API_KEY || viteEnv.API_KEY || "";
    }
  } catch (e) {
    // Ignore
  }
  return "";
};

const getClient = () => {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("API Key is missing. Simulation will likely fail.");
  }
  return new GoogleGenAI({ apiKey: apiKey });
};

// --- UTILITIES ---

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const withTimeout = <T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
  let timer: any;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`⏱️ TIMEOUT: ${errorMessage}`));
    }, ms);
  });

  return Promise.race([
    promise.then(res => { clearTimeout(timer); return res; }),
    timeout
  ]);
};

type StatusCallback = (msg: string) => void;

// --- OFFLINE FALLBACK GENERATORS ---
// Used when API quota is exhausted (RPD Limits)

const generateOfflineAnalysis = (): ChartAnalysis => {
  return {
    ticker: "OFFLINE-ASSET",
    trend: "SIDEWAYS (SIMULATED)",
    technical_summary: "⚠️ NETWORK SEVERED. RUNNING LOCAL SIMULATION.\n\nSince the neural link is down, we are projecting a neutral tactical pattern. Support and resistance are estimated based on standard deviation.",
    support_resistance: "SUP: 100.00 | RES: 105.00 (LOCAL)",
    key_levels: {
      support: 100,
      resistance: 105
    }
  };
};

const generateOfflineSimulation = (lastPrice: number = 100, scenario: string): SimulationResult => {
  const candles: GhostCandle[] = [];
  let currentClose = lastPrice;
  
  // Simple Random Walk with drift based on scenario
  let drift = 0;
  if (scenario.includes("Hike") || scenario.includes("Recession")) drift = -0.5;
  if (scenario.includes("Cut") || scenario.includes("Breakthrough")) drift = 0.5;

  for (let i = 1; i <= 10; i++) {
    const volatility = currentClose * 0.02; // 2% volatility
    const change = (Math.random() - 0.5) * volatility + drift;
    
    const open = currentClose;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * (volatility / 2);
    const low = Math.min(open, close) - Math.random() * (volatility / 2);
    
    currentClose = close;
    
    candles.push({ day: i, open, high, low, close });
  }

  return {
    analysis: `[OFFLINE PROTOCOL ACTIVE]\nSimulating trajectory for scenario: "${scenario}".\n\nCalculated via local volatility algorithms due to network silence.`,
    ghost_candles: candles
  };
};

// --- CORE SERVICE ---

async function callWithRetry<T>(
  fn: () => Promise<T>, 
  retries = 2, // Low retries, we want to fail to fallback if blocked
  delay = 2000, 
  context = "API Call",
  onUpdate?: StatusCallback
): Promise<T> {
  try {
    return await withTimeout(fn(), 15000, `${context} took too long.`);
  } catch (error: any) {
    const msg = error?.message || "";
    const status = error?.status;
    
    // Check for Hard Quota Limits (Daily Limit)
    const isQuotaExhausted = msg.includes("429") || msg.includes("quota") || msg.includes("per day");

    if (isQuotaExhausted) {
      console.warn(`⚠️ QUOTA EXHAUSTED for ${context}. Switching to fallback.`);
      throw new Error("QUOTA_EXHAUSTED"); // Throw specific error to be caught by caller
    }

    const isTransient = msg.includes("fetch failed") || msg.includes("503");
    
    if (isTransient && retries > 0) {
      const nextDelay = delay + 1000;
      if (onUpdate) onUpdate(`⚠️ RETRYING ${context}... (${retries})`);
      await wait(nextDelay);
      return callWithRetry(fn, retries - 1, nextDelay, context, onUpdate);
    }

    throw error;
  }
}

const cleanJsonString = (text: string): string => {
  return text.replace(/```json|```/g, '').trim();
};

// --- SCHEMAS ---

const ANALYSIS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    ticker: { type: Type.STRING },
    technical_summary: { type: Type.STRING },
    trend: { type: Type.STRING },
    support_resistance: { type: Type.STRING },
    key_levels: {
      type: Type.OBJECT,
      properties: {
        support: { type: Type.NUMBER },
        resistance: { type: Type.NUMBER }
      },
      required: ["support", "resistance"]
    }
  },
  required: ["technical_summary", "trend", "support_resistance", "key_levels"],
};

const SIMULATION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    analysis: { type: Type.STRING },
    ghost_candles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          day: { type: Type.NUMBER },
          open: { type: Type.NUMBER },
          high: { type: Type.NUMBER },
          low: { type: Type.NUMBER },
          close: { type: Type.NUMBER },
        },
        required: ["day", "open", "high", "low", "close"]
      },
    },
  },
  required: ["analysis", "ghost_candles"],
};

const BACKTEST_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.NUMBER },
    critique: { type: Type.STRING }
  },
  required: ["score", "critique"],
};

// --- API FUNCTIONS ---

export const analyzeChart = async (imageBase64: string, onUpdate?: StatusCallback): Promise<ChartAnalysis> => {
  const client = getClient();
  const base64Data = imageBase64.split(',')[1] || imageBase64;

  const prompt = `
  **ROLE:** Expert Technical Analyst.
  **TASK:** Analyze chart. Identify Ticker, Trend, Levels.
  **FORMAT:** JSON only.
  `;

  try {
    return await callWithRetry(async () => {
      const response = await client.models.generateContent({
        model: MODEL_NAME,
        contents: {
          parts: [
            { inlineData: { mimeType: "image/png", data: base64Data } },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: ANALYSIS_SCHEMA,
          temperature: 0.2, 
        },
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI.");
      return JSON.parse(cleanJsonString(text)) as ChartAnalysis;
    }, 2, 2000, "Chart Analysis", onUpdate);
  } catch (error: any) {
    if (error.message === "QUOTA_EXHAUSTED") {
      if (onUpdate) onUpdate("⚠️ API LIMIT HIT. ACTIVATING OFFLINE PROTOCOL.");
      await wait(1000); // Fake delay for realism
      return generateOfflineAnalysis();
    }
    throw error;
  }
};

export const fetchMarketContext = async (ticker: string, technicalContext?: string, onUpdate?: StatusCallback): Promise<MarketData> => {
  const client = getClient();
  const today = new Date().toDateString();
  
  const prompt = `
  **DATE:** ${today}. Ticker: "${ticker}".
  Get price & 3 headlines.
  Output: Summary | Headlines list.
  `;

  try {
    return await callWithRetry(async () => {
        const response = await client.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
        });

        const fullText = response.text || "No data.";
        const lines = fullText.split('\n').filter(l => l.length > 5);
        const summary = lines[0] || "Data unavailable";
        const headlines = lines.slice(1, 4).map(l => l.replace(/^[*\-•]/, '').trim());
        
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const sources = chunks
        .map((chunk: any) => chunk.web)
        .filter((web: any) => web?.uri && web?.title)
        .map((web: any) => ({ title: web.title, uri: web.uri }));

        return { summary, headlines, sources };
    }, 1, 2000, "Market Intel", onUpdate);
    
  } catch (error) {
    // Market data fails silently to offline mode or empty
    console.warn("Market data skipped:", error);
    return { summary: "⚠️ OFFLINE: Market Data Unavailable.", headlines: ["System Offline"], sources: [] };
  }
};

export const runSimulation = async (
  imageBase64: string,
  currentAnalysis: ChartAnalysis,
  scenario: string,
  marketData?: MarketData,
  manualTicker?: string,
  onUpdate?: StatusCallback
): Promise<SimulationResult> => {
  const client = getClient();
  const base64Data = imageBase64.split(',')[1] || imageBase64;
  const isBaseline = scenario === "BASELINE_PREDICTION";
  const effectiveTicker = manualTicker || currentAnalysis.ticker || "Asset";

  const prompt = `
  **ROLE:** Financial Oracle.
  **CONTEXT:** ${effectiveTicker} | ${currentAnalysis.trend}.
  **SCENARIO:** ${isBaseline ? "Natural Move" : scenario}
  **TASK:** 10 Ghost Candles JSON.
  `;

  try {
    return await callWithRetry(async () => {
      const response = await client.models.generateContent({
        model: MODEL_NAME,
        contents: {
          parts: [
            { inlineData: { mimeType: "image/png", data: base64Data } },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: SIMULATION_SCHEMA,
          temperature: 0.5,
        },
      });

      const text = response.text;
      if (!text) throw new Error("No simulation data.");
      return JSON.parse(cleanJsonString(text)) as SimulationResult;
    }, 2, 2000, "Simulation", onUpdate);
  } catch (error: any) {
    if (error.message === "QUOTA_EXHAUSTED") {
      if (onUpdate) onUpdate("⚠️ API LIMIT HIT. RUNNING OFFLINE SIMULATION.");
      await wait(1000);
      // Use last known levels or default
      const startPrice = currentAnalysis.key_levels?.support || 100;
      return generateOfflineSimulation(startPrice, scenario);
    }
    throw error;
  }
};

export const calculateBacktestScore = async (
  predictedCandles: GhostCandle[],
  resultImageBase64: string,
  scenario: string,
  onUpdate?: StatusCallback
): Promise<BacktestResult> => {
  const client = getClient();
  const base64Data = resultImageBase64.split(',')[1] || resultImageBase64;

  const prompt = `
  **ROLE:** Judge.
  **TASK:** Compare Prediction vs Image.
  **RETURN:** JSON {score, critique}.
  `;

  try {
    return await callWithRetry(async () => {
      const response = await client.models.generateContent({
        model: MODEL_NAME,
        contents: {
          parts: [
            { inlineData: { mimeType: "image/png", data: base64Data } },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: BACKTEST_SCHEMA,
          temperature: 0.1,
        },
      });

      const text = response.text;
      if (!text) throw new Error("Judge silent.");
      const result = JSON.parse(cleanJsonString(text));
      return {
        score: result.score,
        critique: result.critique,
        timestamp: Date.now()
      };
    }, 2, 2000, "Backtest", onUpdate);
  } catch (error: any) {
    if (error.message === "QUOTA_EXHAUSTED") {
      return {
        score: 50,
        critique: "OFFLINE: Cannot verify image visually. Neutral score assigned.",
        timestamp: Date.now()
      };
    }
    throw error;
  }
};