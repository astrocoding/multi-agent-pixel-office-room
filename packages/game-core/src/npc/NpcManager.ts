import { AGENT_CONFIGS, AGENT_IDS, type AgentId } from '@agent-office/shared';

export interface ProximityResult {
  isNear: boolean;
  closestAgentId: AgentId | null;
  distance: number;
  spotX: number;
  spotY: number;
}

export class NpcManager {
  public static getInitialAgentPositions(): Record<AgentId, { x: number; y: number }> {
    const positions = {} as Record<AgentId, { x: number; y: number }>;
    (Object.keys(AGENT_CONFIGS) as AgentId[]).forEach((id) => {
      const cfg = AGENT_CONFIGS[id];
      // Agent sits right at their workstation
      positions[id] = {
        x: cfg.deskX,
        y: cfg.deskY - 8,
      };
    });
    return positions;
  }

  public static getInteractionSpot(agentId: AgentId): { x: number; y: number } {
    const cfg = AGENT_CONFIGS[agentId];
    return {
      x: cfg.deskX,
      y: cfg.deskY + 28,
    };
  }

  public static checkProximity(
    playerX: number,
    playerY: number,
    agentPositions: Record<AgentId, { x: number; y: number }>,
    interactionRadius: number = 60
  ): ProximityResult {
    let closestAgentId: AgentId | null = null;
    let minDistance = Infinity;
    let spotX = 0;
    let spotY = 0;

    for (const [id] of Object.entries(agentPositions) as [AgentId, { x: number; y: number }][]) {
      const spot = this.getInteractionSpot(id);
      const dx = playerX - spot.x;
      const dy = playerY - spot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDistance) {
        minDistance = dist;
        closestAgentId = id;
        spotX = spot.x;
        spotY = spot.y;
      }
    }

    if (minDistance <= interactionRadius && closestAgentId) {
      return {
        isNear: true,
        closestAgentId,
        distance: minDistance,
        spotX,
        spotY,
      };
    }

    return {
      isNear: false,
      closestAgentId: null,
      distance: minDistance,
      spotX,
      spotY,
    };
  }
}
