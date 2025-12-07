import { GoogleGenAI, Schema, Type } from "@google/genai";
import { ChartAnalysis, SimulationResult, MarketData, GhostCandle, BacktestResult } from "../types";
import { MODEL_NAME, FALLBACK_MODEL_NAME } from "../constants";

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

const cleanJsonString = (text: string): string => {
  return text.replace(/```json|```/g, '').trim();
};

type StatusCallback = (msg: string) => void;

// --- DUAL-ENGINE EXECUTION CORE ---

/**
 * Executes a GenAI request with Fallback logic.
 * 1. Tries PRIMARY model.
 * 2. If Quota/Rate Limit (429) -> Switches to FALLBACK model.
 * 3. Returns data + model name.
 */
async function executeWithModelFallback<T>(
  operationName: string,
  onUpdate: StatusCallback | undefined,
  apiCall: (model: string) => Promise<T>
): Promise<T & { model_used: string }> {
  
  const models = [MODEL_NAME, FALLBACK_MODEL_NAME];
  let lastError: any = null;

  for (let i = 0; i < models.length; i++) {
    const currentModel = models[i];
    const isFallback = i > 0;

    try {
      if (isFallback && onUpdate) {
        onUpdate(`⚠️ PRIMARY ENGINE LIMIT. ENGAGING FALLBACK (${currentModel})...`);
        await wait(1000); // Brief cool-down before switching engines
      } else if (onUpdate) {
        // Normal update
      }

      // WRAPPER: Retry logic PER MODEL
      // We try the *current* model a couple of times for transient errors
      // If it's a hard 429, we break this inner loop to go to the next model
      const result = await attemptModelExecution(apiCall, currentModel, operationName, onUpdate);
      
      return { ...result, model_used: currentModel };

    } catch (error: any) {
      lastError = error;
      const msg = error?.message || "";
      const isQuota = msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");

      if (isQuota) {
        // If this was the last model, throw
        if (i === models.length - 1) {
           throw new Error(`⚠️ CRITICAL: ALL ENGINES DEPLETED. TRY AGAIN TOMORROW.`);
        }
        // Otherwise, continue to next model (Fallback)
        console.warn(`Model ${currentModel} exhausted. Switching...`);
        continue; 
      }

      // If it's not a quota error (e.g. Invalid Image, Content Policy), don't switch models, just fail.
      throw error;
    }
  }

  throw lastError;
}

// Inner helper to handle transient retries for a SINGLE model
async function attemptModelExecution<T>(
  apiCall: (model: string) => Promise<T>,
  model: string,
  context: string,
  onUpdate?: StatusCallback
): Promise<T> {
  let retries = 2; // Reduced retries per model
  let delay = 2000;

  while (true) {
    try {
      return await withTimeout(apiCall(model), 20000, `${context} (${model})`);
    } catch (error: any) {
      const msg = error?.message || "";
      const isTransient = msg.includes("fetch failed") || msg.includes("503");
      const isQuota = msg.includes("429") || msg.includes("quota");

      // Immediate fail to outer loop if Quota
      if (isQuota) throw error; 

      if (isTransient && retries > 0) {
        if (onUpdate) onUpdate(`⚠️ RETRYING ${context}... (${retries})`);
        await wait(delay);
        retries--;
        delay += 1000;
        continue;
      }
      
      throw error;
    }
  }
}


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

  return await executeWithModelFallback(
    "Chart Analysis",
    onUpdate,
    async (model) => {
      const response = await client.models.generateContent({
        model: model,
        contents: {
          parts: [
            { inlineData: { mimeType: "image/png", data: base64Data } },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: ANALYSIS_SCHEMA,
          temperature: 0.1, 
        },
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI.");
      return JSON.parse(cleanJsonString(text)) as ChartAnalysis;
    }
  );
};

export const fetchMarketContext = async (ticker: string, technicalContext?: string, onUpdate?: StatusCallback): Promise<MarketData> => {
  const client = getClient();
  const today = new Date().toDateString();
  
  const prompt = `
  **DATE:** ${today}. Ticker: "${ticker}".
  Get price & 3 headlines.
  Output: Summary | Headlines list.
  `;

  // Market data relies on tools. If fallback model doesn't support tools, this might fail or fallback to text only.
  // 2.0 Flash Lite usually supports tools, but let's be careful.
  try {
     return await executeWithModelFallback(
      "Market Intel",
      onUpdate,
      async (model) => {
          const response = await client.models.generateContent({
          model: model,
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
      }
    );
  } catch (error) {
    console.warn("Market data skipped:", error);
    return { summary: "REAL-TIME DATA UNAVAILABLE.", headlines: [], sources: [] };
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
  **TASK:** 10 Ghost Candles JSON. Strict technical adherence.
  `;

  return await executeWithModelFallback(
    "Simulation",
    onUpdate,
    async (model) => {
      const response = await client.models.generateContent({
        model: model,
        contents: {
          parts: [
            { inlineData: { mimeType: "image/png", data: base64Data } },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: SIMULATION_SCHEMA,
          temperature: 0.4, 
        },
      });

      const text = response.text;
      if (!text) throw new Error("No simulation data.");
      return JSON.parse(cleanJsonString(text)) as SimulationResult;
    }
  );
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

  return await executeWithModelFallback(
    "Backtest",
    onUpdate,
    async (model) => {
      const response = await client.models.generateContent({
        model: model,
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
    }
  );
};