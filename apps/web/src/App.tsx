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
    <div className="min-h-screen bg-[#090B0A] text-[#F0F1DD] flex flex-col font-pixel-body">
      {/* Top Header Bar - Authentic Retro Terminal Control Bar */}
      <header className="bg-[#121615] border-b-2 border-[#465047] px-4 py-2 flex items-center justify-between shrink-0 shadow-[0_2px_0_#000]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1B211D] border-2 border-[#CCF12B] flex items-center justify-center font-pixel-heading font-bold text-xs text-[#CCF12B] shadow-[2px_2px_0_#000000]">
            AO
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-bold tracking-wider text-[#F0F1DD] font-pixel-heading flex items-center gap-2">
              AGENT OFFICE ROOM{' '}
              <span className="text-[9px] bg-[#0D110F] text-[#CCF12B] px-1.5 py-0.5 border border-[#465047] font-pixel-heading">
                v1.0
              </span>
            </h1>
            <p className="text-[11px] text-[#B6BFAE] font-pixel-body">
              2D Pixel Simulation • Multi-Agent Autonomous Automation Runtime
            </p>
          </div>
        </div>

        {/* Status Pill & Controls Guide */}
        <div className="flex items-center gap-3 text-xs font-pixel-heading">
          <div className="hidden lg:flex items-center gap-2 text-[#B6BFAE] text-[10px] bg-[#0D110F] px-2.5 py-1 border border-[#465047]">
            <span className="text-[#CCF12B] font-bold">WALK:</span> WASD / ARROWS
            <span className="text-[#465047]">|</span>
            <span className="text-[#36B9ED] font-bold">INTERACT:</span> [E] OR CLICK NPC
          </div>

          {/* AI Model Auto-Router Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-[#0D110F] border border-[#465047] text-[10px]">
            <span className="text-[#36B9ED] font-bold">ROUTER:</span>
            <span className="text-[#F0F1DD] font-semibold">{activeModel}</span>
            <span className="text-[9px] bg-[#1B211D] text-[#CCF12B] border border-[#465047] px-1 py-0.2 uppercase">
              {modelTier}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-[#0D110F] border border-[#465047] px-2.5 py-1">
            <span
              className={`w-2 h-2 ${
                isConnected ? 'bg-[#79D693]' : 'bg-[#F16E5E]'
              }`}
            />
            <span className={`text-[10px] font-bold ${isConnected ? 'text-[#79D693]' : 'text-[#F16E5E]'}`}>
              {isConnected ? '● RUNTIME CONNECTED' : '■ OFFLINE'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-3 sm:p-4 max-w-[1750px] w-full mx-auto flex flex-col gap-3">
        {/* Top 6 Agents Status Cards */}
        <AgentStatusOverlay />

        {/* Middle Section: Game Simulation + Office Chat */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 items-start">
          {/* Phaser Pixel Office Game World */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center">
            <PhaserGame />
          </div>

          {/* Office Chat (Global Chat Panel) */}
          <div className="lg:col-span-5 h-[480px]">
            <GlobalChatPanel />
          </div>
        </div>

        {/* Bottom Section: Task Dispatch & Autonomous Engine + Realtime Activity Log */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-auto lg:h-[420px] lg:max-h-[440px] min-h-0">
          <div className="lg:col-span-6 h-[420px] lg:h-full min-h-0">
            <TaskPanel />
          </div>
          <div className="lg:col-span-6 h-[420px] lg:h-full min-h-0">
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
