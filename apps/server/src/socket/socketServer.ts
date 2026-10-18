import { Server as SocketIOServer, Socket } from 'socket.io';
import type { Server as HttpServer } from 'http';
import {
  AGENT_IDS,
  type AgentId,
  type AgentRuntimeState,
  type BubbleChatPayload,
  type ChatMessage,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type Task,
  type TaskActivity,
} from '@agent-office/shared';
import { DbQueries } from '../db/queries.js';

export class SocketServerBridge {
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
  private onTaskSubmitted?: (
    title: string,
    description: string,
    targetAgentId?: AgentId,
    attachments?: import('@agent-office/shared').TaskAttachment[]
  ) => Promise<string>;
  private onClarificationReceived?: (taskId: string, response: string) => Promise<void>;
  private onChatReceived?: (
    text: string,
    recipient?: AgentId,
    attachments?: import('@agent-office/shared').TaskAttachment[],
    sessionId?: string,
    type?: 'dialogue' | 'instruct',
    metadata?: Record<string, unknown>
  ) => Promise<void>;

  constructor(httpServer: HttpServer, allowedOrigin = '*') {
    this.io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
      cors: {
        origin: allowedOrigin,
        methods: ['GET', 'POST'],
      },
    });

    this.setupListeners();
  }

  public setTaskSubmitHandler(
    fn: (
      title: string,
      description: string,
      targetAgentId?: AgentId,
      attachments?: import('@agent-office/shared').TaskAttachment[]
    ) => Promise<string>
  ): void {
    this.onTaskSubmitted = fn;
  }

  public setClarificationHandler(fn: (taskId: string, response: string) => Promise<void>): void {
    this.onClarificationReceived = fn;
  }

  public setChatReceiveHandler(
    fn: (
      text: string,
      recipient?: AgentId,
      attachments?: import('@agent-office/shared').TaskAttachment[],
      sessionId?: string,
      type?: 'dialogue' | 'instruct',
      metadata?: Record<string, unknown>
    ) => Promise<void>
  ): void {
    this.onChatReceived = fn;
  }

  public broadcastSessionCreated(session: import('@agent-office/shared').ChatSession): void {
    this.io.emit('chat:session_created', session);
  }

  public broadcastSessionUpdated(session: import('@agent-office/shared').ChatSession): void {
    this.io.emit('chat:session_updated', session);
  }

  public broadcastSessionDeleted(sessionId: string): void {
    this.io.emit('chat:session_deleted', { sessionId });
  }

  private setupListeners(): void {
    this.io.on('connection', async (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
      console.log(`[Socket] Client connected: ${socket.id}`);

      // Send initial room snapshot
      try {
        const [agents, tasks, recentActivities] = await Promise.all([
          DbQueries.getAgentStates(),
          DbQueries.getTasks(15),
          DbQueries.getRecentActivities(25),
        ]);

        socket.emit('room:state', {
          agents,
          tasks,
          recentActivities,
        });
      } catch (err: unknown) {
        console.error('[Socket] Failed to send initial room state:', (err as Error).message);
      }

      // Handle boss player movement in office room
      socket.on('player:move', (data) => {
        socket.broadcast.emit('player:move' as any, { socketId: socket.id, ...data });
      });

      // Handle task submission
      socket.on('task:submit', async (data, callback) => {
        try {
          if (this.onTaskSubmitted) {
            const taskId = await this.onTaskSubmitted(
              data.title,
              data.description,
              data.targetAgentId,
              data.attachments
            );
            callback?.({ success: true, taskId });
          } else {
            callback?.({ success: false, error: 'Task orchestrator not ready' });
          }
        } catch (err: unknown) {
          callback?.({ success: false, error: (err as Error).message });
        }
      });

      // Handle clarification response from Boss
      socket.on('task:clarify', async (data, callback) => {
        try {
          if (this.onClarificationReceived) {
            await this.onClarificationReceived(data.taskId, data.response);
            callback?.({ success: true });
          } else {
            callback?.({ success: false });
          }
        } catch {
          callback?.({ success: false });
        }
      });

      // Handle chat message
      socket.on('chat:send', async (data) => {
        let recipient = data.recipientAgentId;
        const text = data.text || '';
        let mentionedAgentId: AgentId | undefined = undefined;

        // Auto-detect mention of agents by @Name
        if (/@zen\b/i.test(text) || /@atlas\b/i.test(text)) {
          recipient = AGENT_IDS.LEADER;
          mentionedAgentId = AGENT_IDS.LEADER;
        } else if (/@dre\b/i.test(text) || /@ada\b/i.test(text)) {
          recipient = AGENT_IDS.RESEARCH;
          mentionedAgentId = AGENT_IDS.RESEARCH;
        } else if (/@iky\b/i.test(text) || /@torvalds\b/i.test(text)) {
          recipient = AGENT_IDS.ENGINEERING;
          mentionedAgentId = AGENT_IDS.ENGINEERING;
        } else if (/@gus\b/i.test(text) || /@eca\b/i.test(text) || /@volt\b/i.test(text)) {
          recipient = AGENT_IDS.AUTOMATION;
          mentionedAgentId = AGENT_IDS.AUTOMATION;
        } else if (/@rai\b/i.test(text) || /@iris\b/i.test(text)) {
          recipient = AGENT_IDS.QA;
          mentionedAgentId = AGENT_IDS.QA;
        } else if (/@dhea\b/i.test(text) || /@mnemo\b/i.test(text)) {
          recipient = AGENT_IDS.MEMORY;
          mentionedAgentId = AGENT_IDS.MEMORY;
        } else if (recipient) {
          mentionedAgentId = recipient;
        }

        let sessionId = data.sessionId;
        if (!sessionId) {
          const sessions = await DbQueries.getChatSessions(1);
          if (sessions.length > 0) {
            sessionId = sessions[0].id;
          } else {
            const newSession = await DbQueries.createChatSession({
              id: `session_${Date.now()}`,
              title: DbQueries.extractChatTitle(data.text),
            });
            sessionId = newSession.id;
            this.broadcastSessionCreated(newSession);
          }
        }

        // Auto-update session title from first prompt if title is 'New Chat'
        const currentSession = await DbQueries.getChatSessionById(sessionId);
        if (currentSession && (currentSession.title === 'New Chat' || currentSession.messageCount === 0)) {
          const newTitle = DbQueries.extractChatTitle(data.text);
          if (newTitle && newTitle !== currentSession.title) {
            const updated = await DbQueries.updateChatSession(sessionId, { title: newTitle });
            if (updated) {
              this.broadcastSessionUpdated(updated);
            }
          }
        }

        const msgType = data.type === 'instruct' ? 'instruct' : 'dialogue';
        const msgMetadata = data.metadata || (data.type === 'instruct' && recipient ? {
          source: 'character_proximity',
          targetAgentId: recipient,
        } : {});

        const msgId = `msg_${Date.now()}`;
        // Persist message to database
        await DbQueries.createChatMessage({
          id: msgId,
          sessionId,
          sender: 'boss',
          senderName: 'Boss (You)',
          text: data.text,
          type: msgType,
          mentionedAgents: mentionedAgentId ? [mentionedAgentId] : [],
          metadata: msgMetadata,
        }).catch((e) => console.error('[Socket] Failed to persist boss chat message:', e));

        const msg: ChatMessage = {
          id: msgId,
          sessionId,
          sender: 'boss',
          senderName: 'Boss (You)',
          text: data.text,
          timestamp: new Date().toISOString(),
          type: msgType,
          mentionedAgents: mentionedAgentId ? [mentionedAgentId] : [],
          metadata: msgMetadata,
        };

        this.broadcastChat(msg);
        this.broadcastBubble({
          agentId: 'boss',
          text: data.text,
          durationMs: 4000,
        });

        // Broadcast summon event so NPC in 2D pixel room walks to Boss
        if (mentionedAgentId) {
          this.io.emit('agent:summon', {
            agentId: mentionedAgentId,
            reason: msgType === 'instruct' ? 'direct_instruct' : 'mentioned_in_chat',
            text: data.text,
          });
        }

        if (this.onChatReceived) {
          await this.onChatReceived(data.text, recipient, data.attachments, sessionId, msgType, msgMetadata);
        }
      });

      // Handle NPC interaction prompt
      socket.on('agent:interact', async (data) => {
        this.broadcastBubble({
          agentId: data.agentId,
          text: `Hello Boss! Ready to receive instructions or report on tasks.`,
          durationMs: 3500,
        });
      });

      socket.on('disconnect', () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
      });
    });
  }

  // Broadcasters
  public broadcastStatus(data: {
    agentId: AgentId;
    state: AgentRuntimeState['state'];
    currentTaskId?: string | null;
    currentThought?: string;
  }): void {
    this.broadcastAgentStatus(data);
  }

  public broadcastAgentStatus(data: {
    agentId: AgentId;
    state: AgentRuntimeState['state'];
    currentTaskId?: string | null;
    currentThought?: string;
  }): void {
    this.io.emit('agent:status', data);
  }

  public broadcastBubble(payload: BubbleChatPayload): void {
    this.io.emit('agent:bubble', payload);
  }

  public broadcastTaskCreated(task: Task): void {
    this.io.emit('task:created', task);
  }

  public broadcastTaskUpdated(task: Task): void {
    this.io.emit('task:updated', task);
  }

  public broadcastActivity(activity: TaskActivity): void {
    this.io.emit('task:activity', activity);
  }

  public broadcastToolExecuted(record: import('@agent-office/shared').ToolExecutionRecord): void {
    this.io.emit('tool:executed', record);
  }

  public broadcastClarificationNeeded(data: import('@agent-office/shared').ClarificationRequest): void {
    this.io.emit('task:clarification_needed', data);
  }

  public broadcastChat(message: ChatMessage): void {
    this.io.emit('chat:message', message);
  }

  public broadcastSystemNotification(level: 'info' | 'warn' | 'error', message: string): void {
    this.io.emit('system:notification', { level, message });
  }
}

