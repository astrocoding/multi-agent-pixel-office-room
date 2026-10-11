import React, { useEffect, useState } from 'react';
import { PhaserGame } from './components/PhaserGame.js';
import { TaskPanel } from './components/TaskPanel.js';
import { GlobalChatPanel } from './components/GlobalChatPanel.js';
import { ActivitySidePanel } from './components/ActivitySidePanel.js';
import { AgentStatusOverlay } from './components/AgentStatusOverlay.js';
import { InteractionModal } from './components/InteractionModal.js';
import { socket } from './services/socket.js';
import { useAgentStore } from './stores/useAgentStore.js';
import { useTaskStore } from './stores/useTaskStore.js';
import { useChatStore } from './stores/useChatStore.js';
import { useActivityStore } from './stores/useActivityStore.js';
import { gameBridge } from './game/ui-bridge/GameBridge.js';

export const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [activeModel, setActiveModel] = useState<string>('gemini-3.1-flash-lite');
  const [modelTier, setModelTier] = useState<string>('Tier 1');
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
          setModelTier(data.costTier || 'Auto');
        }
      }
    } catch {
      // ignore
    }
  };

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center font-mono font-bold text-xs text-white shadow">
            AO
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider text-white font-mono flex items-center gap-2">
              AGENT OFFICE ROOM <span className="text-[10px] bg-sky-900/60 text-sky-400 px-1.5 py-0.5 rounded border border-sky-700/60 font-mono">v1.0</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">2D Pixel Simulation • Multi-Agent Autonomous Automation Runtime</p>
          </div>
        </div>

        {/* Status Pill & Controls Guide */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="hidden lg:flex items-center gap-2 text-slate-400 text-[11px] bg-slate-950 px-3 py-1 rounded border border-slate-800">
            <span className="text-amber-400 font-bold">WALK:</span> WASD / Arrows
            <span className="text-slate-600">|</span>
            <span className="text-sky-400 font-bold">INTERACT:</span> [E] or Click NPC
          </div>

          {/* AI Model Auto-Router Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-[11px]">
            <span className="text-purple-400 font-bold">AUTO-ROUTER:</span>
            <span className="text-emerald-400 font-semibold">{activeModel}</span>
            <span className="text-[9px] bg-purple-950/80 text-purple-300 border border-purple-800 px-1 py-0.5 rounded uppercase">
              {modelTier}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]' : 'bg-rose-500'
              }`}
            />
            <span className={`text-[11px] font-bold ${isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isConnected ? 'RUNTIME CONNECTED' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-4 max-w-[1700px] w-full mx-auto flex flex-col gap-3">
        {/* Top 6 Agents Status Cards */}
        <AgentStatusOverlay />

        {/* Middle Section: Game Simulation + Task Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 items-start">
          {/* Phaser Pixel Office Game World */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center">
            <PhaserGame />
          </div>

          {/* Task Lifecycle & Execution Panel */}
          <div className="lg:col-span-5 h-[480px]">
            <TaskPanel />
          </div>
        </div>

        {/* Bottom Section: Dialogue Stream + Activity Stream */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-[280px] max-h-[300px] min-h-0">
          <div className="lg:col-span-6 h-full min-h-0">
            <GlobalChatPanel />
          </div>
          <div className="lg:col-span-6 h-full min-h-0">
            <ActivitySidePanel />
          </div>
        </div>
      </main>

      {/* Proximity Interaction Modal */}
      <InteractionModal />
    </div>
  );
};

export default App;
