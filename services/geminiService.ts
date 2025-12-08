import { GoogleGenAI, Schema, Type } from "@google/genai";
import { ChartAnalysis, SimulationResult, MarketData, GhostCandle, BacktestResult } from "../types";
import { MODEL_PIPELINE } from "../constants";

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

// --- MULTI-ENGINE EXECUTION CORE ---

/**
 * Executes a GenAI request with a robust Pipeline strategy.
 * Iterates through MODEL_PIPELINE.
 */
async function executeWithModelPipeline<T>(
  operationName: string,
  onUpdate: StatusCallback | undefined,
  apiCall: (model: string) => Promise<T>
): Promise<T & { model_used: string }> {
  
  const models = MODEL_PIPELINE;
  let lastError: any = null;

  for (let i = 0; i < models.length; i++) {
    const currentModel = models[i];
    const isFallback = i > 0;

    try {
      if (isFallback && onUpdate) {
        onUpdate(`⚠️ ENGAGING BACKUP ENGINE: ${currentModel}...`);
        // Small delay to prevent hammering if loop is fast
        await wait(500); 
      }

      // WRAPPER: Retry logic PER MODEL
      // We try the *current* model a couple of times for transient errors
      // If it fails with a Critical Error (429, 503, etc), we break inner loop and go to next model
      const result = await attemptModelExecution(apiCall, currentModel, operationName, onUpdate);
      
      return { ...result, model_used: currentModel };

    } catch (error: any) {
      lastError = error;
      const msg = (error?.message || "").toLowerCase();
      
      // Determine if we should switch models
      // We switch on: 429 (Too Many Requests), 503 (Service Unavailable), 500 (Internal Error), or Fetch Failures
      const isRecoverableBySwitching = 
        msg.includes("429") || 
        msg.includes("quota") || 
        msg.includes("resource_exhausted") ||
        msg.includes("503") || 
        msg.includes("service unavailable") ||
        msg.includes("fetch failed") ||
        msg.includes("overloaded");

      // Critical errors that imply we shouldn't even try other models (e.g. Bad Request due to content)
      // Actually, for "safety" blocks, sometimes other models are more lenient, so we might want to try them too.
      // But "Invalid API Key" (400/401) is definitely fatal.
      const isFatal = msg.includes("api key") || msg.includes("permission denied");

      if (isFatal) {
        throw error;
      }

      if (isRecoverableBySwitching) {
        // If this was the last model, throw
        if (i === models.length - 1) {
           console.error("All models exhausted.");
           throw new Error(`⚠️ CRITICAL: ALL ENGINES FAILED. LAST ERROR: ${msg}`);
        }
        // Otherwise, continue to next model (Fallback)
        console.warn(`Model ${currentModel} failed (${msg}). Switching...`);
        continue; 
      }

      // For other unknown errors, we generally try the next model just in case it's a model-specific glitch
      if (i < models.length - 1) {
         console.warn(`Model ${currentModel} encountered unknown error. Switching...`);
         continue;
      }

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
  let retries = 1; // 1 retry per model before switching
  let delay = 1500;

  while (true) {
    try {
      return await withTimeout(apiCall(model), 25000, `${context} (${model})`);
    } catch (error: any) {
      const msg = (error?.message || "").toLowerCase();
      
      // Immediate fail to outer loop if it looks like a hard limit or server error
      const isHardError = msg.includes("429") || msg.includes("quota") || msg.includes("503");
      if (isHardError) throw error; 

      if (retries > 0) {
        // It might be a simple network glitch
        if (onUpdate) onUpdate(`⚠️ RETRYING ${context} (${retries})...`);
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

  return await executeWithModelPipeline(
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

  try {
     return await executeWithModelPipeline(
      "Market Intel",
      onUpdate,
      async (model) => {
          // Note: Some models (like flash-lite) might have different tool support.
          // If googleSearch fails on a model, this block throws, and the pipeline tries the next model.
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

  return await executeWithModelPipeline(
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

  return await executeWithModelPipeline(
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