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

// --- UTILITIES FOR RATE LIMIT HANDLING ---

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executes an API call with smart retries for Rate Limits (429).
 * Uses Exponential Backoff: Waits 2s, then 4s, then 8s before failing.
 */
async function callWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000, context = "API Call"): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const msg = error?.message || "";
    const status = error?.status;
    const isRateLimit = status === 429 || msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");

    if (isRateLimit && retries > 0) {
      console.warn(`⚠️ ${context} hit Rate Limit (429). Cooling down for ${delay}ms... (Attempts left: ${retries})`);
      await wait(delay);
      // Retry with double the delay
      return callWithRetry(fn, retries - 1, delay * 2, context);
    }

    // If strictly an API Key error, fail fast
    if (msg.includes("API Key")) {
      throw new Error("⚠️ AUTH FAILURE: Invalid or Missing API Key.");
    }

    // If out of retries or other error, throw
    if (isRateLimit) {
       throw new Error(`⚠️ SYSTEM OVERLOAD: Maximum retries exceeded. The network is too congested. Please wait 1-2 minutes.`);
    }

    throw error;
  }
}

// Helper to clean JSON string from Markdown code blocks
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

export const analyzeChart = async (imageBase64: string): Promise<ChartAnalysis> => {
  const client = getClient();
  const base64Data = imageBase64.split(',')[1] || imageBase64;

  const prompt = `
  **ROLE:** Expert Technical Analyst (The Observer).
  **TASK:** Analyze financial chart.
  1. IDENTIFY TICKER (e.g. BTC, TSLA). If unclear, return NULL.
  2. Identify Trend.
  3. Key Support/Resistance levels (numeric & descriptive).
  4. Technical Summary (Narrative of buyers/sellers).
  Return JSON.
  `;

  return callWithRetry(async () => {
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
    if (!text) throw new Error("Observer failed to respond.");
    return JSON.parse(cleanJsonString(text)) as ChartAnalysis;
  }, 3, 2500, "Chart Analysis"); 
};

export const fetchMarketContext = async (ticker: string, technicalContext?: string): Promise<MarketData> => {
  const client = getClient();
  const today = new Date().toDateString();
  
  const prompt = `
  **DATE:** ${today}. Ticker: "${ticker}".
  Find ABSOLUTE LATEST market news (Last 24-48h preferred, Max 7 days).
  Context: "${technicalContext || ''}".
  Tasks:
  1. Live price & % change.
  2. Top 3 FRESH headlines.
  Output: Summary sentence. Then "---HEADLINES---". Then list 3 headlines.
  `;

  try {
    // We do NOT use the heavy retry logic here to save quota if it fails. 
    // Market data is optional.
    const response = await client.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });

    const fullText = response.text || "No market data found.";
    const parts = fullText.split("---HEADLINES---");
    const summary = parts[0] ? parts[0].trim() : "Market data unavailable.";
    const headlinesRaw = parts[1] || "";
    
    const headlines = headlinesRaw
      .split('\n')
      .map(line => line.trim().replace(/^[-*•]\s*/, '')) 
      .filter(line => line.length > 0)
      .slice(0, 3); 
    
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .map((chunk: any) => chunk.web)
      .filter((web: any) => web?.uri && web?.title)
      .map((web: any) => ({ title: web.title, uri: web.uri }));

    return { summary, headlines, sources };
  } catch (error: any) {
    console.warn("Scout failed:", error);
    // Graceful fallback for rate limits on this specific optional call
    if (error?.status === 429 || error?.message?.includes("429")) {
        return { summary: "⚠️ Intel Network Congested (Rate Limit)", headlines: ["Try refreshing news manually in 30s."], sources: [] };
    }
    return { summary: "Market data unavailable.", headlines: [], sources: [] };
  }
};

export const runSimulation = async (
  imageBase64: string,
  currentAnalysis: ChartAnalysis,
  scenario: string,
  marketData?: MarketData,
  manualTicker?: string
): Promise<SimulationResult> => {
  const client = getClient();
  const base64Data = imageBase64.split(',')[1] || imageBase64;
  const isBaseline = scenario === "BASELINE_PREDICTION";
  const effectiveTicker = manualTicker || currentAnalysis.ticker || "Unknown Asset";

  const prompt = `
  **ROLE:** Financial Oracle.
  **CONTEXT:** ${effectiveTicker} | ${currentAnalysis.trend} | Levels: ${currentAnalysis.key_levels?.support}/${currentAnalysis.key_levels?.resistance}.
  **NEWS:** ${marketData?.summary || "N/A"}
  **SCENARIO:** ${isBaseline ? "Natural Projection (Next 10 candles)" : `"${scenario}"`}
  **TASK:** Simulate 10 Ghost Candles. Open of 1st candle must align with chart end.
  Return JSON.
  `;

  return callWithRetry(async () => {
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
    if (!text) throw new Error("Oracle failed to respond.");
    return JSON.parse(cleanJsonString(text)) as SimulationResult;
  }, 3, 3000, "Simulation Oracle");
};

export const calculateBacktestScore = async (
  predictedCandles: GhostCandle[],
  resultImageBase64: string,
  scenario: string
): Promise<BacktestResult> => {
  const client = getClient();
  const base64Data = resultImageBase64.split(',')[1] || resultImageBase64;

  const prompt = `
  **ROLE:** The Judge.
  **PREDICTION:** ${JSON.stringify(predictedCandles)}
  **SCENARIO:** "${scenario}"
  **TASK:** Compare Prediction vs Actual Image.
  Criteria: Direction, Magnitude, Levels.
  Return JSON: {score (0-100), critique (max 2 sentences)}.
  `;

  return callWithRetry(async () => {
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
    if (!text) throw new Error("Judge failed to respond.");
    const result = JSON.parse(cleanJsonString(text));
    return {
      score: result.score,
      critique: result.critique,
      timestamp: Date.now()
    };
  }, 3, 3000, "Backtest Judge");
};