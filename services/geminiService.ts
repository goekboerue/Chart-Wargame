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
  // 1. Try the injected process.env from vite.config.ts (Most reliable now)
  if (process.env.API_KEY) return process.env.API_KEY;

  // 2. Fallback to Vite-specific import.meta.env
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
  // Remove the hard error throw here to prevent app crash loop, log warning instead
  if (!apiKey) {
    console.warn("API Key is missing. Simulation will likely fail.");
  }
  return new GoogleGenAI({ apiKey: apiKey });
};

// Schema for Step 1: Observer
const ANALYSIS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    ticker: {
      type: Type.STRING,
      description: "The EXACT stock/crypto ticker symbol visible on the chart (e.g., 'AAPL', 'BTCUSDT', 'XAUUSD'). Look at the top-left or watermarks. If uncertain or text is blurry, return null.",
    },
    technical_summary: {
      type: Type.STRING,
      description: "A comprehensive technical analysis summary (approx 3-4 sentences). Explain the market structure, momentum, and the 'Why' behind the current setup. Avoid overly robotic phrasing.",
    },
    trend: {
      type: Type.STRING,
      description: "Current trend direction (e.g., 'Strong Bullish Trend', 'Consolidation Phase') including nuance.",
    },
    support_resistance: {
      type: Type.STRING,
      description: "A descriptive sentence explaining the key zones. (e.g., 'Major psychological support holds firmly at $150, while the $180 supply zone remains untested.').",
    },
    key_levels: {
      type: Type.OBJECT,
      description: "Estimated numeric values for plotting.",
      properties: {
        support: { type: Type.NUMBER, description: "The nearest significant support price level." },
        resistance: { type: Type.NUMBER, description: "The nearest significant resistance price level." }
      },
      required: ["support", "resistance"]
    }
  },
  required: ["technical_summary", "trend", "support_resistance", "key_levels"],
};

// Schema for Step 3: Oracle
const SIMULATION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    analysis: {
      type: Type.STRING,
      description: "Strategic reasoning of how the specific scenario and real-time data impact the chart.",
    },
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

// Schema for Step 4: Backtester (The Judge)
const BACKTEST_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    score: {
      type: Type.NUMBER,
      description: "Accuracy score from 0 to 100 based on direction, volatility, and levels.",
    },
    critique: {
      type: Type.STRING,
      description: "A harsh, concise evaluation of why the prediction was right or wrong compared to the actual result image.",
    }
  },
  required: ["score", "critique"],
};

// Helper to clean JSON string from Markdown code blocks
const cleanJsonString = (text: string): string => {
  return text.replace(/```json|```/g, '').trim();
};

export const analyzeChart = async (imageBase64: string): Promise<ChartAnalysis> => {
  const client = getClient();
  const base64Data = imageBase64.split(',')[1] || imageBase64;

  const prompt = `
  **ROLE:** Expert Technical Analyst (The Observer).
  
  **TASK:**
  Analyze the uploaded financial chart image. 
  1. **IDENTIFY TICKER:** Inspect the image carefully for the asset symbol (e.g., BTC, ETH, TSLA, GARAN). It is usually in the top-left corner. **If you cannot find a clear ticker, return NULL for the ticker field.** Do NOT guess a country or random word.
  2. Identify the primary Trend.
  3. Locate key Support and Resistance levels. 
     * Identify the numeric values for plotting.
     * write a DESCRIPTIVE sentence about these levels.
  4. Identify any visible chart patterns.
  5. Provide a technical summary. 
     * Explain the narrative of the chart. 
     * What are the buyers and sellers doing? 
  
  Return the analysis in JSON format.
  `;

  try {
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
  } catch (error) {
    console.error("Analysis failed:", error);
    throw error;
  }
};

export const fetchMarketContext = async (ticker: string, technicalContext?: string): Promise<MarketData> => {
  const client = getClient();
  const today = new Date().toDateString();
  
  const prompt = `
  **CURRENT DATE:** ${today}

  You are a high-frequency financial news scout. Search for the **ABSOLUTE LATEST** market data for the asset: "${ticker}".
  
  **STRICT TIME FILTER:**
  - **IGNORE** any news older than 7 days. Even if it is relevant, if it is old, DO NOT USE IT.
  - **PRIORITY:** Focus on news from the LAST 24 to 48 HOURS.
  - If no recent news is found, clearly state "No significant news in the last 7 days" instead of returning old data.
  
  **CONTEXT:**
  The technical chart currently shows: "${technicalContext || 'General Analysis'}".
  
  **TASKS:**
  1. Find the current live price and today's percentage change for ${ticker}.
  2. Find the **TOP 3 most relevant and FRESH headlines** affecting ${ticker}. 
     * **CRITICAL:** Ensure the news is SPECIFICALLY about ${ticker}.
     * If the chart context is "Bearish", look for recent negative catalysts (e.g., Bad earnings, lawsuit, CEO resigns).
     * If the chart context is "Bullish", look for recent positive catalysts.
  
  **OUTPUT FORMAT:**
  Provide a short 1-sentence summary of the current sentiment (Bullish/Bearish).
  Then, strictly output the delimiter "---HEADLINES---" on a new line.
  Then, list the top 3 headlines. Plain text, one per line. No numbers, no bullets, no dashes. 
  *IMPORTANT:* Include the relative time in parentheses if possible (e.g. "Earnings report released (2 hours ago)").
  `;

  try {
    const response = await client.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const fullText = response.text || "No market data found.";
    
    // Parse text to extract summary and headlines
    const parts = fullText.split("---HEADLINES---");
    const summary = parts[0] ? parts[0].trim() : "Market data unavailable.";
    const headlinesRaw = parts[1] || "";
    
    const headlines = headlinesRaw
      .split('\n')
      .map(line => line.trim().replace(/^[-*•]\s*/, '')) 
      .filter(line => line.length > 0)
      .slice(0, 3); 
    
    // Extract sources from grounding metadata
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .map((chunk: any) => chunk.web)
      .filter((web: any) => web?.uri && web?.title)
      .map((web: any) => ({ title: web.title, uri: web.uri }));

    return { summary, headlines, sources };
  } catch (error) {
    console.warn("Market context fetch failed, proceeding without it.", error);
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
  **ROLE:** Financial Oracle & Simulator.

  **CONTEXT (The Observer's Analysis):**
  Ticker: ${effectiveTicker}
  Trend: ${currentAnalysis.trend}
  Levels Description: ${currentAnalysis.support_resistance}
  Numeric Levels: Support ~${currentAnalysis.key_levels?.support}, Resistance ~${currentAnalysis.key_levels?.resistance}
  Summary: ${currentAnalysis.technical_summary}

  ${marketData ? `
  **REAL-TIME INTELLIGENCE (The Reality Check):**
  Summary: "${marketData.summary}"
  Headlines:
  ${marketData.headlines.map(h => `- ${h}`).join('\n')}
  ` : ''}

  **SCENARIO:**
  ${isBaseline 
    ? "NO HYPOTHETICAL INJECTED. Analyze the interaction between the CHART TECHNICALS and the REAL-TIME NEWS. Predict the natural course of price action for the next 10 candles based on the current sentiment and momentum." 
    : `"${scenario}"`
  }

  **TASK:**
  1. Simulate the price action for ${effectiveTicker}.
  2. Generate 10 "Ghost Candles".
     * IMPORTANT: The first candle's OPEN must be realistic relative to the last visible candle in the image.
     * Respect the Support (${currentAnalysis.key_levels?.support}) and Resistance (${currentAnalysis.key_levels?.resistance}) levels unless the news/scenario is strong enough to break them.

  Return JSON with strategic reasoning and the candle data.
  `;

  try {
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
  } catch (error) {
    console.error("Simulation failed:", error);
    throw error;
  }
};

export const calculateBacktestScore = async (
  predictedCandles: GhostCandle[],
  resultImageBase64: string,
  scenario: string
): Promise<BacktestResult> => {
  const client = getClient();
  const base64Data = resultImageBase64.split(',')[1] || resultImageBase64;

  const prompt = `
  **ROLE:** The Judge (Backtest Auditor).

  **TASK:**
  Compare the provided PREDICTION DATA against the ACTUAL RESULT image.

  **PREDICTION (Ghost Candles JSON):**
  ${JSON.stringify(predictedCandles)}
  
  **SCENARIO CONTEXT:**
  "${scenario}"

  **ACTUAL RESULT:**
  (See uploaded image)

  **EVALUATION CRITERIA:**
  1. **Direction:** Did the price move up/down as predicted?
  2. **Magnitude:** Was the volatility similar?
  3. **Structure:** Did it respect similar support/resistance levels?

  **OUTPUT:**
  Return a JSON object with:
  - 'score' (0-100 integer)
  - 'critique' (Short, sharp analysis of the difference. Max 2 sentences.)
  `;

  try {
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
    if (!text) throw new Error("Backtester failed to respond.");
    
    const result = JSON.parse(cleanJsonString(text));
    return {
      score: result.score,
      critique: result.critique,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error("Backtest failed:", error);
    throw error;
  }
};