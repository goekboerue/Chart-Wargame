import React, { useState, useRef } from 'react';
import { Upload, X, CheckCircle, AlertTriangle, ScanLine } from 'lucide-react';
import { SavedSimulation, BacktestResult } from '../types';
import { calculateBacktestScore } from '../services/geminiService';

interface BacktestModalProps {
  isOpen: boolean;
  onClose: () => void;
  simulation: SavedSimulation;
  onComplete: (result: BacktestResult) => void;
}

const BacktestModal: React.FC<BacktestModalProps> = ({ isOpen, onClose, simulation, onComplete }) => {
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setResultImage(reader.result as string);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const runBacktest = async () => {
    if (!resultImage) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const result = await calculateBacktestScore(
        simulation.simulation.ghost_candles,
        resultImage,
        simulation.scenario
      );
      onComplete(result);
      // Close handled by parent after update usually, but we can reset internal state
      setResultImage(null);
    } catch (e) {
      console.error(e);
      setError("FAILED TO VERIFY. IMAGE UNCLEAR.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-lg bg-tactical-gray border border-gray-700 rounded-lg shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between bg-black/40">
           <div className="flex items-center gap-2">
             <ScanLine className="text-radar-green" />
             <h2 className="font-mono font-bold text-white text-lg">REALITY CHECK</h2>
           </div>
           <button onClick={onClose} className="text-gray-500 hover:text-white">
             <X size={24} />
           </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6">
          <div className="text-sm font-mono text-gray-400">
            To verify prediction accuracy, upload the <span className="text-white font-bold">ACTUAL CHART</span> that corresponds to the time period of this simulation.
            <div className="mt-2 text-xs border-l-2 border-gray-700 pl-2 italic">
               Scenario: "{simulation.scenario}"
            </div>
          </div>

          {/* Upload Area */}
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            ref={fileInputRef}
            className="hidden"
          />

          {!resultImage ? (
             <div 
               onClick={() => fileInputRef.current?.click()}
               className="border-2 border-dashed border-gray-700 rounded-lg h-48 flex flex-col items-center justify-center cursor-pointer hover:border-radar-green hover:bg-white/5 transition-all group"
             >
                <Upload className="text-gray-500 group-hover:text-radar-green mb-2" />
                <span className="font-mono text-xs text-gray-400">UPLOAD PROOF (IMAGE)</span>
             </div>
          ) : (
             <div className="relative h-48 bg-black border border-gray-700 rounded-lg overflow-hidden flex items-center justify-center">
                <img src={resultImage} alt="Proof" className="max-h-full max-w-full object-contain opacity-80" />
                <button 
                  onClick={() => setResultImage(null)}
                  className="absolute top-2 right-2 bg-black/60 p-1 rounded hover:text-red-500"
                >
                  <X size={16} />
                </button>
             </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-500 text-xs font-mono">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <button
            onClick={runBacktest}
            disabled={!resultImage || isAnalyzing}
            className={`w-full py-3 rounded font-mono font-bold flex items-center justify-center gap-2 transition-all
              ${!resultImage 
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                : 'bg-radar-green text-black hover:bg-green-400'
              }
              ${isAnalyzing ? 'animate-pulse' : ''}
            `}
          >
            {isAnalyzing ? "JUDGING ACCURACY..." : "CALCULATE ACCURACY SCORE"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BacktestModal;