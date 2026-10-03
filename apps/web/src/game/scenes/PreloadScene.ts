import * as Phaser from 'phaser';
import { AGENT_CONFIGS, AGENT_IDS, type AgentId } from '@agent-office/shared';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  public preload(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Loading background
    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 1);
    bg.fillRect(0, 0, width, height);

    const titleText = this.add.text(width / 2, height / 2 - 24, 'AGENT OFFICE ROOM', {
      fontFamily: 'monospace, sans-serif',
      fontSize: '20px',
      color: '#38BDF8',
      fontStyle: 'bold',
    });
    titleText.setOrigin(0.5, 0.5);

    const progressText = this.add.text(width / 2, height / 2 + 16, 'Loading 2D Pixel Assets...', {
      fontFamily: 'monospace, sans-serif',
      fontSize: '12px',
      color: '#94A3B8',
    });
    progressText.setOrigin(0.5, 0.5);

    // Progress bar
    const progressBox = this.add.graphics();
    const progressBar = this.add.graphics();
    progressBox.fillStyle(0x1e293b, 0.8);
    progressBox.fillRoundedRect(width / 2 - 120, height / 2 + 40, 240, 10, 5);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x38bdf8, 1);
      progressBar.fillRoundedRect(width / 2 - 120, height / 2 + 40, 240 * value, 10, 5);
      progressText.setText(`Loading 2D Pixel Assets... ${Math.round(value * 100)}%`);
    });

    // 1. CHARACTER SPRITESHEETS (96x128 px, 3 cols x 4 rows, 32x32 frames)
    this.load.spritesheet('char_boss', '/assets/characters/boss_32x32.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('char_agent_leader', '/assets/characters/leader_32x32.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('char_agent_research', '/assets/characters/research_32x32.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('char_agent_engineering', '/assets/characters/engineering_32x32.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('char_agent_automation', '/assets/characters/automation_32x32.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('char_agent_qa', '/assets/characters/qa_32x32.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('char_agent_memory', '/assets/characters/memory_32x32.png', {
      frameWidth: 32,
      frameHeight: 32,
    });

    // 2. TILESETS (16x16 tiles)
    this.load.spritesheet('office_tileset', '/assets/tiles/office_tileset_16x16.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    // Individual tiles for direct scene placement
    this.load.image('floor_gray_a', '/assets/tiles/floor_gray_a.png');
    this.load.image('floor_gray_b', '/assets/tiles/floor_gray_b.png');
    this.load.image('floor_gray_light', '/assets/tiles/floor_gray_light.png');
    this.load.image('floor_blue', '/assets/tiles/floor_blue.png');
    this.load.image('floor_wood_a', '/assets/tiles/floor_wood_a.png');
    this.load.image('floor_wood_b', '/assets/tiles/floor_wood_b.png');
    this.load.image('floor_wood_dark', '/assets/tiles/floor_wood_dark.png');
    this.load.image('floor_server', '/assets/tiles/floor_server.png');
    this.load.image('floor_mat', '/assets/tiles/floor_mat.png');
    this.load.image('floor_rug_blue', '/assets/tiles/floor_rug_blue.png');
    this.load.image('floor_rug_gold', '/assets/tiles/floor_rug_gold.png');
    this.load.image('floor_carpet_navy', '/assets/tiles/floor_carpet_navy.png');
    this.load.image('wall_white', '/assets/tiles/wall_white.png');
    this.load.image('wall_window', '/assets/tiles/wall_window.png');
    this.load.image('wall_baseboard', '/assets/tiles/wall_baseboard.png');
    this.load.image('wall_brick_baseboard', '/assets/tiles/wall_brick_baseboard.png');
    this.load.image('wall_corner', '/assets/tiles/wall_corner.png');
    this.load.image('wall_brick', '/assets/tiles/wall_brick.png');
    this.load.image('door_top', '/assets/tiles/door_top.png');
    this.load.image('door_bottom', '/assets/tiles/door_bottom.png');
    this.load.image('floor_threshold', '/assets/tiles/floor_threshold.png');

    // 3. PROPS & FURNITURE (32x32 individual images and atlas)
    this.load.spritesheet('office_props_atlas', '/assets/props/office_props_atlas_32x32.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.image('prop_boss_desk', '/assets/props/boss_desk.png');
    this.load.image('prop_desk_dual', '/assets/props/desk_dual.png');
    this.load.image('prop_desk_basic', '/assets/props/desk_basic.png');
    this.load.image('prop_chair_gray', '/assets/props/chair_gray.png');
    this.load.image('prop_chair_blue', '/assets/props/chair_blue.png');
    this.load.image('prop_monitor', '/assets/props/monitor.png');
    this.load.image('prop_laptop', '/assets/props/laptop.png');
    this.load.image('prop_keyboard', '/assets/props/keyboard.png');
    this.load.image('prop_pc_tower', '/assets/props/pc_tower.png');
    this.load.image('prop_bookshelf_a', '/assets/props/bookshelf_a.png');
    this.load.image('prop_bookshelf_b', '/assets/props/bookshelf_b.png');
    this.load.image('prop_filing_cabinet', '/assets/props/filing_cabinet.png');
    this.load.image('prop_server_rack', '/assets/props/server_rack.png');
    this.load.image('prop_server_rack_active', '/assets/props/server_rack_active.png');
    this.load.image('prop_printer', '/assets/props/printer.png');
    this.load.image('prop_water_cooler', '/assets/props/water_cooler.png');
    this.load.image('prop_coffee_machine', '/assets/props/coffee_machine.png');
    this.load.image('prop_potted_plant', '/assets/props/potted_plant.png');
    this.load.image('prop_big_plant', '/assets/props/big_plant.png');
    this.load.image('prop_cactus', '/assets/props/cactus.png');
    this.load.image('prop_wall_chart', '/assets/props/wall_chart.png');
    this.load.image('prop_wall_whiteboard', '/assets/props/wall_whiteboard.png');
    this.load.image('prop_sofa', '/assets/props/sofa.png');
    this.load.image('prop_meeting_table', '/assets/props/meeting_table.png');
    this.load.image('prop_round_table', '/assets/props/round_table.png');
    this.load.image('prop_stool', '/assets/props/stool.png');
    this.load.image('prop_trash_bin', '/assets/props/trash_bin.png');
    this.load.image('prop_vending_machine', '/assets/props/vending_machine.png');
    this.load.image('prop_office_door', '/assets/props/office_door.png');
    this.load.image('prop_window', '/assets/props/window.png');
    this.load.image('prop_window_3x1', '/assets/props/window_3x1.png');
    this.load.image('prop_partition', '/assets/props/partition.png');
    this.load.image('prop_air_conditioner', '/assets/props/air_conditioner.png');
    this.load.image('prop_small_rug', '/assets/props/small_rug.png');
    this.load.image('prop_task_board', '/assets/props/task_board.png');
    this.load.image('prop_phone', '/assets/props/phone.png');
    this.load.image('prop_desk_lamp', '/assets/props/desk_lamp.png');
    this.load.image('prop_file_stack', '/assets/props/file_stack.png');
    this.load.image('prop_clock', '/assets/props/clock.png');

    // 4. UI ICONS & BUBBLE (16x16 icons, 48x24 bubble)
    this.load.spritesheet('office_ui_icons', '/assets/ui/office_ui_icons_16x16.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.image('ui_speech_bubble', '/assets/ui/speech_bubble_48x24.png');
    this.load.image('icon_thinking', '/assets/ui/icon_thinking.png');
    this.load.image('icon_working', '/assets/ui/icon_working.png');
    this.load.image('icon_success', '/assets/ui/icon_success.png');
    this.load.image('icon_blocked', '/assets/ui/icon_blocked.png');
    this.load.image('icon_warning', '/assets/ui/icon_warning.png');
    this.load.image('icon_task', '/assets/ui/icon_task.png');
    this.load.image('icon_tool', '/assets/ui/icon_tool.png');
    this.load.image('icon_memory', '/assets/ui/icon_memory.png');
    this.load.image('icon_review', '/assets/ui/icon_review.png');
    this.load.image('icon_boss', '/assets/ui/icon_boss.png');
    this.load.image('icon_leader', '/assets/ui/icon_leader.png');
    this.load.image('icon_star', '/assets/ui/icon_star.png');
    this.load.image('icon_approval', '/assets/ui/icon_approval.png');
  }

  public create(): void {
    this.createCharacterAnimations();
    this.createPortraitsFromSpritesheets();
    this.generateTargetRingTexture();

    // Start office scene
    this.scene.start('OfficeScene');
  }

  // 1. CHARACTER ANIMATIONS (Walk cycles for all directions)
  private createCharacterAnimations(): void {
    const characterKeys = [
      'char_boss',
      'char_agent_leader',
      'char_agent_research',
      'char_agent_engineering',
      'char_agent_automation',
      'char_agent_qa',
      'char_agent_memory',
    ];

    characterKeys.forEach((key) => {
      // Down walk: frames [1, 0, 2, 0]
      this.anims.create({
        key: `${key}-walk-down`,
        frames: this.anims.generateFrameNumbers(key, { frames: [1, 0, 2, 0] }),
        frameRate: 6,
        repeat: -1,
      });

      // Left walk: frames [4, 3, 5, 3]
      this.anims.create({
        key: `${key}-walk-left`,
        frames: this.anims.generateFrameNumbers(key, { frames: [4, 3, 5, 3] }),
        frameRate: 6,
        repeat: -1,
      });

      // Right walk: frames [7, 6, 8, 6]
      this.anims.create({
        key: `${key}-walk-right`,
        frames: this.anims.generateFrameNumbers(key, { frames: [7, 6, 8, 6] }),
        frameRate: 6,
        repeat: -1,
      });

      // Up walk: frames [10, 9, 11, 9]
      this.anims.create({
        key: `${key}-walk-up`,
        frames: this.anims.generateFrameNumbers(key, { frames: [10, 9, 11, 9] }),
        frameRate: 6,
        repeat: -1,
      });
    });
  }

  // 2. PORTRAITS EXTRACTED DIRECTLY FROM SPRITESHEET (Frame 0 = front-facing chibi head)
  private createPortraitsFromSpritesheets(): void {
    const list: { id: string; spriteKey: string; color: string }[] = [
      { id: 'boss', spriteKey: 'char_boss', color: '#D97706' },
      { id: AGENT_IDS.LEADER, spriteKey: 'char_agent_leader', color: '#1D4ED8' },
      { id: AGENT_IDS.RESEARCH, spriteKey: 'char_agent_research', color: '#7C3AED' },
      { id: AGENT_IDS.ENGINEERING, spriteKey: 'char_agent_engineering', color: '#059669' },
      { id: AGENT_IDS.AUTOMATION, spriteKey: 'char_agent_automation', color: '#EA580C' },
      { id: AGENT_IDS.QA, spriteKey: 'char_agent_qa', color: '#DB2777' },
      { id: AGENT_IDS.MEMORY, spriteKey: 'char_agent_memory', color: '#0284C7' },
    ];

    list.forEach((item) => {
      const portrait = this.textures.createCanvas(`portrait_${item.id}`, 40, 40);
      if (!portrait) return;
      const ctx = portrait.context;

      // Dark frame with agent accent border
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, 40, 40);
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(2, 2, 36, 36);

      // Accent border
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(1, 1, 38, 38);

      // Draw the front-facing character frame (frame 0) scaled up into the portrait
      const source = this.textures.get(item.spriteKey)?.getSourceImage() as HTMLImageElement;
      if (source) {
        // Source frame 0: rect (0, 0, 32, 32)
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(source, 0, 0, 32, 32, 4, 4, 32, 32);
      }

      portrait.refresh();
    });
  }

  // 3. TARGET RING INDICATOR TEXTURE
  private generateTargetRingTexture(): void {
    const ring = this.textures.createCanvas('ui_target_ring', 36, 18);
    if (ring) {
      const ctx = ring.context;
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.ellipse(18, 9, 16, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ring.refresh();
    }
  }
}
