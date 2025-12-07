export interface GhostCandle {
  day: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartAnalysis {
  ticker?: string;
  technical_summary: string;
  trend: string;
  support_resistance: string;
  key_levels: {
    support: number;
    resistance: number;
  };
}

export interface MarketData {
  summary: string;
  headlines: string[];
  sources: { title: string; uri: string }[];
}

export interface SimulationResult {
  analysis: string;
  ghost_candles: GhostCandle[];
}

export interface BacktestResult {
  score: number; // 0-100
  critique: string;
  timestamp: number;
}

export interface SavedSimulation {
  id: string;
  timestamp: number;
  ticker?: string;
  scenario: string;
  imageBase64: string;
  analysis: ChartAnalysis;
  simulation: SimulationResult;
  marketData?: MarketData;
  backtest?: BacktestResult;
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING_CHART = 'ANALYZING_CHART',
  CHART_READY = 'CHART_READY',
  FETCHING_DATA = 'FETCHING_DATA',
  SIMULATING = 'SIMULATING',
  SIMULATED = 'SIMULATED',
  ERROR = 'ERROR'
}

export interface Scenario {
  id: string;
  label: string;
  prompt: string;
  icon: string;
}