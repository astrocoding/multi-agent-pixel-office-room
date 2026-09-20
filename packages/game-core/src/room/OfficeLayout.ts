import { AGENT_CONFIGS, AGENT_IDS, type AgentId } from '@agent-office/shared';

export interface RectCollider {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'wall' | 'desk' | 'table' | 'prop' | 'interactive';
  label?: string;
}

export interface FurnitureItem {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  texture: string;
  interactive?: boolean;
  promptText?: string;
  actionType?: 'coffee' | 'water' | 'server' | 'whiteboard' | 'printer';
}

export class OfficeLayout {
  public static readonly WIDTH = 768; // 48 * 16px
  public static readonly HEIGHT = 480; // 30 * 16px
  public static readonly TILE_SIZE = 16;
  public static readonly WALL_HEIGHT = 80; // Taller wall so objects never overlap

  // Perimeter wall colliders
  public static getWalls(): RectCollider[] {
    const w = this.WIDTH;
    const h = this.HEIGHT;
    const wallH = this.WALL_HEIGHT;
    const t = 32; // 32px thick boundary colliders to completely prevent player/NPC tunneling

    return [
      // Top wall is 80px tall
      { id: 'wall_top', x: w / 2, y: wallH / 2, width: w, height: wallH, type: 'wall' },
      // Bottom, left, right perimeter bounds (32px solid barrier)
      { id: 'wall_bottom', x: w / 2, y: h - t / 2, width: w, height: t, type: 'wall' },
      { id: 'wall_left', x: t / 2, y: h / 2, width: t, height: h, type: 'wall' },
      { id: 'wall_right', x: w - t / 2, y: h / 2, width: t, height: h, type: 'wall' },
    ];
  }

  // Interactive office fixtures & furniture with dynamic organic placement
  public static getFurniture(): FurnitureItem[] {
    const furniture: FurnitureItem[] = [
      // Top Wall Decor & Props (Placed cleanly below windows at y=52, well above baseboard at y=76)
      {
        id: 'prop_whiteboard',
        name: 'Architecture Roadmap Whiteboard',
        x: 384,
        y: 50,
        width: 32,
        height: 32,
        texture: 'prop_wall_whiteboard',
        interactive: true,
        promptText: '[E] Inspect Roadmap',
        actionType: 'whiteboard',
      },
      {
        id: 'prop_wall_chart',
        name: 'Performance Metrics Chart',
        x: 436,
        y: 50,
        width: 32,
        height: 32,
        texture: 'prop_wall_chart',
      },
      {
        id: 'prop_clock',
        name: 'Office Wall Clock',
        x: 332,
        y: 48,
        width: 32,
        height: 32,
        texture: 'prop_clock',
      },
      {
        id: 'prop_ac_unit',
        name: 'HVAC Air Conditioner',
        x: 104,
        y: 46,
        width: 32,
        height: 32,
        texture: 'prop_air_conditioner',
      },
      {
        id: 'prop_window_left',
        name: 'Office Panoramic Window 3x1 (West)',
        x: 210,
        y: 42,
        width: 84,
        height: 38,
        texture: 'prop_window_3x1',
      },
      {
        id: 'prop_window_right',
        name: 'Office Panoramic Window 3x1 (East)',
        x: 546,
        y: 42,
        width: 84,
        height: 38,
        texture: 'prop_window_3x1',
      },

      // Top Left: Library & Printing Station
      {
        id: 'prop_bookshelf_a',
        name: 'Documentation Library A',
        x: 48,
        y: 50,
        width: 32,
        height: 32,
        texture: 'prop_bookshelf_a',
      },
      {
        id: 'prop_bookshelf_b',
        name: 'Documentation Library B',
        x: 76,
        y: 50,
        width: 32,
        height: 32,
        texture: 'prop_bookshelf_b',
      },
      {
        id: 'prop_printer',
        name: 'Network Copier / Plotter',
        x: 48,
        y: 110,
        width: 32,
        height: 32,
        texture: 'prop_printer',
        interactive: true,
        promptText: '[E] Print Diagrams',
        actionType: 'printer',
      },
      {
        id: 'prop_trash_bin',
        name: 'Recycle Bin',
        x: 80,
        y: 112,
        width: 32,
        height: 32,
        texture: 'prop_trash_bin',
      },

      // Top Right: High-Density Server Infrastructure & Task Board
      {
        id: 'prop_server_active',
        name: 'Primary Compute Cluster (Active)',
        x: 680,
        y: 50,
        width: 32,
        height: 32,
        texture: 'prop_server_rack_active',
        interactive: true,
        promptText: '[E] Inspect Cluster',
        actionType: 'server',
      },
      {
        id: 'prop_server_standby',
        name: 'Secondary Database Storage',
        x: 714,
        y: 50,
        width: 32,
        height: 32,
        texture: 'prop_server_rack',
        interactive: true,
        promptText: '[E] Inspect Database',
        actionType: 'server',
      },
      {
        id: 'prop_task_board',
        name: 'Sprint Task Board',
        x: 642,
        y: 48,
        width: 32,
        height: 32,
        texture: 'prop_task_board',
      },

      // Bottom Left: Breakroom Refreshment Zone (Coffee & Water)
      {
        id: 'prop_water_cooler',
        name: 'Pure Spring Water Cooler',
        x: 52,
        y: 380,
        width: 32,
        height: 32,
        texture: 'prop_water_cooler',
        interactive: true,
        promptText: '[E] Hydrate',
        actionType: 'water',
      },
      {
        id: 'prop_coffee_machine',
        name: 'Espresso Brew Station',
        x: 88,
        y: 380,
        width: 32,
        height: 32,
        texture: 'prop_coffee_machine',
        interactive: true,
        promptText: '[E] Brew Espresso',
        actionType: 'coffee',
      },
      {
        id: 'prop_plant_corner',
        name: 'Monstera Plant',
        x: 44,
        y: 430,
        width: 32,
        height: 32,
        texture: 'prop_potted_plant',
      },

      // Bottom Center: Executive Boss Station
      {
        id: 'desk_boss',
        name: 'Boss Executive Desk',
        x: 384,
        y: 395,
        width: 32,
        height: 32,
        texture: 'prop_boss_desk',
      },
      {
        id: 'chair_boss',
        name: 'Executive Chair',
        x: 384,
        y: 368,
        width: 32,
        height: 32,
        texture: 'prop_chair_blue',
      },
      {
        id: 'prop_boss_laptop',
        name: 'Boss Terminal',
        x: 384,
        y: 388,
        width: 32,
        height: 32,
        texture: 'prop_laptop',
      },

      // Bottom Right: Executive Lounge & Soft Seating
      {
        id: 'prop_sofa',
        name: 'Comfort Lounge Sofa',
        x: 650,
        y: 405,
        width: 32,
        height: 32,
        texture: 'prop_sofa',
      },
      {
        id: 'prop_round_table',
        name: 'Coffee Lounge Table',
        x: 650,
        y: 362,
        width: 32,
        height: 32,
        texture: 'prop_round_table',
      },
      {
        id: 'prop_vending_machine',
        name: 'Snack Vending Machine',
        x: 718,
        y: 390,
        width: 32,
        height: 32,
        texture: 'prop_vending_machine',
      },
      {
        id: 'prop_big_plant',
        name: 'Ficus Plant',
        x: 720,
        y: 435,
        width: 32,
        height: 32,
        texture: 'prop_big_plant',
      },
    ];

    // Add Workstations & Chairs for the 6 Specialist Agents based on dynamic coordinates
    (Object.keys(AGENT_CONFIGS) as AgentId[]).forEach((agentId) => {
      const cfg = AGENT_CONFIGS[agentId];
      const isDualDesk = agentId === AGENT_IDS.LEADER || agentId === AGENT_IDS.ENGINEERING;
      const deskTexture = isDualDesk ? 'prop_desk_dual' : 'prop_desk_basic';
      const chairTexture =
        agentId === AGENT_IDS.LEADER || agentId === AGENT_IDS.ENGINEERING
          ? 'prop_chair_blue'
          : 'prop_chair_gray';

      // Workstation Desk placed right below agent
      furniture.push({
        id: `desk_${agentId}`,
        name: `${cfg.name}'s Desk`,
        x: cfg.deskX,
        y: cfg.deskY + 8,
        width: 32,
        height: 32,
        texture: deskTexture,
      });

      // Swivel Chair behind desk
      furniture.push({
        id: `chair_${agentId}`,
        name: `${cfg.name}'s Chair`,
        x: cfg.deskX,
        y: cfg.deskY - 14,
        width: 32,
        height: 32,
        texture: chairTexture,
      });

      // Computer Display: only for Leader (Zen) and Engineering (Iky) on dual workstations
      // Removed for Ada, Volt, Mnemo, and Iris to prevent visual obstruction
      if (agentId === AGENT_IDS.LEADER || agentId === AGENT_IDS.ENGINEERING) {
        furniture.push({
          id: `monitor_${agentId}`,
          name: `${cfg.name}'s Display`,
          x: cfg.deskX + 8,
          y: cfg.deskY + 2,
          width: 32,
          height: 32,
          texture: 'prop_monitor',
        });
      }
    });

    return furniture;
  }

  // Physics colliders
  public static getColliders(): RectCollider[] {
    const colliders = [...this.getWalls()];

    this.getFurniture().forEach((item) => {
      if (item.id.startsWith('chair_')) return;
      if (item.id.startsWith('laptop_') || item.id.startsWith('monitor_')) return;
      if (
        item.id === 'prop_wall_chart' ||
        item.id === 'prop_clock' ||
        item.id === 'prop_ac_unit' ||
        item.id === 'prop_boss_laptop' ||
        item.id === 'prop_whiteboard' ||
        item.id === 'prop_bookshelf_a' ||
        item.id === 'prop_bookshelf_b' ||
        item.id === 'prop_task_board' ||
        item.id === 'prop_server_active' ||
        item.id === 'prop_server_standby' ||
        item.id === 'prop_window_left' ||
        item.id === 'prop_window_right'
      ) {
        // Wall mounted props are already blocked by wall_top collider
        return;
      }

      // Desks: collider placed on lower desk body so chair space behind desk is clear
      const isAgentDesk = item.id.startsWith('desk_agent_');
      const isBossDesk = item.id === 'desk_boss';
      let colY = item.y + 4;
      let colH = item.height - 12;
      let colW = item.width - 4;

      if (isAgentDesk) {
        // Physical desk body placed below chair (Y: deskY + 15 to deskY + 29)
        colY = item.y + 14;
        colH = 14;
        const isDual = item.id.includes('leader') || item.id.includes('engineering');
        colW = isDual ? 52 : 36;
      } else if (isBossDesk) {
        colY = item.y + 8;
        colH = 16;
        colW = 44;
      } else if (item.id === 'prop_round_table') {
        // Lounge coffee table collider
        colY = item.y + 2;
        colH = 22;
        colW = 34;
      } else if (item.id === 'prop_sofa') {
        // Lounge sofa collider
        colY = item.y + 2;
        colH = 22;
        colW = 46;
      }

      colliders.push({
        id: `col_${item.id}`,
        x: item.x,
        y: colY,
        width: colW,
        height: colH,
        type: item.id.startsWith('desk') ? 'desk' : 'prop',
        label: item.name,
      });
    });

    return colliders;
  }
}
