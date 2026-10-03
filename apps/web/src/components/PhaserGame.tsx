import React, { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import { createGameConfig } from '../game/game.config.js';
import { gameBridge } from '../game/ui-bridge/GameBridge.js';
import { useAgentStore } from '../stores/useAgentStore.js';
import { socket } from '../services/socket.js';
import { OfficeLayout } from '@agent-office/game-core';

export const PhaserGame: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const { setNearbyAgentId, setSelectedAgentId } = useAgentStore();

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const config = createGameConfig(containerRef.current);
    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Listen to game events
    const unsubProximity = gameBridge.on('player:proximity', (data) => {
      setNearbyAgentId(data.isNear ? data.agentId : null);
    });

    const unsubInteract = gameBridge.on('player:interact_request', (data) => {
      setSelectedAgentId(data.agentId);
      socket.emit('agent:interact', { agentId: data.agentId, intent: 'talk' });
    });

    const unsubPos = gameBridge.on('player:position', (data) => {
      socket.emit('player:move', { x: data.x, y: data.y, direction: 'idle' });
    });

    return () => {
      unsubProximity();
      unsubInteract();
      unsubPos();
      game.destroy(true);
      gameRef.current = null;
    };
  }, [setNearbyAgentId, setSelectedAgentId]);

  return (
    <div className="relative w-full h-[480px] bg-slate-950 rounded-lg overflow-hidden border-2 border-slate-700 shadow-2xl flex items-center justify-center select-none">
      <div
        ref={containerRef}
        id="game-canvas"
        style={{ width: `${OfficeLayout.WIDTH}px`, height: `${OfficeLayout.HEIGHT}px` }}
      />
    </div>
  );
};
