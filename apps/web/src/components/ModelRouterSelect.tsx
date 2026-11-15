import React, { useState, useEffect, useRef } from 'react';
import type { ModelCatalogItem, ModelPerformanceAnalytics } from '@agent-office/shared';

interface ModelRouterSelectProps {
  activeModel: string;
  costTier: string;
  isAutoRouter: boolean;
  onModelSwitched: () => void;
}

export const ModelRouterSelect: React.FC<ModelRouterSelectProps> = ({
  activeModel,
  costTier,
  isAutoRouter,
  onModelSwitched,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'catalog' | 'tradeoffs'>('catalog');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'text' | 'image'>('all');
  const [catalog, setCatalog] = useState<ModelCatalogItem[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, ModelPerformanceAnalytics>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch full catalog and analytics from API
  const fetchRouterDetails = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/model-router');
      if (res.ok) {
        const data = await res.json();
        if (data.catalog && Array.isArray(data.catalog)) {
          setCatalog(data.catalog);
        }
        if (data.analytics) {
          setAnalytics(data.analytics);
        }
      }
    } catch (err) {
      console.warn('[ModelRouterSelect] Failed to fetch catalog details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRouterDetails();
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Handle switching to auto router
  const handleSelectAuto = async () => {
    try {
      setIsSwitching(true);
      const res = await fetch('/api/model-router/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAuto: true }),
      });
      if (res.ok) {
        onModelSwitched();
        setIsOpen(false);
      }
    } catch (err) {
      console.error('[ModelRouterSelect] Failed to switch to auto-router:', err);
    } finally {
      setIsSwitching(false);
    }
  };

  // Handle manual model selection
  const handleSelectModel = async (modelId: string) => {
    try {
      setIsSwitching(true);
      const res = await fetch('/api/model-router/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: modelId }),
      });
      if (res.ok) {
        onModelSwitched();
        setIsOpen(false);
      }
    } catch (err) {
      console.error('[ModelRouterSelect] Failed to switch model:', err);
    } finally {
      setIsSwitching(false);
    }
  };

  // Filter catalog based on search query and category
  const textCount = catalog.filter((m) => m.category !== 'image').length;
  const imageCount = catalog.filter((m) => m.category === 'image').length;

  const filteredCatalog = catalog.filter((m) => {
    if (categoryFilter === 'text' && m.category === 'image') return false;
    if (categoryFilter === 'image' && m.category !== 'image') return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.version?.toLowerCase().includes(q) ||
      m.costTier?.toLowerCase().includes(q) ||
      m.description?.toLowerCase().includes(q) ||
      m.strengths?.some((s) => s.toLowerCase().includes(q)) ||
      m.recommendedFor?.some((r) => r.toLowerCase().includes(q))
    );
  });

  const getTierColor = (tier: string) => {
    switch (tier?.toLowerCase()) {
      case 'cheapest':
        return 'text-[#CCF12B] border-[#CCF12B] bg-[#1B211D]';
      case 'economy':
        return 'text-[#79D693] border-[#79D693] bg-[#1B211D]';
      case 'standard':
        return 'text-[#36B9ED] border-[#36B9ED] bg-[#1B211D]';
      case 'advanced':
        return 'text-[#F5BC4D] border-[#F5BC4D] bg-[#1B211D]';
      case 'high_performance':
        return 'text-[#F16E5E] border-[#F16E5E] bg-[#1B211D]';
      default:
        return 'text-[#869184] border-[#465047] bg-[#1B211D]';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Navbar Trigger Button - Compact & Zero-Wrap on Mobile */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 bg-[#0D110F] border text-[9.5px] sm:text-[10px] cursor-pointer transition-colors shadow-[1px_1px_0_#000] whitespace-nowrap ${
          isOpen ? 'border-[#CCF12B]' : 'border-[#465047] hover:border-[#899584]'
        }`}
        title="AI Model Auto-Router & Manual Model Selector"
      >
        <span className="text-[#36B9ED] font-bold font-pixel-heading shrink-0">ROUTER:</span>

        {/* Mode Tag */}
        <span
          className={`text-[8px] sm:text-[8.5px] px-1 py-0.2 border uppercase font-pixel-heading shrink-0 ${
            isAutoRouter
              ? 'text-[#CCF12B] border-[#CCF12B] bg-[#1B211D]'
              : 'text-[#F5BC4D] border-[#F5BC4D] bg-[#1B211D]'
          }`}
        >
          {isAutoRouter ? 'AUTO' : 'MANUAL'}
        </span>

        {/* Selected Model Name - Truncate cleanly on small screens */}
        <span className="text-[#F0F1DD] font-pixel-heading font-semibold tracking-wider truncate max-w-[90px] xs:max-w-[130px] sm:max-w-none">
          {activeModel}
        </span>

        {/* Cost Tier Badge - Hide on ultra-small mobile to prevent overcrowding */}
        <span
          className={`text-[8px] sm:text-[8.5px] border px-1 py-0.2 uppercase font-pixel-heading shrink-0 hidden xs:inline-block ${getTierColor(
            costTier
          )}`}
        >
          {costTier || 'cheapest'}
        </span>

        {/* Arrow */}
        <span className="text-[#869184] text-[8.5px] sm:text-[9px] font-pixel-heading ml-0.5 shrink-0">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Retro Pixel Dropdown Modal / Popover */}
      {isOpen && (
        <div className="fixed sm:absolute top-[52px] sm:top-full right-2 sm:right-0 mt-1 sm:mt-2 z-50 w-[520px] max-w-[96vw] bg-[#121615] border-2 border-[#899584] p-2.5 sm:p-3 font-pixel-body text-xs text-[#F0F1DD] shadow-[6px_6px_0_#000000] flex flex-col gap-2.5">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-2 border-b border-[#465047]/70 shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-pixel-heading font-bold text-xs text-[#79D693]">
                ► AI MODEL ROUTER &amp; REASONING SELECTOR
              </span>
              <span className="text-[9px] bg-[#0D110F] text-[#CCF12B] px-1.5 py-0.2 border border-[#465047] font-pixel-heading">
                v1.0
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs font-pixel-heading text-[#869184] hover:text-[#F16E5E] border border-transparent hover:border-[#F16E5E] px-1.5 py-0.2 cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Search Box */}
          <div className="relative shrink-0">
            <span className="absolute left-2.5 top-2 text-[#CCF12B] font-pixel-mono text-xs select-none">
              &gt;
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search model name, version, tier, or reasoning..."
              className="w-full bg-[#0D110F] border-2 border-[#465047] pl-7 pr-8 py-1.5 text-xs text-[#F0F1DD] font-pixel-mono placeholder-[#869184] focus:outline-none focus:border-[#CCF12B]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1.5 text-[#F16E5E] hover:text-[#FF3B30] text-xs font-bold font-pixel-heading cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto custom-scrollbar pb-0.5">
            <span className="text-[9px] font-pixel-heading text-[#869184] uppercase shrink-0">FILTER:</span>
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`text-[9px] font-pixel-heading px-1.5 py-0.2 border cursor-pointer uppercase transition-colors shrink-0 ${
                categoryFilter === 'all'
                  ? 'bg-[#1B211D] text-[#CCF12B] border-[#CCF12B]'
                  : 'bg-[#0D110F] text-[#869184] border-[#465047] hover:text-[#F0F1DD]'
              }`}
            >
              ALL ({catalog.length})
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('text')}
              className={`text-[9px] font-pixel-heading px-1.5 py-0.2 border cursor-pointer uppercase transition-colors shrink-0 ${
                categoryFilter === 'text'
                  ? 'bg-[#1B211D] text-[#36B9ED] border-[#36B9ED]'
                  : 'bg-[#0D110F] text-[#869184] border-[#465047] hover:text-[#F0F1DD]'
              }`}
            >
              TEXT &amp; CODE ({textCount})
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('image')}
              className={`text-[9px] font-pixel-heading px-1.5 py-0.2 border cursor-pointer uppercase transition-colors shrink-0 ${
                categoryFilter === 'image'
                  ? 'bg-[#1B211D] text-[#F5BC4D] border-[#F5BC4D]'
                  : 'bg-[#0D110F] text-[#869184] border-[#465047] hover:text-[#F5BC4D]'
              }`}
            >
              🎨 NANO BANANA IMAGE ({imageCount})
            </button>
          </div>

          {/* Tab Switcher & Auto-Router Quick Action */}
          <div className="flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('catalog')}
                className={`text-[9.5px] font-pixel-heading px-2 py-0.5 border cursor-pointer ${
                  activeTab === 'catalog'
                    ? 'bg-[#1B211D] text-[#CCF12B] border-[#CCF12B]'
                    : 'bg-[#0D110F] text-[#869184] border-[#465047] hover:text-[#F0F1DD]'
                }`}
              >
                MODELS ({filteredCatalog.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tradeoffs')}
                className={`text-[9.5px] font-pixel-heading px-2 py-0.5 border cursor-pointer ${
                  activeTab === 'tradeoffs'
                    ? 'bg-[#1B211D] text-[#36B9ED] border-[#36B9ED]'
                    : 'bg-[#0D110F] text-[#869184] border-[#465047] hover:text-[#F0F1DD]'
                }`}
              >
                AGENT TRADEOFF LEARNING
              </button>
            </div>

            {/* Quick Auto-Router Button */}
            <button
              type="button"
              onClick={handleSelectAuto}
              disabled={isSwitching}
              className={`text-[9px] font-pixel-heading px-2 py-0.5 border cursor-pointer flex items-center gap-1.5 transition-colors ${
                isAutoRouter
                  ? 'bg-[#1B211D] text-[#79D693] border-[#79D693]'
                  : 'bg-[#0D110F] text-[#CCF12B] border-[#CCF12B] hover:bg-[#1B211D]'
              }`}
            >
              <span>⚡</span>
              <span>{isAutoRouter ? 'AUTO-ROUTER ACTIVE' : 'ENABLE AUTO-ROUTER'}</span>
            </button>
          </div>

          {/* Tab 1: Models Catalog List */}
          {activeTab === 'catalog' && (
            <div className="max-h-[360px] overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-1">
              {filteredCatalog.map((model) => {
                const isActive = !isAutoRouter && activeModel === model.id;
                const isAutoActive = isAutoRouter && activeModel === model.id;
                const modelStats = analytics[model.id];

                return (
                  <div
                    key={model.id}
                    onClick={() => handleSelectModel(model.id)}
                    className={`p-2.5 border-2 transition-all cursor-pointer ${
                      isActive || isAutoActive
                        ? 'bg-[#1B211D] border-[#CCF12B] shadow-[2px_2px_0_#CCF12B/30]'
                        : 'bg-[#0D110F] border-[#465047] hover:border-[#899584] hover:bg-[#151B18]'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-pixel-heading font-bold text-xs text-[#F0F1DD]">
                          {model.name}
                        </span>
                        <span className="text-[9px] font-pixel-mono bg-[#121615] text-[#869184] border border-[#465047] px-1 py-0.2">
                          {model.version || model.id}
                        </span>
                        {model.category === 'image' && (
                          <span className="text-[8px] font-pixel-heading bg-[#1B211D] text-[#F5BC4D] border border-[#F5BC4D] px-1.5 py-0.2">
                            IMAGE GEN
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[8.5px] border px-1 py-0.2 uppercase font-pixel-heading ${getTierColor(
                            model.costTier
                          )}`}
                        >
                          {model.costTier}
                        </span>
                        {(isActive || isAutoActive) && (
                          <span className="text-[8.5px] font-pixel-heading bg-[#CCF12B] text-[#090B0A] font-bold px-1.5 py-0.2">
                            ● ACTIVE
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-[11px] text-[#B6BFAE] font-pixel-mono leading-relaxed mb-2">
                      {model.description}
                    </p>

                    {/* Tradeoff Specs Badges */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1.5 border-t border-[#465047]/50 text-[9px] font-pixel-mono">
                      <div className="bg-[#121615] p-1 border border-[#465047]/60">
                        <span className="text-[#869184] block">SPEED:</span>
                        <span className="text-[#CCF12B] font-bold">{model.tradeoffs?.speed || 'Fast'}</span>
                      </div>
                      <div className="bg-[#121615] p-1 border border-[#465047]/60">
                        <span className="text-[#869184] block">REASONING:</span>
                        <span className="text-[#36B9ED] font-bold">
                          {model.tradeoffs?.reasoning || 'Advanced'}
                        </span>
                      </div>
                      <div className="bg-[#121615] p-1 border border-[#465047]/60">
                        <span className="text-[#869184] block">{model.category === 'image' ? 'RESOLUTION:' : 'CONTEXT:'}</span>
                        <span className="text-[#F0F1DD] font-bold">
                          {model.tradeoffs?.contextWindow || (model.category === 'image' ? '1024x1024' : '1M tokens')}
                        </span>
                      </div>
                      <div className="bg-[#121615] p-1 border border-[#465047]/60">
                        <span className="text-[#869184] block">PRICE / 1M:</span>
                        <span className="text-[#79D693] font-bold">
                          ${model.inputCostPer1M} in / ${model.outputCostPer1M} out
                        </span>
                      </div>
                    </div>

                    {/* Benchmark Telemetry (if available from recorded operations) */}
                    {modelStats && (
                      <div className="mt-1.5 flex items-center justify-between text-[8.5px] font-pixel-mono text-[#869184] bg-[#090B0A] px-2 py-0.5 border border-[#465047]/40">
                        <span>
                          OPS RUN: <strong className="text-[#F0F1DD]">{modelStats.totalCalls}</strong>
                        </span>
                        <span>
                          AVG LATENCY:{' '}
                          <strong className="text-[#36B9ED]">{modelStats.avgLatencyMs}ms</strong>
                        </span>
                        <span>
                          SUCCESS:{' '}
                          <strong className="text-[#79D693]">{modelStats.successRate}%</strong>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredCatalog.length === 0 && (
                <div className="text-center py-8 text-[#869184] text-xs font-pixel-mono">
                  &gt; No AI models found matching &quot;{searchQuery}&quot;
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Agent Tradeoff Learning & Telemetry */}
          {activeTab === 'tradeoffs' && (
            <div className="max-h-[360px] overflow-y-auto custom-scrollbar flex flex-col gap-2.5 pr-1">
              <div className="bg-[#0D110F] border border-[#36B9ED] p-2.5 text-[11px] font-pixel-mono leading-relaxed">
                <span className="text-[#36B9ED] font-pixel-heading font-bold block mb-1">
                  ● AGENT AUTONOMOUS DECISION MATRIX
                </span>
                Agents evaluate historical token cost, latency variance, and reasoning depth from the{' '}
                <code className="text-[#CCF12B]">model_operations</code> database to automatically choose
                optimal models for planning vs. high-throughput code editing and QA audits.
              </div>

              {/* Matrix of Models */}
              <div className="flex flex-col gap-2">
                {catalog.map((m) => {
                  const stats = analytics[m.id];
                  return (
                    <div key={m.id} className="bg-[#0D110F] border border-[#465047] p-2 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-pixel-heading text-xs font-bold text-[#F0F1DD]">
                          {m.name}
                        </span>
                        <span
                          className={`text-[8.5px] border px-1 py-0.2 uppercase font-pixel-heading ${getTierColor(
                            m.costTier
                          )}`}
                        >
                          {m.costTier}
                        </span>
                      </div>

                      {/* Recommended For */}
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {m.recommendedFor?.map((rec, i) => (
                          <span
                            key={i}
                            className="text-[8.5px] font-pixel-mono bg-[#1B211D] text-[#79D693] border border-[#465047]/60 px-1.5 py-0.2"
                          >
                            ✓ {rec}
                          </span>
                        ))}
                      </div>

                      {/* Telemetry Metrics */}
                      <div className="grid grid-cols-3 gap-1 text-[9px] font-pixel-mono text-[#869184] bg-[#121615] p-1 border border-[#465047]/50">
                        <div>
                          <span>HISTORICAL CALLS: </span>
                          <span className="text-[#F0F1DD] font-bold">{stats ? stats.totalCalls : 0}</span>
                        </div>
                        <div>
                          <span>AVG LATENCY: </span>
                          <span className="text-[#36B9ED] font-bold">
                            {stats ? `${stats.avgLatencyMs}ms` : 'sub-1s'}
                          </span>
                        </div>
                        <div>
                          <span>SUCCESS RATIO: </span>
                          <span className="text-[#79D693] font-bold">
                            {stats ? `${stats.successRate}%` : '100%'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer Info */}
          <div className="pt-2 border-t border-[#465047]/60 flex items-center justify-between text-[9px] font-pixel-mono text-[#869184] shrink-0">
            <span>Click any model to manually override or select auto-router for adaptive hierarchy.</span>
            <span className="text-[#CCF12B] font-pixel-heading">ESC TO CLOSE</span>
          </div>
        </div>
      )}
    </div>
  );
};

