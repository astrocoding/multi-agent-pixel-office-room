import * as Phaser from 'phaser';
import { OfficeLayout, NpcManager, type FurnitureItem } from '@agent-office/game-core';
import { AGENT_CONFIGS, AGENT_IDS, type AgentId, type AgentStateType } from '@agent-office/shared';
import { Player } from '../entities/Player.js';
import { NPC } from '../entities/NPC.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { BubbleChatSystem } from '../systems/BubbleChatSystem.js';
import { gameBridge } from '../ui-bridge/GameBridge.js';

export class OfficeScene extends Phaser.Scene {
  public player!: Player;
  public npcs: Map<AgentId, NPC> = new Map();
  private collisionSystem!: CollisionSystem;
  private bubbleSystem!: BubbleChatSystem;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private key1!: Phaser.Input.Keyboard.Key;
  private key2!: Phaser.Input.Keyboard.Key;
  private key3!: Phaser.Input.Keyboard.Key;

  private nearestAgentId: AgentId | null = null;
  private nearestInteractiveProp: FurnitureItem | null = null;
  private targetRing!: Phaser.GameObjects.Image;
  private propPromptIndicator!: Phaser.GameObjects.Container;
  private propPromptBg!: Phaser.GameObjects.Graphics;
  private propPromptText!: Phaser.GameObjects.Text;
  private currentPropPromptText: string = '';

  // In-Game RPG Dialogue Box
  private dialogueBoxContainer!: Phaser.GameObjects.Container;
  private dialoguePortrait!: Phaser.GameObjects.Image;
  private dialogueNameText!: Phaser.GameObjects.Text;
  private dialogueRoleText!: Phaser.GameObjects.Text;
  private dialogueBodyText!: Phaser.GameObjects.Text;
  private isDialogueOpen = false;
  private activeDialogueAgentId: AgentId | null = null;
  private typewriterTimer?: Phaser.Time.TimerEvent;

  // In-Game Clock HUD
  private hudContainer!: Phaser.GameObjects.Container;
  private hudClockText!: Phaser.GameObjects.Text;

  constructor() {
    super('OfficeScene');
  }

  public create(): void {
    const width = OfficeLayout.WIDTH;
    const height = OfficeLayout.HEIGHT;

    // 1. World Bounds
    this.physics.world.setBounds(0, 0, width, height);

    // 2. Render Taller Wall & Warm Wood Tilemap (Scaling tiles by 2x for prominent ratio)
    this.createOfficeTilemap(width, height);

    // 3. Place Office Furniture & Props (Scaled 1.5x)
    this.createFurnitureAndProps();

    // 4. Floor Target Ring Indicator
    this.targetRing = this.add.image(0, 0, 'ui_target_ring');
    this.targetRing.setScale(1.3);
    this.targetRing.setDepth(6);
    this.targetRing.setVisible(false);

    this.tweens.add({
      targets: this.targetRing,
      alpha: 0.35,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 5. Interactive Prop Prompt Pill
    this.createPropPromptIndicator();

    // 6. Setup Collision System
    this.collisionSystem = new CollisionSystem(this);

    // 7. Spawn Boss Player Character (Enlarged 1.5x)
    this.player = new Player(this, 384, 420);
    this.physics.add.collider(this.player, this.collisionSystem.getGroup());

    // 8. Spawn 6 Specialist Agents at Dynamic Workstations (Enlarged 1.5x)
    (Object.keys(AGENT_CONFIGS) as AgentId[]).forEach((agentId) => {
      const cfg = AGENT_CONFIGS[agentId];
      const npc = new NPC(this, cfg.deskX, cfg.deskY - 14, agentId);
      this.npcs.set(agentId, npc);
      this.physics.add.collider(this.player, npc);
      this.physics.add.collider(npc, this.collisionSystem.getGroup());
    });

    // Inter-NPC Soft Overlap Cushion (replaces rigid collider to eliminate 60Hz jitter & vibration)
    const npcList = Array.from(this.npcs.values());
    for (let i = 0; i < npcList.length; i++) {
      for (let j = i + 1; j < npcList.length; j++) {
        this.physics.add.overlap(npcList[i], npcList[j], (obj1, obj2) => {
          const a = obj1 as NPC;
          const b = obj2 as NPC;
          const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
          if (dist > 0 && dist < 24) {
            const push = (24 - dist) * 0.12;
            const angle = Phaser.Math.Angle.Between(a.x, a.y, b.x, b.y);
            b.x = Phaser.Math.Clamp(b.x + Math.cos(angle) * push, 38, 730);
            b.y = Phaser.Math.Clamp(b.y + Math.sin(angle) * push, 92, 442);
            a.x = Phaser.Math.Clamp(a.x - Math.cos(angle) * push, 38, 730);
            a.y = Phaser.Math.Clamp(a.y - Math.sin(angle) * push, 92, 442);
          }
        });
      }
    }

    // 9. Camera Setup with Smooth Follow & Cozy Zoom
    this.cameras.main.setBounds(0, 0, width, height);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.15); // Enhanced zoom to make pixels & characters comfortably large

    // 10. Bubble Chat System
    this.bubbleSystem = new BubbleChatSystem(this);

    // 11. In-Game Clock HUD
    this.createInGameHUD();

    // 12. In-Game RPG Dialogue Box
    this.createInGameDialogueBox();

    // 13. Keyboard Controls (CRITICAL: enableCapture = false prevents swallowing keys in HTML inputs!)
    if (this.input.keyboard) {
      this.input.keyboard.clearCaptures();
      this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E, false);
      this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC, false);
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false);
      this.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE, false);
      this.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO, false);
      this.key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE, false);
      this.input.keyboard.clearCaptures();
    }

    // 14. Touch & Click Pointer Fallback for Dialogue Box & UI Controls
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDialogueOpen) return;

      // Close "✕" Button: Screen bounds [638, 678] x [346, 384]
      if (
        pointer.x >= 638 &&
        pointer.x <= 678 &&
        pointer.y >= 346 &&
        pointer.y <= 384
      ) {
        this.closeDialogue();
        return;
      }

      // [ESC] Close Text Button: Screen bounds [575, 655] x [406, 432]
      if (
        pointer.x >= 575 &&
        pointer.x <= 655 &&
        pointer.y >= 406 &&
        pointer.y <= 432
      ) {
        this.closeDialogue();
        return;
      }

      // Option 1: Dispatch Task
      if (
        pointer.x >= 153 &&
        pointer.x <= 283 &&
        pointer.y >= 408 &&
        pointer.y <= 430
      ) {
        if (this.activeDialogueAgentId) {
          gameBridge.requestInteraction(this.activeDialogueAgentId);
          this.closeDialogue();
        }
        return;
      }

      // Option 2: Status Query
      if (
        pointer.x >= 288 &&
        pointer.x <= 418 &&
        pointer.y >= 408 &&
        pointer.y <= 430
      ) {
        if (this.activeDialogueAgentId) {
          const npc = this.npcs.get(this.activeDialogueAgentId);
          const state = npc?.currentAgentState || 'idle';
          this.animateTypewriterText(`Status Report: I am in '${state}' state. Ready to receive commands.`);
        }
        return;
      }

      // Option 3: Memory Recall
      if (
        pointer.x >= 423 &&
        pointer.x <= 568 &&
        pointer.y >= 408 &&
        pointer.y <= 430
      ) {
        this.animateTypewriterText(
          `Querying pgvector episodic memory... Retrieved previous architectural decisions and project context.`
        );
        return;
      }
    });

    // 15. Wire Bridge Listeners
    this.setupBridgeListeners();

    // 16. Notify React
    gameBridge.emit('game:ready', { loaded: true });
  }

  /**
   * Builds the office room tilemap:
   * - TALLER WALL (80px tall)
   * - 3x1 Horizontal Windows (Row 1 only, 3 horizontal tiles x 1 vertical tile)
   * - WARM WOOD FLOOR (floor_wood_a across the entire office like Image 2!)
   * - Decorative blue area rug in lounge & server tiles in server zone
   */
  private createOfficeTilemap(width: number, height: number): void {
    const ts = 16;
    const wallHeight = OfficeLayout.WALL_HEIGHT; // 80px

    for (let x = 0; x < width; x += ts) {
      for (let y = 0; y < height; y += ts) {
        // --- A. TALLER WALL SECTION (y < 80) ---
        if (y < wallHeight) {
          // Row 0 (y = 0..15): Top rim / cap
          if (y < 16) {
            this.add.image(x + ts / 2, y + ts / 2, 'wall_brick').setDepth(1);
            continue;
          }

          // Row 1, 2, 3 (y = 16..63): Warm rustic brick wall surface for panoramic 3x1 windows & fixtures
          if (y >= 16 && y < 64) {
            this.add.image(x + ts / 2, y + ts / 2, 'wall_brick').setDepth(2);
            continue;
          }

          // Row 4 (y = 64..79): Baseboard molding on brick wall
          if (y >= 64 && y < wallHeight) {
            this.add.image(x + ts / 2, y + ts / 2, 'wall_brick_baseboard').setDepth(3);
            continue;
          }
        }

        // --- B. SIDE & BOTTOM BOUNDARY WALLS ---
        if (x < 16 || x >= width - 16 || y >= height - 16) {
          const isCorner = (x < 16 && y >= height - 16) || (x >= width - 16 && y >= height - 16);
          this.add.image(x + ts / 2, y + ts / 2, isCorner ? 'wall_corner' : 'wall_brick').setDepth(2);
          continue;
        }

        // --- C. WARM COZY WOOD FLOOR (Matching Image 2 throughout the office!) ---
        const isServerZone = x >= 640 && y <= 110;
        const isLoungeRug = x >= 608 && x <= 688 && y >= 352 && y <= 432;
        const isBreakroomCorner = x <= 120 && y >= 430;

        let floorTex = 'floor_wood_a'; // Primary warm honey wood floor

        if (isServerZone) {
          floorTex = 'floor_server';
        } else if (isLoungeRug) {
          floorTex = 'floor_rug_blue'; // Blue tile rug matching Image 2
        } else if (isBreakroomCorner) {
          floorTex = 'floor_mat';
        } else {
          // Subtle warm plank variations
          floorTex = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 0 ? 'floor_wood_a' : 'floor_wood_b';
        }

        this.add.image(x + ts / 2, y + ts / 2, floorTex).setDepth(0);
      }
    }
  }

  // Place props and accessories scaled 1.5x for prominent retro presence
  private createFurnitureAndProps(): void {
    const furniture = OfficeLayout.getFurniture();

    furniture.forEach((f) => {
      const img = this.add.image(f.x, f.y, f.texture);
      img.setOrigin(0.5, 0.5);

      // Window 3x1 is already pixel-sized (84x38) matching 1.5x prop ratio; other props scale 1.5x
      if (f.texture === 'prop_window_3x1') {
        img.setScale(1.0);
        img.setDepth(4);
      } else {
        img.setScale(1.5);
      }

      // Depth sorting
      if (f.id.startsWith('desk_')) {
        img.setDepth(f.y + 6);
      } else if (f.id.startsWith('chair_')) {
        img.setDepth(f.y - 12);
      } else if (f.id.startsWith('laptop_') || f.id.startsWith('monitor_')) {
        img.setDepth(f.y + 8);
      } else if (f.texture === 'prop_window_3x1') {
        img.setDepth(4);
      } else if (f.y <= 60) {
        img.setDepth(10); // Wall mounted props
      } else {
        img.setDepth(f.y);
      }

      // Blinking LED on active server rack
      if (f.texture === 'prop_server_rack_active') {
        const led = this.add.circle(f.x + 10, f.y - 6, 2.5, 0x22c55e, 0.95);
        led.setDepth(f.y + 4);
        this.tweens.add({
          targets: led,
          alpha: 0.2,
          duration: 400,
          yoyo: true,
          repeat: -1,
        });
      }

      // Air conditioner cooling indicator
      if (f.texture === 'prop_air_conditioner') {
        const led = this.add.circle(f.x + 12, f.y - 4, 2, 0x38bdf8, 0.9);
        led.setDepth(14);
      }
    });
  }

  // Interactive Prop Prompt Pill (Retro pixel hard rectangular pill with dynamic width)
  private createPropPromptIndicator(): void {
    this.propPromptBg = this.add.graphics();

    this.propPromptText = this.add.text(0, 0, '[E] Interact', {
      fontFamily: '"Silkscreen", monospace, sans-serif',
      fontSize: '10px',
      color: '#CCF12B',
      resolution: 2,
    });
    this.propPromptText.setOrigin(0.5, 0.5);

    this.propPromptIndicator = this.add.container(0, 0, [this.propPromptBg, this.propPromptText]);
    this.propPromptIndicator.setDepth(4500);
    this.propPromptIndicator.setVisible(false);
    this.currentPropPromptText = '';
  }

  // Dynamic recalculation of prompt background to prevent long prop text from overflowing borders
  private updatePropPrompt(text: string): void {
    if (this.currentPropPromptText === text) return;
    this.currentPropPromptText = text;
    this.propPromptText.setText(text);

    // Generous horizontal padding (12px on left & right) so text never overflows
    const paddingX = 24;
    const textWidth = Math.ceil(this.propPromptText.width);
    const boxWidth = Math.max(90, textWidth + paddingX);
    const boxHeight = 24;

    this.propPromptBg.clear();
    this.propPromptBg.fillStyle(0x0d110f, 0.95);
    this.propPromptBg.lineStyle(1.5, 0xccf12b, 1);
    this.propPromptBg.fillRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
    this.propPromptBg.strokeRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);

    this.propPromptText.setPosition(0, 0);
  }

  // In-Game HUD Clock
  private createInGameHUD(): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x0d110f, 0.95);
    bg.lineStyle(2, 0x465047, 1);
    bg.fillRect(0, 0, 140, 26);
    bg.strokeRect(0, 0, 140, 26);

    this.hudClockText = this.add.text(10, 6, this.getFormattedClock(), {
      fontFamily: '"Silkscreen", monospace, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#CCF12B',
      resolution: 2,
    });

    this.hudContainer = this.add.container(565, 42, [bg, this.hudClockText]);
    this.hudContainer.setScrollFactor(0);
    this.hudContainer.setDepth(5000);

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        this.hudClockText.setText(this.getFormattedClock());
      },
    });
  }

  private getFormattedClock(): string {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const now = new Date();
    const day = days[now.getDay()];
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${day} - ${hours}:${minutes}`;
  }

  // In-Game RPG Dialogue Box
  private createInGameDialogueBox(): void {
    // Scaled & positioned safely inside the 1.15x camera viewport so no border/text is cut off!
    const boxWidth = 592;
    const boxHeight = 92;
    const x = 88;
    const y = 342;

    const bg = this.add.graphics();
    bg.fillStyle(0x121615, 0.98);
    bg.lineStyle(2, 0x465047, 1);
    bg.fillRect(0, 0, boxWidth, boxHeight);
    bg.strokeRect(0, 0, boxWidth, boxHeight);

    const portraitFrame = this.add.graphics();
    portraitFrame.fillStyle(0x1b211d, 1);
    portraitFrame.lineStyle(2, 0x899584, 1);
    portraitFrame.fillRect(12, 12, 48, 48);
    portraitFrame.strokeRect(12, 12, 48, 48);

    this.dialoguePortrait = this.add.image(36, 36, 'portrait_agent_leader');
    this.dialoguePortrait.setDisplaySize(42, 42);

    this.dialogueNameText = this.add.text(70, 10, 'Zen (Leader)', {
      fontFamily: '"Silkscreen", monospace, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#CCF12B',
      resolution: 2,
    });

    this.dialogueRoleText = this.add.text(70, 26, 'Chief of Staff • Orchestrator', {
      fontFamily: '"Share Tech Mono", "VT323", monospace, sans-serif',
      fontSize: '10px',
      color: '#B6BFAE',
      resolution: 2,
    });

    this.dialogueBodyText = this.add.text(70, 42, '', {
      fontFamily: '"Share Tech Mono", "VT323", monospace, sans-serif',
      fontSize: '11px',
      color: '#F0F1DD',
      wordWrap: { width: 480, useAdvancedWrap: true },
      resolution: 2,
    });

    // Interactive Action Buttons at bottom of Dialogue Box
    const opt1 = this.add.text(70, 72, '[1] Dispatch Task', {
      fontFamily: '"Silkscreen", monospace, sans-serif',
      fontSize: '9px',
      color: '#36B9ED',
      fontStyle: 'bold',
      resolution: 2,
    });
    opt1.setInteractive({ useHandCursor: true });
    opt1.on('pointerover', () => opt1.setColor('#CCF12B'));
    opt1.on('pointerout', () => opt1.setColor('#36B9ED'));
    opt1.on('pointerdown', () => {
      if (this.activeDialogueAgentId) {
        gameBridge.requestInteraction(this.activeDialogueAgentId);
        this.closeDialogue();
      }
    });

    const opt2 = this.add.text(205, 72, '[2] Status Query', {
      fontFamily: '"Silkscreen", monospace, sans-serif',
      fontSize: '9px',
      color: '#36B9ED',
      fontStyle: 'bold',
      resolution: 2,
    });
    opt2.setInteractive({ useHandCursor: true });
    opt2.on('pointerover', () => opt2.setColor('#CCF12B'));
    opt2.on('pointerout', () => opt2.setColor('#36B9ED'));
    opt2.on('pointerdown', () => {
      if (this.activeDialogueAgentId) {
        const npc = this.npcs.get(this.activeDialogueAgentId);
        const state = npc?.currentAgentState || 'idle';
        this.animateTypewriterText(`Status Report: I am in '${state}' state. Ready to receive commands.`);
      }
    });

    const opt3 = this.add.text(340, 72, '[3] Memory Recall', {
      fontFamily: '"Silkscreen", monospace, sans-serif',
      fontSize: '9px',
      color: '#36B9ED',
      fontStyle: 'bold',
      resolution: 2,
    });
    opt3.setInteractive({ useHandCursor: true });
    opt3.on('pointerover', () => opt3.setColor('#CCF12B'));
    opt3.on('pointerout', () => opt3.setColor('#36B9ED'));
    opt3.on('pointerdown', () => {
      this.animateTypewriterText(
        `Querying pgvector episodic memory... Retrieved previous architectural decisions and project context.`
      );
    });

    const optClose = this.add.text(495, 72, '[ESC] Close', {
      fontFamily: '"Silkscreen", monospace, sans-serif',
      fontSize: '9px',
      color: '#869184',
      fontStyle: 'bold',
      resolution: 2,
    });
    optClose.setInteractive({ useHandCursor: true });
    optClose.on('pointerover', () => optClose.setColor('#F16E5E'));
    optClose.on('pointerout', () => optClose.setColor('#869184'));
    optClose.on('pointerdown', () => {
      this.closeDialogue();
    });

    // Interactive Close "✕" Button at top right
    const closeBtnX = boxWidth - 36;
    const closeBtnY = 10;
    const closeBtnSize = 24;

    const closeBtnBg = this.add.graphics();
    const renderCloseBtn = (hover: boolean, active: boolean) => {
      closeBtnBg.clear();
      const fill = active ? 0xf16e5e : (hover ? 0x899584 : 0x1b211d);
      const stroke = active ? 0xf0f1dd : (hover ? 0xf0f1dd : 0x465047);
      closeBtnBg.fillStyle(fill, 1);
      closeBtnBg.lineStyle(1.5, stroke, 1);
      closeBtnBg.fillRect(closeBtnX, closeBtnY, closeBtnSize, closeBtnSize);
      closeBtnBg.strokeRect(closeBtnX, closeBtnY, closeBtnSize, closeBtnSize);
    };
    renderCloseBtn(false, false);

    const closeBtnText = this.add.text(closeBtnX + closeBtnSize / 2, closeBtnY + closeBtnSize / 2, '✕', {
      fontFamily: '"Silkscreen", monospace, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#B6BFAE',
      resolution: 2,
    });
    closeBtnText.setOrigin(0.5, 0.5);

    // Interactive Hit Area for Close Button (32x32 generous touch/click zone)
    const closeHitArea = this.add.rectangle(
      closeBtnX + closeBtnSize / 2,
      closeBtnY + closeBtnSize / 2,
      34,
      34,
      0x000000,
      0.001
    );
    closeHitArea.setInteractive({ useHandCursor: true });

    closeHitArea.on('pointerover', () => {
      renderCloseBtn(true, false);
      closeBtnText.setColor('#FFFFFF');
    });

    closeHitArea.on('pointerout', () => {
      renderCloseBtn(false, false);
      closeBtnText.setColor('#94A3B8');
    });

    closeHitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      renderCloseBtn(false, true);
      this.closeDialogue();
    });

    closeHitArea.on('pointerup', () => {
      this.closeDialogue();
    });

    this.dialogueBoxContainer = this.add.container(x, y, [
      bg,
      portraitFrame,
      this.dialoguePortrait,
      this.dialogueNameText,
      this.dialogueRoleText,
      this.dialogueBodyText,
      opt1,
      opt2,
      opt3,
      optClose,
      closeBtnBg,
      closeBtnText,
      closeHitArea,
    ]);
    // CRITICAL: updateChildren = true ensures every interactive element inherits scrollFactor(0, 0)!
    this.dialogueBoxContainer.setScrollFactor(0, 0, true);
    this.dialogueBoxContainer.setDepth(6000);
    this.dialogueBoxContainer.setVisible(false);
  }

  public openDialogue(agentId: AgentId): void {
    this.isDialogueOpen = true;
    this.activeDialogueAgentId = agentId;
    const cfg = AGENT_CONFIGS[agentId];
    const npc = this.npcs.get(agentId);

    // Pause NPC in place and turn to face Boss
    if (npc) {
      npc.pauseForBoss(this.player.x, this.player.y);
      this.player.faceTarget(npc.x, npc.y);
    }

    this.dialoguePortrait.setTexture(`portrait_${agentId}`);
    this.dialogueNameText.setText(cfg.name);
    this.dialogueRoleText.setText(`${cfg.role} • ${cfg.title}`);

    const state = npc?.currentAgentState || 'idle';
    let line = `Hello Boss! I am currently in '${state}' state. Ready to execute directives or report status.`;
    if (state === 'working') {
      line = `Executing active subtask: generating structured modules, compiling test suites, and syncing with team.`;
    } else if (state === 'thinking') {
      line = `Decomposing directives into specialist workflows with Gemini AI Auto-Router.`;
    } else if (state === 'reviewing') {
      line = `Conducting rigorous QA audit: schema integrity verified, edge cases evaluated, acceptance criteria checked.`;
    }

    this.animateTypewriterText(line);
    this.dialogueBoxContainer.setVisible(true);

    this.dialogueBoxContainer.setScale(0.96);
    this.dialogueBoxContainer.setAlpha(0);
    this.tweens.add({
      targets: this.dialogueBoxContainer,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 150,
      ease: 'Back.easeOut',
    });
  }

  public closeDialogue(): void {
    if (!this.isDialogueOpen) return;
    this.isDialogueOpen = false;
    this.dialogueBoxContainer.setVisible(false);
    if (this.activeDialogueAgentId) {
      const npc = this.npcs.get(this.activeDialogueAgentId);
      npc?.resumeFromBoss();
    }
    this.activeDialogueAgentId = null;
  }

  private animateTypewriterText(fullText: string): void {
    if (this.typewriterTimer) {
      this.typewriterTimer.destroy();
    }
    this.dialogueBodyText.setText('');
    let idx = 0;

    this.typewriterTimer = this.time.addEvent({
      delay: 18,
      repeat: fullText.length - 1,
      callback: () => {
        this.dialogueBodyText.setText(fullText.substring(0, idx + 1));
        idx++;
      },
    });
  }

  private handlePropInteraction(prop: FurnitureItem): void {
    if (prop.actionType === 'coffee') {
      this.bubbleSystem.showBubble('boss', this.player.x, this.player.y, '*Sips freshly brewed espresso* Efficiency +100%!', 3500);
    } else if (prop.actionType === 'water') {
      this.bubbleSystem.showBubble('boss', this.player.x, this.player.y, 'Pure spring water. Refreshed & hydrated!', 3000);
    } else if (prop.actionType === 'server') {
      this.bubbleSystem.showBubble('boss', this.player.x, this.player.y, 'Cluster online. AI Auto-Router: gemini-3.1-flash-lite active!', 3800);
    } else if (prop.actionType === 'whiteboard') {
      this.bubbleSystem.showBubble('boss', this.player.x, this.player.y, 'Architecture Sprint: Multi-Agent Office Runtime on track.', 3800);
    } else if (prop.actionType === 'printer') {
      this.bubbleSystem.showBubble('boss', this.player.x, this.player.y, 'Architecture diagrams & specs printed.', 3000);
    }
  }

  private setupBridgeListeners(): void {
    gameBridge.on('agent:show_bubble', (payload) => {
      if (payload.agentId === 'boss') {
        this.bubbleSystem.showBubble(
          'boss',
          this.player.x,
          this.player.y,
          payload.text,
          payload.durationMs,
          payload.bubbleType
        );
      } else {
        const npc = this.npcs.get(payload.agentId);
        if (npc) {
          this.bubbleSystem.showBubble(
            payload.agentId,
            npc.x,
            npc.y,
            payload.text,
            payload.durationMs,
            payload.bubbleType
          );
        }
      }
    });

    gameBridge.on('agent:update_state', (payload) => {
      const npc = this.npcs.get(payload.agentId);
      if (npc) {
        npc.setAgentState(payload.state);
      }
    });

    gameBridge.on('agent:clear_bubble', (payload: { agentId: string }) => {
      this.bubbleSystem.removeBubble(payload.agentId);
    });

    gameBridge.on('agent:summon', (payload: { agentId: AgentId; reason?: string; text?: string }) => {
      const npc = this.npcs.get(payload.agentId);
      if (npc && this.player) {
        npc.summonToBoss(this.player.x, this.player.y);
      }
    });
  }

  public update(): void {
    // CRITICAL: When typing in HTML inputs or chat, NEVER process player movement or game hotkeys!
    if (Player.isTypingInInput()) {
      this.player.setVelocity(0, 0);
      return;
    }

    // Player update
    this.player.update();
    this.bubbleSystem.updatePosition('boss', this.player.x, this.player.y);

    // Update all NPC bubble positions every single frame so bubbles never lag or stay behind!
    this.npcs.forEach((npc, id) => {
      this.bubbleSystem.updatePosition(id, npc.x, npc.y);
    });

    // 1. Proximity to Agent Workstations (or current NPC positions!)
    const agentPositions: Record<AgentId, { x: number; y: number }> = {} as any;
    this.npcs.forEach((npc, id) => {
      agentPositions[id] = { x: npc.x, y: npc.y };
    });

    let nearestAgent: AgentId | null = null;
    let minAgentDist = Infinity;
    let nearestSpotX = 0;
    let nearestSpotY = 0;

    this.npcs.forEach((npc, id) => {
      const dx = this.player.x - npc.x;
      const dy = this.player.y - (npc.y + 14);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 68 && dist < minAgentDist) {
        minAgentDist = dist;
        nearestAgent = id;
        nearestSpotX = npc.x;
        nearestSpotY = npc.y + 18;
      }
    });

    if (nearestAgent) {
      this.targetRing.setPosition(nearestSpotX, nearestSpotY);
      this.targetRing.setVisible(true);

      if (this.nearestAgentId !== nearestAgent) {
        if (this.nearestAgentId) {
          this.npcs.get(this.nearestAgentId)?.showPrompt(false);
        }
        this.nearestAgentId = nearestAgent;
        this.npcs.get(this.nearestAgentId)?.showPrompt(true);
        gameBridge.notifyProximity(true, this.nearestAgentId);
      }

      // [E] Key triggers RPG Dialogue
      if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
        if (this.isDialogueOpen) {
          this.closeDialogue();
        } else if (this.nearestAgentId) {
          this.openDialogue(this.nearestAgentId);
          gameBridge.requestInteraction(this.nearestAgentId);
        }
      }
    } else {
      this.targetRing.setVisible(false);
      if (this.nearestAgentId) {
        this.npcs.get(this.nearestAgentId)?.showPrompt(false);
        this.nearestAgentId = null;
        gameBridge.notifyProximity(false, null);
      }
    }

    // 2. Proximity to Interactive Props (Coffee Machine, Server, Water Cooler, Whiteboard, Printer)
    const interactiveProps = OfficeLayout.getFurniture().filter((f) => f.interactive);
    let nearestProp: FurnitureItem | null = null;
    let minPropDist = Infinity;

    for (const prop of interactiveProps) {
      const dx = this.player.x - prop.x;
      const dy = this.player.y - (prop.y + 12);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 48 && dist < minPropDist) {
        minPropDist = dist;
        nearestProp = prop;
      }
    }

    if (nearestProp && !nearestAgent) {
      this.nearestInteractiveProp = nearestProp;
      this.propPromptIndicator.setPosition(Math.round(nearestProp.x), Math.round(nearestProp.y - 28));
      this.updatePropPrompt(nearestProp.promptText || '[E] Interact');
      this.propPromptIndicator.setVisible(true);

      if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
        this.handlePropInteraction(nearestProp);
      }
    } else {
      this.nearestInteractiveProp = null;
      this.propPromptIndicator.setVisible(false);
      this.currentPropPromptText = '';
    }

    // 3. Dialogue Box Shortcuts
    if (this.isDialogueOpen) {
      if (Phaser.Input.Keyboard.JustDown(this.escKey) || Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        this.closeDialogue();
      }

      if (Phaser.Input.Keyboard.JustDown(this.key1) && this.activeDialogueAgentId) {
        gameBridge.requestInteraction(this.activeDialogueAgentId);
        this.closeDialogue();
      }

      if (Phaser.Input.Keyboard.JustDown(this.key2) && this.activeDialogueAgentId) {
        const npc = this.npcs.get(this.activeDialogueAgentId);
        const state = npc?.currentAgentState || 'idle';
        this.animateTypewriterText(`Status Report: I am in '${state}' state. Ready to receive commands.`);
      }

      if (Phaser.Input.Keyboard.JustDown(this.key3) && this.activeDialogueAgentId) {
        this.animateTypewriterText(
          `Querying pgvector episodic memory... Retrieved previous architectural decisions and project context.`
        );
      }
    }
  }

  public destroy(): void {
    this.bubbleSystem.destroy();
    this.npcs.forEach((npc) => npc.destroy());
    this.npcs.clear();
    this.dialogueBoxContainer?.destroy();
    this.hudContainer?.destroy();
    this.propPromptIndicator?.destroy();
  }
}
