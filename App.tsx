import React, { useState, useEffect, useRef } from 'react';
import { AppState, ChartAnalysis, SimulationResult, MarketData, SavedSimulation, BacktestResult } from './types';
import { analyzeChart, runSimulation, fetchMarketContext } from './services/geminiService';
import FileUpload from './components/FileUpload';
import ScenarioPanel from './components/ScenarioPanel';
import GhostChart from './components/GhostChart';
import HistoryDrawer from './components/HistoryDrawer';
import BacktestModal from './components/BacktestModal';
import { Crosshair, AlertOctagon, Terminal, Cpu, ScanEye, ArrowRight, Radio, Save, Clock, Share2, Check, BarChart3, Newspaper, Globe, RefreshCw, Edit3 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { MODEL_NAME } from './constants';

// Declare process for TypeScript build
declare var process: {
  env: {
    API_KEY?: string;
    [key: string]: string | undefined;
  };
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [image, setImage] = useState<string | null>(null);
  
  const [analysis, setAnalysis] = useState<ChartAnalysis | null>(null);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  
  // Real-time status update from service
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  
  // Track Active Model (Primary vs Fallback)
  const [activeModel, setActiveModel] = useState<string>(MODEL_NAME);

  // Editable Ticker State
  const [editableTicker, setEditableTicker] = useState<string>('');
  const [isEditingTicker, setIsEditingTicker] = useState(false);
  
  // Track inputs for saving context
  const [currentScenario, setCurrentScenario] = useState<string>('');

  const [error, setError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  // History State
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [savedSimulations, setSavedSimulations] = useState<SavedSimulation[]>([]);

  // Backtest State
  const [backtestModalOpen, setBacktestModalOpen] = useState(false);
  const [selectedSimulationForBacktest, setSelectedSimulationForBacktest] = useState<SavedSimulation | null>(null);

  // Ref for snapshot
  const visualizationRef = useRef<HTMLDivElement>(null);

  // Load history on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chartWargame_history');
      if (saved) {
        setSavedSimulations(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
  }, []);

  const handleSaveSimulation = () => {
    if (!simulation || !analysis || !image) return;

    const newSave: SavedSimulation = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ticker: editableTicker || analysis.ticker,
      scenario: currentScenario,
      imageBase64: image,
      analysis,
      simulation,
      marketData: marketData || undefined
    };

    try {
      const updatedHistory = [newSave, ...savedSimulations];
      // Limit to 10 to prevent storage explosion mostly due to images
      if (updatedHistory.length > 10) {
        updatedHistory.pop(); 
      }
      
      localStorage.setItem('chartWargame_history', JSON.stringify(updatedHistory));
      setSavedSimulations(updatedHistory);
      alert("Simulation Archived Successfully.");
    } catch (e) {
      console.error(e);
      alert("Failed to save. Storage might be full.");
    }
  };

  const handleDeleteSimulation = (id: string) => {
    const updated = savedSimulations.filter(s => s.id !== id);
    setSavedSimulations(updated);
    localStorage.setItem('chartWargame_history', JSON.stringify(updated));
  };

  const handleLoadSimulation = (sim: SavedSimulation) => {
    setImage(sim.imageBase64);
    setAnalysis(sim.analysis);
    setSimulation(sim.simulation);
    setMarketData(sim.marketData || null);
    setCurrentScenario(sim.scenario);
    setEditableTicker(sim.ticker || '');
    if (sim.analysis.model_used) setActiveModel(sim.analysis.model_used);
    setAppState(AppState.SIMULATED);
    setError(null);
    setLoadingMessage('');
  };

  const handleOpenBacktest = (sim: SavedSimulation) => {
    setSelectedSimulationForBacktest(sim);
    setBacktestModalOpen(true);
    // Keep history drawer open or close it? Let's close it for better focus
    setIsHistoryOpen(false);
  };

  const handleBacktestComplete = (result: BacktestResult) => {
    if (!selectedSimulationForBacktest) return;

    const updatedHistory = savedSimulations.map(sim => {
      if (sim.id === selectedSimulationForBacktest.id) {
        return { ...sim, backtest: result };
      }
      return sim;
    });

    setSavedSimulations(updatedHistory);
    localStorage.setItem('chartWargame_history', JSON.stringify(updatedHistory));
    setBacktestModalOpen(false);
    setIsHistoryOpen(true); // Re-open drawer to show result
  };

  const handleShareIntel = async () => {
    if (!analysis || !simulation || isSharing) return;
    setIsSharing(true);
    setShareSuccess(false);

    // 1. Generate Text Report
    const report = `
🚨 CHART WARGAME INTEL REPORT 🚨
------------------------------
🎯 SCENARIO: ${currentScenario}
📉 TICKER: ${editableTicker}
📉 TREND: ${analysis.trend}
------------------------------
📊 ANALYSIS:
${analysis.technical_summary}
${analysis.support_resistance}
------------------------------
🔮 ORACLE PREDICTION:
${simulation.analysis}
------------------------------
generated by Chart Wargame
    `.trim();

    try {
      // Copy to clipboard
      await navigator.clipboard.writeText(report);

      // 2. Generate Snapshot (if ref exists)
      if (visualizationRef.current) {
        const dataUrl = await toPng(visualizationRef.current, { cacheBust: true, backgroundColor: '#050505' });
        
        // Trigger download
        const link = document.createElement('a');
        link.download = `chart-wargame-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
      }

      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 3000);

    } catch (err) {
      console.error("Share failed:", err);
      setError("SHARE FAILED. TRY MANUALLY.");
    } finally {
      setIsSharing(false);
    }
  };

  const handleImageSelect = async (base64: string) => {
    setImage(base64);
    setAnalysis(null);
    setMarketData(null);
    setSimulation(null);
    setCurrentScenario('');
    setEditableTicker('');
    setError(null);
    setLoadingMessage('');
    
    // Immediate Auto-Analysis (The Observer)
    setAppState(AppState.ANALYZING_CHART);

    try {
      const analysisResult = await analyzeChart(base64, (msg) => setLoadingMessage(msg));
      setAnalysis(analysisResult);
      if (analysisResult.model_used) setActiveModel(analysisResult.model_used);
      
      const detectedTicker = analysisResult.ticker || '';
      setEditableTicker(detectedTicker);
      
      setAppState(AppState.CHART_READY);
    } catch (err: any) {
      console.error(err);
      setAppState(AppState.ERROR);
      setError(err?.message || "OBSERVER FAILED. UNKNOWN ERROR.");
    } finally {
      setLoadingMessage('');
    }
  };

  // Allow manual refreshing of news if Ticker is changed
  const handleManualIntelRefresh = async () => {
    if (!editableTicker || !analysis) return;
    
    setAppState(AppState.FETCHING_DATA);
    setMarketData(null); // Clear old data
    setLoadingMessage('');

    try {
      const news = await fetchMarketContext(editableTicker, analysis.technical_summary, (msg) => setLoadingMessage(msg));
      setMarketData(news);
      if (news.model_used) setActiveModel(news.model_used);
      setAppState(AppState.CHART_READY);
    } catch (err: any) {
      console.error(err);
      setError("SCOUT FAILED TO FETCH NEWS. " + (err?.message || ""));
      setAppState(AppState.CHART_READY);
    } finally {
      setLoadingMessage('');
    }
  };

  const handleSimulate = async (scenario: string) => {
    if (!image || !analysis) {
      setError("MISSING INTEL. CHART NOT ANALYZED.");
      return;
    }

    setAppState(AppState.SIMULATING);
    setError(null);
    setLoadingMessage('');
    
    // Store context for saving
    setCurrentScenario(scenario);

    try {
      // Pass the editableTicker manually to ensure the simulation uses the corrected one
      const simResult = await runSimulation(image, analysis, scenario, marketData || undefined, editableTicker, (msg) => setLoadingMessage(msg));
      setSimulation(simResult);
      if (simResult.model_used) setActiveModel(simResult.model_used);
      setAppState(AppState.SIMULATED);
    } catch (err: any) {
      console.error(err);
      setAppState(AppState.ERROR);
      setError(err?.message || "SIMULATION FAILED.");
    } finally {
      setLoadingMessage('');
    }
  };

  // Logic to determine if Scenario buttons should be enabled
  const isWorking = appState === AppState.ANALYZING_CHART || appState === AppState.FETCHING_DATA || appState === AppState.SIMULATING;
  const isChartReady = !!analysis;

  // Visual helper for model status
  // If activeModel is NOT the Primary model, we consider it "Fallback" (Lite, Experimental, etc.)
  const isFallbackModel = activeModel !== MODEL_NAME;

  return (
    <div className="min-h-screen bg-black text-gray-200 font-sans selection:bg-radar-green selection:text-black flex flex-col">
      <HistoryDrawer 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)}
        savedSimulations={savedSimulations}
        onLoad={handleLoadSimulation}
        onDelete={handleDeleteSimulation}
        onBacktest={handleOpenBacktest}
      />

      {selectedSimulationForBacktest && (
        <BacktestModal 
          isOpen={backtestModalOpen}
          onClose={() => setBacktestModalOpen(false)}
          simulation={selectedSimulationForBacktest}
          onComplete={handleBacktestComplete}
        />
      )}

      {/* Header */}
      <header className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-black/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Crosshair className="text-radar-green w-6 h-6 animate-pulse-slow" />
          <h1 className="text-xl font-mono font-bold tracking-wider text-white">
            CHART <span className="text-radar-green">WARGAME</span>
          </h1>
        </div>
        <div className="flex items-center gap-6">
          
           {/* History Toggle */}
           <button 
             onClick={() => setIsHistoryOpen(true)}
             className="flex items-center gap-2 text-xs font-mono text-gray-400 hover:text-radar-green transition-colors"
           >
              <Clock size={16} />
              <span className="hidden sm:inline">HISTORY ({savedSimulations.length})</span>
           </button>

           {/* Status & Model Indicator */}
           <div className="hidden md:flex items-center gap-4 text-xs font-mono text-gray-500 border-l border-gray-800 pl-6">
              <div className={`flex items-center gap-1 transition-colors ${isFallbackModel ? 'text-purple-500' : 'text-gray-400'}`}>
                <Cpu size={14} />
                <span className="uppercase">{activeModel}: ONLINE</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${isWorking ? 'bg-yellow-500 animate-ping' : isFallbackModel ? 'bg-purple-500' : 'bg-radar-green'}`}></span>
                <span>STATUS: {appState}</span>
              </div>
           </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] mx-auto w-full">
        
        {/* Left Column: Inputs (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Uploader */}
          <div className="h-64 lg:h-80">
            <FileUpload onImageSelect={handleImageSelect} selectedImage={image} />
          </div>
          
          {/* Scenario Selector */}
          <div className="flex-1 min-h-[300px]">
             {/* Only show scenarios if we have an image, but disable them until analysis is done */}
             {image ? (
               <ScenarioPanel 
                  onSimulate={handleSimulate} 
                  isLoading={isWorking || !isChartReady} 
               />
             ) : (
                <div className="h-full flex items-center justify-center border border-dashed border-gray-800 rounded bg-black/20 text-gray-600 font-mono text-xs">
                    [AWAITING UPLOAD]
                </div>
             )}
          </div>
        </div>

        {/* Right Column: Visualization (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6" ref={visualizationRef}>
          
          {/* Terminal Output / Analysis */}
          <div className="bg-tactical-gray border border-gray-700 rounded-lg p-4 min-h-[180px] flex flex-col relative overflow-hidden group">
             
             {/* Share Button (Visible when simulation ready) */}
             {(simulation && !isWorking) && (
                <button
                  onClick={handleShareIntel}
                  disabled={isSharing}
                  className={`absolute top-2 right-2 z-20 flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono font-bold transition-all
                    ${shareSuccess 
                      ? 'bg-radar-green text-black' 
                      : 'bg-black/60 text-radar-green border border-radar-green/50 hover:bg-radar-green/20'
                    }
                  `}
                >
                  {isSharing ? (
                    <span className="animate-pulse">ENCRYPTING...</span>
                  ) : shareSuccess ? (
                    <>
                      <Check size={14} />
                      <span>INTEL COPIED</span>
                    </>
                  ) : (
                    <>
                      <Share2 size={14} />
                      <span>SHARE INTEL</span>
                    </>
                  )}
                </button>
             )}

             <div className="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
               <Terminal size={120} />
             </div>
             
             {/* IDLE */}
             {appState === AppState.IDLE && (
               <div className="flex-1 flex items-center justify-center text-gray-600 font-mono text-sm">
                 [WAITING FOR VISUAL DATA...]
               </div>
             )}

             {/* LOADING STATES */}
             {(appState === AppState.ANALYZING_CHART) && (
               <div className="space-y-2 font-mono text-sm">
                  <p className="text-radar-green animate-pulse">&gt; OBSERVER: SCANNING IMAGE PIXELS...</p>
                  <p className="text-gray-500">&gt; CALCULATING SUPPORT/RESISTANCE VECTORS...</p>
                  {loadingMessage && (
                     <p className="text-yellow-500 font-bold animate-pulse mt-2">{loadingMessage}</p>
                  )}
               </div>
             )}

             {(appState === AppState.FETCHING_DATA) && (
               <div className="space-y-2 font-mono text-sm">
                  <p className="text-blue-400 animate-pulse">&gt; SCOUT: SCANNING NEWS WIRE...</p>
                  <p className="text-gray-500">&gt; CORRELATING HEADLINES WITH TECHNICAL PATTERNS...</p>
                  {loadingMessage && (
                     <p className="text-yellow-500 font-bold animate-pulse mt-2">{loadingMessage}</p>
                  )}
               </div>
             )}

             {(appState === AppState.SIMULATING) && (
               <div className="space-y-2 font-mono text-sm">
                  <p className="text-radar-green animate-pulse">&gt; ORACLE: RUNNING SIMULATION...</p>
                  <p className="text-gray-500">&gt; PROJECTING TRAJECTORY...</p>
                  {loadingMessage && (
                     <p className="text-yellow-500 font-bold animate-pulse mt-2">{loadingMessage}</p>
                  )}
               </div>
             )}

             {/* ERROR */}
             {appState === AppState.ERROR && (
                <div className="flex items-center gap-3 text-red-500 font-mono">
                  <AlertOctagon />
                  <p>{error}</p>
                </div>
             )}

             {/* RESULTS DISPLAY */}
             {(analysis || simulation || marketData) && !isWorking && (
               <div className="z-10 font-mono text-sm space-y-4 overflow-y-auto custom-scrollbar h-full">
                 
                 {/* 1. OBSERVER REPORT */}
                 {analysis && (
                   <div className="border-l-2 border-radar-green pl-3">
                     <div className="flex items-center gap-2 mb-1">
                        <ScanEye size={14} className="text-radar-green"/>
                        <span className="text-radar-green uppercase text-xs font-bold">
                           OBSERVER REPORT
                        </span>
                        
                        {/* EDITABLE TICKER */}
                        <div className="ml-2 flex items-center gap-2">
                           <div className="flex items-center bg-black/40 border border-gray-700 rounded px-2 py-0.5">
                              {isEditingTicker ? (
                                <input 
                                  autoFocus
                                  className="bg-transparent text-white w-20 outline-none text-xs font-bold font-mono uppercase"
                                  value={editableTicker}
                                  onChange={(e) => setEditableTicker(e.target.value.toUpperCase())}
                                  onBlur={() => setIsEditingTicker(false)}
                                  onKeyDown={(e) => {
                                    if(e.key === 'Enter') {
                                       setIsEditingTicker(false);
                                       handleManualIntelRefresh();
                                    }
                                  }}
                                />
                              ) : (
                                <span 
                                   className={`text-xs font-bold font-mono ${!editableTicker ? 'text-gray-600 italic' : 'text-white'}`}
                                   onClick={() => setIsEditingTicker(true)}
                                >
                                   {editableTicker || "UNKNOWN TICKER"}
                                </span>
                              )}
                              
                              <button 
                                onClick={() => setIsEditingTicker(!isEditingTicker)}
                                className="ml-2 text-gray-500 hover:text-white"
                              >
                                 <Edit3 size={10} />
                              </button>
                           </div>
                           
                           {/* Refresh Intel Button */}
                           <button 
                             onClick={handleManualIntelRefresh}
                             disabled={!editableTicker}
                             className={`text-gray-500 hover:text-blue-400 disabled:opacity-30 disabled:cursor-not-allowed ${!marketData ? 'animate-bounce text-blue-400' : ''}`}
                             title={marketData ? "Refresh Market Intelligence" : "Activate Market Intelligence Scout (Manual)"}
                           >
                             <RefreshCw size={12} />
                           </button>
                           
                           {!marketData && (
                              <span className="text-[10px] text-gray-600 font-mono animate-pulse">
                                 &lt;- CLICK TO LOAD NEWS (SAVES QUOTA)
                              </span>
                           )}
                        </div>

                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3 text-xs text-gray-400">
                        <div className="flex flex-col">
                            <span className="font-bold text-gray-500 mb-1">TREND STRUCTURE</span>
                            <span className="text-white text-sm">{analysis.trend}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-gray-500 mb-1">KEY ZONES (Est.)</span>
                            <span className="text-white text-sm">
                                {analysis.support_resistance}
                            </span>
                        </div>
                     </div>
                     <p className="text-gray-300 leading-relaxed mb-1">{analysis.technical_summary}</p>
                   </div>
                 )}

                 {/* 2. MARKET INTEL (THE SCOUT) */}
                 {marketData && (
                    <div className="border-l-2 border-blue-500 pl-3">
                        <div className="flex items-center gap-2 mb-1">
                           <Globe size={14} className="text-blue-500"/>
                           <span className="text-blue-500 uppercase text-xs font-bold">MARKET INTEL</span>
                        </div>
                        <p className="text-gray-400 text-xs italic mb-2">
                           "{marketData.summary}"
                        </p>
                        <ul className="space-y-1">
                           {marketData.headlines.map((headline, idx) => (
                              <li key={idx} className="text-xs text-gray-300 flex items-start gap-2">
                                 <Newspaper size={12} className="mt-0.5 text-gray-500" />
                                 {headline}
                              </li>
                           ))}
                        </ul>
                    </div>
                 )}
                 
                 {/* 3. ORACLE REPORT */}
                 {simulation && (
                   <div className="border-l-2 border-yellow-500 pl-3 pt-1 relative mt-4">
                      {/* Save Button for Oracle Result */}
                      <button 
                         onClick={handleSaveSimulation}
                         className="absolute right-0 top-0 p-1 text-gray-500 hover:text-radar-green transition-colors"
                         title="Save Simulation to History"
                      >
                        <Save size={16} />
                      </button>

                      <div className="flex items-center gap-2 mb-1">
                        <ArrowRight size={14} className="text-yellow-500"/>
                        <span className="text-yellow-500 uppercase text-xs font-bold">ORACLE SIMULATION</span>
                     </div>
                     <p className="text-white leading-relaxed pr-6">{simulation.analysis}</p>
                   </div>
                 )}
               </div>
             )}
          </div>

          {/* Chart Visualization */}
          <div className="flex-1 min-h-[400px] bg-black border border-gray-800 rounded-lg relative">
             {simulation ? (
               <GhostChart 
                 data={simulation.ghost_candles} 
                 levels={analysis?.key_levels}
               />
             ) : (
               <div className="absolute inset-0 flex items-center justify-center flex-col text-gray-700">
                 <Crosshair size={48} className="mb-4 opacity-20" />
                 <p className="font-mono text-sm">
                    {appState === AppState.CHART_READY 
                      ? "AWAITING TACTICAL SCENARIO..." 
                      : (appState === AppState.ANALYZING_CHART || appState === AppState.FETCHING_DATA ? "SCANNING TARGET..." : "NO DATA")}
                 </p>
               </div>
             )}
          </div>
        </div>

      </main>
    </div>
  );
};

export default App;