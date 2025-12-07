import { Scenario } from "./types";

export const PRESET_SCENARIOS: Scenario[] = [
  {
    id: 'baseline',
    label: 'Status Quo (Baseline)',
    prompt: 'BASELINE_PREDICTION', // Special keyword handled in service
    icon: 'activity'
  },
  {
    id: 'interest_cut',
    label: 'Rate Cut Pivot (-25bps)',
    prompt: 'The central bank announces a pivot with a 25 basis point interest rate cut. Liquidity conditions ease, signaling a pro-growth stance.',
    icon: 'percent'
  },
  {
    id: 'stimulus',
    label: 'Money Printer (QE)',
    prompt: 'Government announces a massive stimulus package and Quantitative Easing (QE). Money supply expands rapidly, devaluing currency and boosting assets.',
    icon: 'dollar-sign'
  },
  {
    id: 'inflation_spike',
    label: 'Hot CPI Data (Inflation)',
    prompt: 'Inflation data comes in significantly hotter than expected. Fears of aggressive monetary tightening and stagflation rattle the market.',
    icon: 'bar-chart-3'
  },
  {
    id: 'interest_hike',
    label: 'Rate Hike (+50bps)',
    prompt: 'The central bank announces a surprise 50 basis point interest rate hike to fight sticky inflation. Liquidity tightens immediately.',
    icon: 'trending-down'
  },
  {
    id: 'recession_fears',
    label: 'Global Recession',
    prompt: 'Major economic indicators point to a severe global recession. Consumer spending collapses and earnings forecasts are slashed.',
    icon: 'anchor'
  },
  {
    id: 'war_breakout',
    label: 'Conflict Escalation',
    prompt: 'Geopolitical tensions escalate into armed conflict in a key resource region. Markets panic and seek safe havens.',
    icon: 'alert-triangle'
  },
  {
    id: 'ceo_resign',
    label: 'CEO Resigns',
    prompt: 'The CEO unexpectedly resigns amidst a scandal. Investor confidence is shaken regarding leadership stability.',
    icon: 'user-x'
  },
  {
    id: 'breakthrough',
    label: 'Tech Breakthrough',
    prompt: 'The company announces a revolutionary technological breakthrough that beats expectations and crushes competitors.',
    icon: 'rocket'
  }
];

export const MODEL_NAME = 'gemini-2.5-flash'; // Optimized for speed and vision