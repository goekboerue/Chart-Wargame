import React from 'react';
import { X, Trash2, Clock, PlayCircle, AlertTriangle, CheckCircle, Percent } from 'lucide-react';
import { SavedSimulation } from '../types';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  savedSimulations: SavedSimulation[];
  onLoad: (sim: SavedSimulation) => void;
  onDelete: (id: string) => void;
  onBacktest: (sim: SavedSimulation) => void;
}

const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  savedSimulations,
  onLoad,
  onDelete,
  onBacktest
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-md h-full bg-tactical-gray border-l border-gray-700 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between bg-black/20">
            <div className="flex items-center gap-2">
                <Clock className="text-radar-green" size={20} />
                <h2 className="font-mono font-bold text-white text-lg tracking-wider">TACTICAL HISTORY</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                <X size={24} />
            </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {savedSimulations.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 font-mono text-sm opacity-50">
                    <Clock size={48} className="mb-4" />
                    <p>NO ARCHIVED SIMULATIONS</p>
                </div>
            ) : (
                savedSimulations.map((sim) => (
                    <div key={sim.id} className="bg-black/40 border border-gray-700 rounded p-4 hover:border-radar-green transition-all group relative overflow-hidden">
                        
                        <div className="flex justify-between items-start mb-2 relative z-10">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-radar-green font-mono font-bold text-sm">
                                        {sim.ticker || "UNKNOWN ASSET"}
                                    </span>
                                    <span className="text-xs text-gray-600 font-mono border border-gray-800 px-1 rounded">
                                        {sim.analysis.trend}
                                    </span>
                                </div>
                                <div className="text-gray-500 text-[10px] font-mono mt-1">
                                    {new Date(sim.timestamp).toLocaleString()}
                                </div>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDelete(sim.id); }}
                                className="text-gray-600 hover:text-red-500 transition-colors p-1"
                                title="Delete Archive"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                        
                        <div className="text-gray-300 text-xs font-mono mb-4 line-clamp-2 border-l-2 border-gray-700 pl-2">
                            "{sim.scenario}"
                        </div>

                        {/* Backtest Result Badge if exists */}
                        {sim.backtest && (
                          <div className={`mb-3 p-2 rounded flex items-start gap-2 ${sim.backtest.score >= 70 ? 'bg-green-900/20 border border-green-900' : 'bg-red-900/20 border border-red-900'}`}>
                              <Percent size={14} className={sim.backtest.score >= 70 ? 'text-green-500' : 'text-red-500'} />
                              <div>
                                <div className={`text-xs font-bold font-mono ${sim.backtest.score >= 70 ? 'text-green-400' : 'text-red-400'}`}>
                                  ACCURACY: {sim.backtest.score}%
                                </div>
                                <p className="text-[10px] text-gray-400 leading-tight mt-1">
                                  {sim.backtest.critique}
                                </p>
                              </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button 
                              onClick={() => { onLoad(sim); onClose(); }}
                              className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-xs font-mono text-gray-300 font-bold rounded flex items-center justify-center gap-2 transition-colors"
                          >
                              <PlayCircle size={14} />
                              LOAD
                          </button>
                          
                          {!sim.backtest && (
                             <button 
                                onClick={() => { onBacktest(sim); }}
                                className="w-full py-2 border border-gray-600 hover:border-radar-green text-xs font-mono text-gray-400 hover:text-radar-green font-bold rounded flex items-center justify-center gap-2 transition-colors"
                            >
                                <CheckCircle size={14} />
                                VERIFY
                            </button>
                          )}
                        </div>
                    </div>
                ))
            )}
        </div>
        
        <div className="p-3 border-t border-gray-800 bg-black/20 text-[10px] text-gray-600 font-mono text-center">
             LOCAL STORAGE STORAGE LIMITS APPLY
        </div>
      </div>
    </div>
  );
};

export default HistoryDrawer;