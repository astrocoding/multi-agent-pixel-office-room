import React, { useEffect, useState } from 'react';
import { PhaserGame } from './components/PhaserGame.js';
import { TaskPanel } from './components/TaskPanel.js';
import { GlobalChatPanel } from './components/GlobalChatPanel.js';
import { ActivitySidePanel } from './components/ActivitySidePanel.js';
import { ModelRouterSelect } from './components/ModelRouterSelect.js';
import { Footer } from './components/Footer.js';
import { socket } from './services/socket.js';
import { useAgentStore } from './stores/useAgentStore.js';
import { useTaskStore } from './stores/useTaskStore.js';
import { useChatStore } from './stores/useChatStore.js';
import { useActivityStore } from './stores/useActivityStore.js';
import { gameBridge } from './game/ui-bridge/GameBridge.js';
import appLogo from './assets/android-chrome-512x512.png';

export const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [activeModel, setActiveModel] = useState<string>('gemini-3.1-flash-lite');
  const [modelTier, setModelTier] = useState<string>('cheapest');
  const [isAutoRouter, setIsAutoRouter] = useState<boolean>(true);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const { setAgents, updateAgentStatus } = useAgentStore();
  const { setTasks, addTask, updateTask, addTerminalLog, setClarification } = useTaskStore();
  const { addMessage, fetchSessions } = useChatStore();
  const { addActivity, setActivities } = useActivityStore();

  const fetchModelRouter = async () => {
    try {
      const res = await fetch('/api/model-router');
      if (res.ok) {
        const data = await res.json();
        if (data.activeModel) {
          setActiveModel(data.activeModel);
          setModelTier(data.costTier || 'cheapest');
          setIsAutoRouter(data.isAutoRouter ?? true);
        }
      }
    } catch {
      // ignore
    }
  };

  // Prevent auto-scroll restoration jumping the whole page down on hard refresh
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    setIsConnected(socket.connected);
    fetchModelRouter();

    const onConnect = () => {
      setIsConnected(true);
      fetchModelRouter();
    };
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    const pollInterval = setInterval(() => {
      setIsConnected(socket.connected);
    }, 1500);

    // Initial snapshot
    socket.on('room:state', (data) => {
      if (data.agents) setAgents(data.agents);
      if (data.tasks) setTasks(data.tasks);
      if (data.recentActivities) setActivities(data.recentActivities);
    });

    // Agent status update
    socket.on('agent:status', (data) => {
      updateAgentStatus(data.agentId, data.state, data.currentThought, data.currentTaskId);
      gameBridge.updateAgentState(data.agentId, data.state);
    });

    // Agent speech/thought bubble
    socket.on('agent:bubble', (payload) => {
      gameBridge.showBubble(payload);
    });

    // Task lifecycle events
    socket.on('task:created', (task) => {
      addTask(task);
    });

    socket.on('task:updated', (task) => {
      updateTask(task);
    });

    socket.on('tool:executed', (log) => {
      addTerminalLog(log);
    });

    socket.on('task:clarification_needed', (clarification) => {
      setClarification(clarification);
    });

    // Realtime activities
    socket.on('task:activity', (act) => {
      addActivity(act);
      if (act.eventType === 'MODEL_SWITCHED') {
        fetchModelRouter();
      }
    });

    // Chat messages & sessions
    socket.on('chat:message', (msg) => {
      addMessage(msg);
    });

    socket.on('chat:session_created', () => {
      fetchSessions();
    });
    socket.on('chat:session_updated', () => {
      fetchSessions();
    });
    socket.on('chat:session_deleted', () => {
      fetchSessions();
    });

    // Agent summon by Boss mention in chat
    socket.on('agent:summon' as any, (data: any) => {
      gameBridge.emit('agent:summon', data);
    });

    return () => {
      clearInterval(pollInterval);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state');
      socket.off('agent:status');
      socket.off('agent:bubble');
      socket.off('task:created');
      socket.off('task:updated');
      socket.off('tool:executed');
      socket.off('task:clarification_needed');
      socket.off('task:activity');
      socket.off('chat:message');
      socket.off('chat:session_created');
      socket.off('chat:session_updated');
      socket.off('chat:session_deleted');
      socket.off('agent:summon' as any);
    };
  }, [setAgents, updateAgentStatus, setTasks, addTask, updateTask, addActivity, setActivities, addMessage, fetchSessions]);

  return (
    <div className="min-h-screen bg-[#090B0A] text-[#F0F1DD] flex flex-col font-pixel-body">
      {/* Top Header Bar - Authentic Retro Terminal Control Bar */}
      <header
        className={`bg-[#121615] border-[#465047] px-3 sm:px-4 flex items-center justify-between shrink-0 transition-all duration-300 ease-in-out ${
          isNavbarVisible
            ? 'max-h-20 py-2 border-b-2 opacity-100 translate-y-0 shadow-[0_2px_0_#000]'
            : 'max-h-0 py-0 border-b-0 opacity-0 -translate-y-full overflow-hidden pointer-events-none shadow-none'
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <img
            src={appLogo}
            alt="Agent Office Room"
            className="w-8 h-8 object-contain shrink-0 select-none"
          />
          {/* Title & Version - Hidden on mobile screens */}
          <h1 className="hidden sm:flex text-xs sm:text-sm font-bold tracking-wider text-[#F0F1DD] font-pixel-heading items-center gap-2 whitespace-nowrap">
            AGENT OFFICE ROOM{' '}
            <span className="text-[9px] bg-[#0D110F] text-[#CCF12B] px-1.5 py-0.5 border border-[#465047] font-pixel-heading">
              v1.0
            </span>
          </h1>
        </div>

        {/* Model Router Select Dropdown, Runtime Connection Pill, & Close Navbar Button */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs font-pixel-heading shrink-0">
          {/* Custom Model Router Selector Dropdown */}
          <ModelRouterSelect
            activeModel={activeModel}
            costTier={modelTier}
            isAutoRouter={isAutoRouter}
            onModelSwitched={fetchModelRouter}
          />

          {/* Runtime Connection Pill - Hidden on mobile screens */}
          <div className="hidden sm:flex items-center gap-1.5 bg-[#0D110F] border border-[#465047] px-2.5 py-1 whitespace-nowrap">
            <span
              className={`w-2 h-2 ${
                isConnected ? 'bg-[#79D693]' : 'bg-[#F16E5E]'
              }`}
            />
            <span
              className={`text-[10px] font-bold tracking-wider uppercase ${
                isConnected ? 'text-[#79D693]' : 'text-[#F16E5E]'
              }`}
            >
              {isConnected ? 'connected' : 'offline'}
            </span>
          </div>

          {/* Close Navbar Button */}
          <button
            type="button"
            onClick={() => setIsNavbarVisible(false)}
            className="bg-[#0D110F] border border-[#465047] hover:border-[#CCF12B] text-[#869184] hover:text-[#CCF12B] px-2 py-1 flex items-center justify-center transition-colors cursor-pointer shadow-[1px_1px_0_#000] active:translate-x-[1px] active:translate-y-[1px]"
            title="Hide Navbar Header"
            aria-label="Hide Navbar Header"
          >
            <span className="text-[11px] font-pixel-heading leading-none">✕</span>
          </button>
        </div>
      </header>

      {/* Fixed Half-Circle Re-open Navbar Button */}
      <button
        type="button"
        onClick={() => setIsNavbarVisible(true)}
        className={`navbar-toggle-half-circle fixed top-0 right-3 sm:right-4 z-50 bg-[#121615] border-x-2 border-b-2 border-[#465047] hover:border-[#CCF12B] text-[#CCF12B] hover:bg-[#1B221F] w-12 h-5 flex items-center justify-center shadow-[0_4px_8px_rgba(0,0,0,0.7)] cursor-pointer transition-all duration-300 ease-in-out group ${
          !isNavbarVisible
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : '-translate-y-full opacity-0 pointer-events-none'
        }`}
        title="Show Navbar Header"
        aria-label="Show Navbar Header"
      >
        <span className="font-pixel-heading text-[9px] leading-none text-[#CCF12B] group-hover:translate-y-0.5 transition-transform -mt-0.5 select-none">
          ▼
        </span>
      </button>

      {/* Main Container - Automatically fills the navbar space without blank gap when navbar is hidden */}
      <main className="flex-1 p-3 sm:p-4 max-w-[1750px] w-full mx-auto flex flex-col gap-3 transition-all duration-300 ease-in-out">
        {/* 2-Column Balanced Layout:
            Left Column: Game World + Task Dispatch Engine (Matching Game Width, Comfortable Height)
            Right Column: Office Chat (Proportionally Balanced Full Height) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 items-stretch min-h-0">
          {/* Left Column (lg:col-span-7): Pixel Game on Top, Task Dispatch underneath */}
          <div className="lg:col-span-7 flex flex-col gap-3 min-h-0">
            <div className="flex flex-col items-center justify-center w-full">
              <PhaserGame />
            </div>
            <div className="h-[280px] max-h-[300px] min-h-0">
              <TaskPanel />
            </div>
          </div>

          {/* Right Column (lg:col-span-5): Office Chat with balanced height */}
          <div className="lg:col-span-5 h-[772px] max-h-[780px] min-h-0 flex flex-col">
            <GlobalChatPanel />
          </div>
        </div>
      </main>

      {/* Retro Pixel Footer Component */}
      <Footer
        onOpenActivityLog={() => setIsActivityLogOpen(true)}
        isConnected={isConnected}
        activeModel={activeModel}
      />

      {/* Realtime Activity Log Modal */}
      {isActivityLogOpen && (
        <ActivitySidePanel
          isOpen={isActivityLogOpen}
          onClose={() => setIsActivityLogOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
