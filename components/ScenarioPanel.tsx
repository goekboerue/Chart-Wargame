import React, { useState } from 'react';
import { PRESET_SCENARIOS } from '../constants';
import { Activity, AlertTriangle, TrendingDown, TrendingUp, Zap, UserX, Rocket } from 'lucide-react';
import { Scenario } from '../types';

interface ScenarioPanelProps {
  onSimulate: (scenarioText: string) => void;
  isLoading: boolean;
}

const ScenarioPanel: React.FC<ScenarioPanelProps> = ({ onSimulate, isLoading }) => {
  const [customScenario, setCustomScenario] = useState('');
  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'trending-down': return <TrendingDown size={18} />;
      case 'trending-up': return <TrendingUp size={18} />;
      case 'alert-triangle': return <AlertTriangle size={18} />;
      case 'zap': return <Zap size={18} />;
      case 'user-x': return <UserX size={18} />;
      case 'rocket': return <Rocket size={18} />;
      case 'activity': return <Activity size={18} />;
      default: return <Activity size={18} />;
    }
  };

  const handlePresetClick = (scenario: Scenario) => {
    onSimulate(scenario.prompt);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customScenario.trim()) {
      onSimulate(customScenario);
    }
  };

  return (
    <div className={`bg-tactical-gray border border-gray-700 rounded-lg p-4 flex flex-col h-full transition-opacity duration-300 ${isLoading ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
      
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4 border-b border-gray-700 pb-2">
            <h2 className="text-lg font-mono font-bold text-white flex items-center gap-2">
            <Activity className="text-radar-green" />
            WARGAME SCENARIOS
            </h2>
            <div className="flex space-x-2">
            <button 
                onClick={() => setActiveTab('presets')}
                className={`px-3 py-1 text-xs font-mono rounded ${activeTab === 'presets' ? 'bg-radar-green text-black font-bold' : 'bg-gray-800 text-gray-400'}`}
            >
                PRESETS
            </button>
            <button 
                onClick={() => setActiveTab('custom')}
                className={`px-3 py-1 text-xs font-mono rounded ${activeTab === 'custom' ? 'bg-radar-green text-black font-bold' : 'bg-gray-800 text-gray-400'}`}
            >
                CUSTOM
            </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
            {activeTab === 'presets' ? (
            <div className="grid grid-cols-1 gap-3">
                {PRESET_SCENARIOS.map((scenario) => (
                <button
                    key={scenario.id}
                    disabled={isLoading}
                    onClick={() => handlePresetClick(scenario)}
                    className={`flex items-center gap-3 p-3 border rounded transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed
                      ${scenario.id === 'baseline' 
                        ? 'bg-radar-green/10 border-radar-green/50 hover:bg-radar-green/20' 
                        : 'bg-black/40 border-gray-800 hover:border-radar-green hover:bg-white/5'
                      }`}
                >
                    <div className={`transition-colors ${scenario.id === 'baseline' ? 'text-radar-green' : 'text-gray-400 group-hover:text-radar-green'}`}>
                    {getIcon(scenario.icon)}
                    </div>
                    <div>
                    <div className={`font-mono text-sm font-bold ${scenario.id === 'baseline' ? 'text-white' : 'text-gray-200'}`}>{scenario.label}</div>
                    <div className="text-xs text-gray-500 mt-1 line-clamp-1">{scenario.prompt === 'BASELINE_PREDICTION' ? 'Predict based on current technicals.' : scenario.prompt}</div>
                    </div>
                </button>
                ))}
            </div>
            ) : (
            <form onSubmit={handleCustomSubmit} className="h-full flex flex-col">
                <textarea
                value={customScenario}
                onChange={(e) => setCustomScenario(e.target.value)}
                placeholder="Ex: The company announces a merger with a major AI firm..."
                className="flex-1 bg-black/40 border border-gray-700 rounded p-3 text-sm font-mono text-gray-200 focus:outline-none focus:border-radar-green resize-none mb-3"
                />
                <button
                type="submit"
                disabled={isLoading || !customScenario.trim()}
                className="w-full py-3 bg-radar-green hover:bg-green-400 text-black font-mono font-bold rounded flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                <Zap size={16} />
                RUN SIMULATION
                </button>
            </form>
            )}
        </div>
      </div>
      
      {isLoading && (
        <div className="mt-4 p-3 bg-gray-900 border border-gray-700 text-gray-500 text-xs font-mono flex items-center justify-center animate-pulse">
           > PROCESSING INTELLIGENCE STREAM...
        </div>
      )}
    </div>
  );
};

export default ScenarioPanel;