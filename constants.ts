import { Scenario } from "./types";

export const PRESET_SCENARIOS: Scenario[] = [
  {
    id: 'baseline',
    label: 'Status Quo (Baseline)',
    prompt: 'BASELINE_PREDICTION', // Special keyword handled in service
    icon: 'activity'
  },
  {
    id: 'interest_hike',
    label: 'Rate Hike (+50bps)',
    prompt: 'The central bank announces a surprise 50 basis point interest rate hike. Liquidity tightens immediately.',
    icon: 'trending-down'
  },
  {
    id: 'ceo_resign',
    label: 'CEO Resigns',
    prompt: 'The CEO unexpectedly resigns amidst a scandal. Investor confidence is shaken.',
    icon: 'user-x'
  },
  {
    id: 'war_breakout',
    label: 'Conflict Escalation',
    prompt: 'Geopolitical tensions escalate into armed conflict in a key resource region. Markets panic.',
    icon: 'alert-triangle'
  },
  {
    id: 'competitor_fail',
    label: 'Competitor Bankruptcy',
    prompt: 'A major competitor declares bankruptcy, opening up market share.',
    icon: 'zap'
  },
  {
    id: 'breakthrough',
    label: 'Tech Breakthrough',
    prompt: 'The company announces a revolutionary technological breakthrough that beats expectations.',
    icon: 'rocket'
  }
];

export const MODEL_NAME = 'gemini-2.5-flash'; // Optimized for speed and vision