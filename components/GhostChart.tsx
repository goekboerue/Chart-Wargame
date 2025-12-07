import React from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { GhostCandle } from '../types';

interface GhostChartProps {
  data: GhostCandle[];
  levels?: { support: number; resistance: number };
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-black border border-radar-green p-2 rounded shadow-lg">
        <p className="text-radar-green font-mono text-xs mb-1">T+{label}</p>
        <div className="grid grid-cols-2 gap-x-4 text-xs font-mono text-gray-300">
          <span>O: {data.open}</span>
          <span>C: {data.close}</span>
          <span>H: {data.high}</span>
          <span>L: {data.low}</span>
        </div>
      </div>
    );
  }
  return null;
};

const GhostChart: React.FC<GhostChartProps> = ({ data, levels }) => {
  // Prepare data for Recharts
  const chartData = data.map(d => ({
    ...d,
    // For tooltip
    ...d
  }));

  // Calculate domain to ensure candles and levels fit
  const allLows = data.map(d => d.low);
  const allHighs = data.map(d => d.high);
  
  // If levels exist, include them in the domain calculation so they aren't cut off
  if (levels) {
    allLows.push(levels.support);
    allHighs.push(levels.resistance);
  }

  const minPrice = Math.min(...allLows) * 0.995;
  const maxPrice = Math.max(...allHighs) * 1.005;

  return (
    <div className="w-full h-full bg-black/50 rounded-lg p-2 border border-gray-800 relative">
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-radar-green animate-pulse"></span>
                <span className="text-xs font-mono text-radar-green">GHOST PROJECTION</span>
            </div>
            {levels && (
                 <div className="flex gap-2 text-[10px] font-mono">
                    <span className="text-green-500">SUP: {levels.support}</span>
                    <span className="text-red-500">RES: {levels.resistance}</span>
                 </div>
            )}
        </div>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
          <CartesianGrid stroke="#333" strokeDasharray="3 3" vertical={false} />
          <XAxis 
            dataKey="day" 
            tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }} 
            axisLine={{ stroke: '#333' }}
            tickLine={false}
            tickFormatter={(val) => `T+${val}`}
          />
          <YAxis 
            domain={[minPrice, maxPrice]} 
            tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }} 
            axisLine={false}
            tickLine={false}
            orientation="right"
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
          
          {/* Support Line */}
          {levels && (
             <ReferenceLine 
                y={levels.support} 
                stroke="#22c55e" 
                strokeDasharray="4 4" 
                label={{ position: 'left', value: 'SUPPORT', fill: '#22c55e', fontSize: 9 }} 
             />
          )}

          {/* Resistance Line */}
          {levels && (
             <ReferenceLine 
                y={levels.resistance} 
                stroke="#ef4444" 
                strokeDasharray="4 4" 
                label={{ position: 'left', value: 'RESISTANCE', fill: '#ef4444', fontSize: 9 }} 
             />
          )}

          {/* Volatility Shadow (High/Low) */}
          <Line 
            type="monotone" 
            dataKey="high" 
            stroke="transparent" 
            dot={false} 
          />
           <Line 
            type="monotone" 
            dataKey="low" 
            stroke="transparent" 
            dot={false} 
          />
          
          {/* Main Trajectory (Close) */}
          <Line 
            type="monotone" 
            dataKey="close" 
            stroke="#00ff41" 
            strokeWidth={2}
            dot={{ r: 3, fill: '#0a0a0a', stroke: '#00ff41', strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />

          {/* Reference Line for Start */}
           <ReferenceLine x={1} stroke="#333" strokeDasharray="3 3" label={{ position: 'top', value: 'NOW', fill: '#666', fontSize: 10 }} />

        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default GhostChart;