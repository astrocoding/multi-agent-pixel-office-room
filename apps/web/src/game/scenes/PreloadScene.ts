import * as Phaser from 'phaser';
import { AGENT_CONFIGS, AGENT_IDS, type AgentId } from '@agent-office/shared';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  public preload(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 1. Loading background: retro root dark (#090B0A)
    const bg = this.add.graphics();
    bg.fillStyle(0x090b0a, 1);
    bg.fillRect(0, 0, width, height);

    // Subtle CRT scanline overlay
    const scanlines = this.add.graphics();
    scanlines.fillStyle(0x000000, 0.22);
    for (let y = 0; y < height; y += 4) {
      scanlines.fillRect(0, y, width, 1);
    }

    // Corner pixel markers [ + ]
    const corners = this.add.graphics();
    corners.lineStyle(1.5, 0x465047, 0.8);
    // Top-left
    corners.strokeRect(12, 12, 14, 14);
    // Top-right
    corners.strokeRect(width - 26, 12, 14, 14);
    // Bottom-left
    corners.strokeRect(12, height - 26, 14, 14);
    // Bottom-right
    corners.strokeRect(width - 26, height - 26, 14, 14);

    // 2. Center Pixel Dialog Box (Responsive for mobile & desktop)
    const isMobile = width < 520;
    const cardWidth = Math.min(460, Math.max(270, width - 24));
    const cardHeight = isMobile ? 210 : 220;
    const cardX = Math.floor((width - cardWidth) / 2);
    const cardY = Math.floor((height - cardHeight) / 2);

    // Hard pixel drop shadow (pure black offset)
    const shadowOffset = isMobile ? 4 : 6;
    const cardShadow = this.add.graphics();
    cardShadow.fillStyle(0x000000, 1);
    cardShadow.fillRect(cardX + shadowOffset, cardY + shadowOffset, cardWidth, cardHeight);

    // Card Window Body
    const cardBg = this.add.graphics();
    // Surface background (#121615)
    cardBg.fillStyle(0x121615, 1);
    cardBg.fillRect(cardX, cardY, cardWidth, cardHeight);

    // Strong pixel border (#899584)
    cardBg.lineStyle(2, 0x899584, 1);
    cardBg.strokeRect(cardX, cardY, cardWidth, cardHeight);

    // Header Titlebar (#1B211D)
    cardBg.fillStyle(0x1b211d, 1);
    cardBg.fillRect(cardX, cardY, cardWidth, 28);
    cardBg.lineStyle(1.5, 0x465047, 1);
    cardBg.lineBetween(cardX, cardY + 28, cardX + cardWidth, cardY + 28);

    // Header elements: system badge & live status
    this.add
      .text(cardX + 10, cardY + 14, isMobile ? '► AO-SYSTEM' : '► AO-SYSTEM // BOOTLOADER', {
        fontFamily: '"Silkscreen", monospace, sans-serif',
        fontSize: isMobile ? '9px' : '10px',
        color: '#CCF12B',
        resolution: 2,
      })
      .setOrigin(0, 0.5);

    this.add
      .text(cardX + cardWidth - 10, cardY + 14, isMobile ? '● INIT' : '● INITIALIZING', {
        fontFamily: '"Silkscreen", monospace, sans-serif',
        fontSize: '9px',
        color: '#79D693',
        resolution: 2,
      })
      .setOrigin(1, 0.5);

    // 3. Title Text: AGENT OFFICE ROOM
    const titleText = this.add.text(width / 2, cardY + (isMobile ? 52 : 54), 'AGENT OFFICE ROOM', {
      fontFamily: '"Silkscreen", monospace, sans-serif',
      fontSize: isMobile ? '13px' : '18px',
      color: '#F0F1DD',
      fontStyle: 'bold',
      resolution: 2,
    });
    titleText.setOrigin(0.5, 0.5);

    // Subtitle / Architecture directive
    const subtitleText = this.add.text(
      width / 2,
      cardY + (isMobile ? 74 : 76),
      isMobile ? 'MULTI-AGENT WORKSPACE' : 'AUTONOMOUS MULTI-AGENT WORKSPACE',
      {
        fontFamily: '"Share Tech Mono", "VT323", monospace, sans-serif',
        fontSize: isMobile ? '10px' : '12px',
        color: '#869184',
        resolution: 2,
      }
    );
    subtitleText.setOrigin(0.5, 0.5);

    // 4. Progress Text & Percentage Indicators
    const stageText = this.add.text(
      cardX + 16,
      cardY + (isMobile ? 106 : 112),
      isMobile ? '> MOUNTING SPRITES...' : '> MOUNTING PIXEL SPRITES & TEXTURES...',
      {
        fontFamily: '"Share Tech Mono", "VT323", monospace, sans-serif',
        fontSize: isMobile ? '10px' : '11px',
        color: '#36B9ED',
        resolution: 2,
      }
    );
    stageText.setOrigin(0, 0.5);

    const percentText = this.add.text(cardX + cardWidth - 16, cardY + (isMobile ? 106 : 112), '[ 0% ]', {
      fontFamily: '"Silkscreen", monospace, sans-serif',
      fontSize: isMobile ? '10px' : '11px',
      color: '#CCF12B',
      resolution: 2,
    });
    percentText.setOrigin(1, 0.5);

    // 5. Retro Pixel Loading Bar (Strictly 0-radius pixel geometry)
    const barWidth = cardWidth - 32;
    const barHeight = isMobile ? 14 : 18;
    const barX = cardX + 16;
    const barY = cardY + (isMobile ? 120 : 126);

    const progressBox = this.add.graphics();
    const progressBar = this.add.graphics();

    // Track frame & background (#0D110F with #465047 border)
    progressBox.fillStyle(0x0d110f, 1);
    progressBox.fillRect(barX, barY, barWidth, barHeight);
    progressBox.lineStyle(2, 0x465047, 1);
    progressBox.strokeRect(barX, barY, barWidth, barHeight);

    // 6. Bottom Navigation Hint Divider & Text
    cardBg.lineStyle(1, 0x1b211d, 1);
    cardBg.lineBetween(cardX + 16, cardY + 164, cardX + cardWidth - 16, cardY + 164);

    this.add
      .text(
        width / 2,
        cardY + 184,
        isMobile ? '[WASD] WALK  •  [E] INTERACT' : 'CONTROLS: [WASD] WALK  •  [E] INTERACT WITH AGENTS',
        {
          fontFamily: '"Share Tech Mono", "VT323", monospace, sans-serif',
          fontSize: isMobile ? '10px' : '11px',
          color: '#869184',
          resolution: 2,
        }
      )
      .setOrigin(0.5, 0.5);

    // Real-time loader event listener
    this.load.on('progress', (value: number) => {
      progressBar.clear();

      const innerWidth = barWidth - 4;
      const innerHeight = barHeight - 4;
      const currentFill = Math.max(0, Math.floor(innerWidth * value));

      if (currentFill > 0) {
        // Main retro lime progress fill (#CCF12B)
        progressBar.fillStyle(0xccf12b, 1);
        progressBar.fillRect(barX + 2, barY + 2, currentFill, innerHeight);

        // Subtle top highlight line (#E6FF66) for sharp pixel depth
        progressBar.fillStyle(0xe6ff66, 0.6);
        progressBar.fillRect(barX + 2, barY + 2, currentFill, 2);

        // Retro segmented tick notches every 16px
        progressBar.fillStyle(0x0d110f, 0.85);
        for (let tickX = barX + 2 + 16; tickX < barX + 2 + currentFill; tickX += 16) {
          progressBar.fillRect(tickX, barY + 2, 2, innerHeight);
        }
      }

      const pct = Math.round(value * 100);
      percentText.setText(`[ ${pct}% ]`);

      if (pct < 25) {
        stageText.setText(isMobile ? '> MOUNTING SPRITES...' : '> MOUNTING CHARACTER SPRITES...');
        stageText.setColor('#36B9ED');
      } else if (pct < 55) {
        stageText.setText(isMobile ? '> PARSING TILES...' : '> PARSING OFFICE TILES & PROPS...');
        stageText.setColor('#36B9ED');
      } else if (pct < 80) {
        stageText.setText(isMobile ? '> CONFIGURING UI...' : '> CONFIGURING WORKSTATIONS & UI...');
        stageText.setColor('#36B9ED');
      } else if (pct < 100) {
        stageText.setText(isMobile ? '> INITIALIZING CORE...' : '> INITIALIZING AUTONOMOUS CORE...');
        stageText.setColor('#F5BC4D');
      } else {
        stageText.setText(isMobile ? '> READY. BOOTING...' : '> ALL ASSETS READY. BOOTING OFFICE...');
        stageText.setColor('#79D693');
      }
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
      const source = this.textures.get(item.spriteKey)?.getSourceImage() as HTMLImageElement;

      // 1. Dialogue Portrait (40x40) - Vertically and horizontally centered
      const portrait = this.textures.createCanvas(`portrait_${item.id}`, 40, 40);
      if (portrait) {
        const ctx = portrait.context;
        ctx.imageSmoothingEnabled = false;

        // Dark frame with agent accent border
        ctx.fillStyle = '#090B0A';
        ctx.fillRect(0, 0, 40, 40);
        ctx.fillStyle = '#121615';
        ctx.fillRect(2, 2, 36, 36);

        // Accent border
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(1, 1, 38, 38);

        // Character frame 0 bbox is (7, 5, 26, 32). Center vertically inside 40x40 canvas
        if (source) {
          ctx.drawImage(source, 0, 0, 32, 32, 4, 1, 32, 32);
        }

        portrait.refresh();
      }

      // 2. Mini-Portrait (18x18) - 1:1 pixel-perfect crop of head & shoulders for NPC Prompt Pills
      const miniPortrait = this.textures.createCanvas(`mini_portrait_${item.id}`, 18, 18);
      if (miniPortrait) {
        const mCtx = miniPortrait.context;
        mCtx.imageSmoothingEnabled = false;

        // Dark background (#090B0A)
        mCtx.fillStyle = '#090B0A';
        mCtx.fillRect(0, 0, 18, 18);

        // 1:1 Pixel-perfect crop of head and shoulders (8, 5, 16, 16) mapped to (1, 1, 16, 16)
        if (source) {
          mCtx.drawImage(source, 8, 5, 16, 16, 1, 1, 16, 16);
        }

        // Crisp 1px pixel border with agent accent color
        mCtx.strokeStyle = item.color;
        mCtx.lineWidth = 1;
        mCtx.strokeRect(0.5, 0.5, 17, 17);

        miniPortrait.refresh();
      }
    });
  }

  // 3. TARGET RING INDICATOR TEXTURE
  private generateTargetRingTexture(): void {
    const ring = this.textures.createCanvas('ui_target_ring', 36, 18);
    if (ring) {
      const ctx = ring.context;
      ctx.strokeStyle = '#CCF12B';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.ellipse(18, 9, 16, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ring.refresh();
    }
  }
}
