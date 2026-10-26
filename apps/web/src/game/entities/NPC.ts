import * as Phaser from 'phaser';
import type { AgentId, AgentStateType } from '@agent-office/shared';
import { AGENT_CONFIGS, AGENT_IDS } from '@agent-office/shared';
import { gameBridge } from '../ui-bridge/GameBridge.js';

export interface OfficeWaypoint {
  name: string;
  x: number;
  y: number;
  facing: 'down' | 'up' | 'left' | 'right';
  bubbleText?: string;
}

// Bounding box for obstacles
interface ObstacleBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  label?: string;
}

// Office static fixtures with accurate bounds matching visual sprites
const STATIC_OBSTACLES: ObstacleBox[] = [
  // Top-left: Bookshelves and Printer (y: 76..132)
  { minX: 24, maxX: 104, minY: 76, maxY: 132, label: 'library_printer' },
  // Top-right: Server Racks (y: 76..126)
  { minX: 642, maxX: 746, minY: 76, maxY: 126, label: 'servers' },
  // Bottom-left: Espresso Brew Station & Water Cooler (y: 360..406)
  { minX: 24, maxX: 112, minY: 360, maxY: 406, label: 'coffee_water' },
  // Bottom-center: Boss Executive Desk (y: 390..418)
  { minX: 364, maxX: 404, minY: 390, maxY: 418, label: 'boss_desk' },
  // Bottom-right: Coffee Lounge Table (y: 351..375)
  { minX: 633, maxX: 667, minY: 351, maxY: 375, label: 'round_table' },
  // Bottom-right: Comfort Lounge Sofa (y: 394..418)
  { minX: 627, maxX: 673, minY: 394, maxY: 418, label: 'lounge_sofa' },
  // Bottom-right: Snack Vending Machine (y: 370..412)
  { minX: 700, maxX: 736, minY: 370, maxY: 412, label: 'vending' },
];

// Specialist workstation physical desk tables (solid desk body only: Y in deskY+15..deskY+29)
// Chairs at deskY-12 and walking aisles are completely outside these boxes!
const DESK_OBSTACLES: Record<AgentId, ObstacleBox> = {
  [AGENT_IDS.RESEARCH]: { minX: 162, maxX: 198, minY: 190, maxY: 204, label: 'desk_dre' },
  [AGENT_IDS.LEADER]: { minX: 358, maxX: 410, minY: 195, maxY: 209, label: 'desk_zen' },
  [AGENT_IDS.ENGINEERING]: { minX: 554, maxX: 606, minY: 180, maxY: 194, label: 'desk_iky' },
  [AGENT_IDS.QA]: { minX: 192, maxX: 228, minY: 295, maxY: 309, label: 'desk_rai' },
  [AGENT_IDS.MEMORY]: { minX: 372, maxX: 408, minY: 305, maxY: 319, label: 'desk_dhea' },
  [AGENT_IDS.AUTOMATION]: { minX: 592, maxX: 628, minY: 290, maxY: 304, label: 'desk_gus' },
};

function isPointInAABB(x: number, y: number, box: ObstacleBox, margin = 4): boolean {
  return (
    x >= box.minX - margin &&
    x <= box.maxX + margin &&
    y >= box.minY - margin &&
    y <= box.maxY + margin
  );
}

function isPointBlocked(
  x: number,
  y: number,
  margin = 4,
  excludeAgentDesk?: AgentId
): boolean {
  // Office perimeter walls (bounds: w=768, h=480, wallH=80, 32px wall colliders)
  if (y < 92 + margin || y > 444 - margin || x < 36 + margin || x > 732 - margin) {
    return true;
  }

  // Static fixtures
  for (const box of STATIC_OBSTACLES) {
    if (isPointInAABB(x, y, box, margin)) return true;
  }

  // Specialist desks
  for (const [agentId, box] of Object.entries(DESK_OBSTACLES)) {
    if (excludeAgentDesk && agentId === excludeAgentDesk) continue;
    if (isPointInAABB(x, y, box, margin)) return true;
  }

  return false;
}

function lineIntersectsBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: ObstacleBox,
  margin = 4
): boolean {
  const bMinX = box.minX - margin;
  const bMaxX = box.maxX + margin;
  const bMinY = box.minY - margin;
  const bMaxY = box.maxY + margin;

  if (x1 >= bMinX && x1 <= bMaxX && y1 >= bMinY && y1 <= bMaxY) return true;
  if (x2 >= bMinX && x2 <= bMaxX && y2 >= bMinY && y2 <= bMaxY) return true;

  const segMinX = Math.min(x1, x2);
  const segMaxX = Math.max(x1, x2);
  const segMinY = Math.min(y1, y2);
  const segMaxY = Math.max(y1, y2);

  if (segMaxX < bMinX || segMinX > bMaxX || segMaxY < bMinY || segMinY > bMaxY) {
    return false;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;

  let tmin = 0;
  let tmax = 1;

  if (Math.abs(dx) > 1e-6) {
    const tx1 = (bMinX - x1) / dx;
    const tx2 = (bMaxX - x1) / dx;
    tmin = Math.max(tmin, Math.min(tx1, tx2));
    tmax = Math.min(tmax, Math.max(tx1, tx2));
  }
  if (Math.abs(dy) > 1e-6) {
    const ty1 = (bMinY - y1) / dy;
    const ty2 = (bMaxY - y1) / dy;
    tmin = Math.max(tmin, Math.min(ty1, ty2));
    tmax = Math.min(tmax, Math.max(ty1, ty2));
  }

  return tmax >= tmin;
}

function isSegmentBlocked(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  excludeAgentDesk?: AgentId
): boolean {
  for (const box of STATIC_OBSTACLES) {
    if (lineIntersectsBox(x1, y1, x2, y2, box, 4)) return true;
  }
  for (const [agentId, box] of Object.entries(DESK_OBSTACLES)) {
    if (excludeAgentDesk && agentId === excludeAgentDesk) continue;
    if (lineIntersectsBox(x1, y1, x2, y2, box, 4)) return true;
  }
  return false;
}

export class NPC extends Phaser.Physics.Arcade.Sprite {
  public readonly agentId: AgentId;
  public readonly deskX: number;
  public readonly deskY: number;

  private stateText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private statusIcon?: Phaser.GameObjects.Image;
  private promptIndicator!: Phaser.GameObjects.Container;
  public currentAgentState: AgentStateType = 'idle';

  // Navigation & Multi-Waypoint Path State
  private path: { x: number; y: number }[] = [];
  private walkSpeed = 65;
  private onWalkComplete?: () => void;
  private walkStuckTimer = 0;
  private lastDist = Infinity;
  public currentFacing: 'down' | 'up' | 'left' | 'right' = 'down';

  // Autonomous behavior state
  public isConversingWithBoss = false;
  public isSummonedToBoss = false;
  public isWandering = false;
  public isSpeaking = false;
  private idleDecisionTimer?: Phaser.Time.TimerEvent;
  private bossInactivityTimer?: Phaser.Time.TimerEvent;

  // Spontaneous Peer Conversation State
  public isConversingWithPeer = false;
  private peerConversationCooldown = 0;
  private peerCheckAccumulator = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, agentId: AgentId) {
    super(scene, x, y, `char_${agentId}`, 0);
    this.agentId = agentId;
    this.deskX = x;
    this.deskY = y; // Chair seat position (deskY - 12)

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Enlarged scale matching player
    this.setScale(1.5);
    this.setDepth(y + 10);
    this.setCollideWorldBounds(true);
    // Non-pushable by Player/Boss: Prevents Player from shoving NPC into walls, desks, or void!
    this.setPushable(false);

    // Foot-level hitbox matching top-down 2D pixel perspective (only feet collide!)
    this.setSize(16, 10);
    this.setOffset(8, 22);

    const cfg = AGENT_CONFIGS[agentId];

    // Agent name tag (Zen, Dre, Iky, Gus, Rai, Dhea)
    this.nameText = scene.add.text(Math.round(x), Math.round(y - 26), cfg.name.split(' ')[0], {
      fontFamily: '"Silkscreen", monospace, sans-serif',
      fontSize: '10px',
      color: '#F0F1DD',
      backgroundColor: '#0D110F',
      padding: { x: 5, y: 2 },
      resolution: 2,
    });
    this.nameText.setOrigin(0.5, 0.5);
    this.nameText.setDepth(y + 14);

    // State badge text
    this.stateText = scene.add.text(Math.round(x), Math.round(y + 24), '• idle', {
      fontFamily: '"Share Tech Mono", monospace, sans-serif',
      fontSize: '10px',
      color: '#869184',
      resolution: 2,
    });
    this.stateText.setOrigin(0.5, 0.5);
    this.stateText.setDepth(y + 14);

    // Floating status icon
    this.statusIcon = scene.add.image(x, y - 42, 'icon_working');
    this.statusIcon.setScale(1.2);
    this.statusIcon.setDepth(y + 16);
    this.statusIcon.setVisible(false);

    scene.tweens.add({
      targets: this.statusIcon,
      y: y - 46,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Interaction prompt [E] (Retro pixel hard rectangular pill with dynamic width & spacing)
    const promptTxt = scene.add.text(0, 0, '[E] Talk', {
      fontFamily: '"Silkscreen", monospace, sans-serif',
      fontSize: '10px',
      color: '#CCF12B',
      resolution: 2,
    });
    promptTxt.setOrigin(0, 0.5);

    const avatarWidth = 18;
    const paddingLeft = 6;
    const gapAvatarText = 8; // Visible comfortable spacing between avatar and [E] Talk
    const paddingRight = 8;
    const textWidth = Math.ceil(promptTxt.width);
    const boxWidth = paddingLeft + avatarWidth + gapAvatarText + textWidth + paddingRight;
    const boxHeight = 24;

    const promptBg = scene.add.graphics();
    promptBg.fillStyle(0x0d110f, 0.95);
    promptBg.lineStyle(1.5, 0xccf12b, 1);
    promptBg.fillRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
    promptBg.strokeRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);

    // Mini portrait 1:1 pixel avatar centered vertically
    const miniX = Math.round(-boxWidth / 2 + paddingLeft + avatarWidth / 2);
    const miniPortrait = scene.add.image(miniX, 0, `mini_portrait_${agentId}`);
    miniPortrait.setOrigin(0.5, 0.5);

    // Prompt text positioned with generous 8px gap after avatar
    const textX = Math.round(-boxWidth / 2 + paddingLeft + avatarWidth + gapAvatarText);
    promptTxt.setPosition(textX, 0);

    this.promptIndicator = scene.add.container(Math.round(x), Math.round(y - 52), [
      promptBg,
      miniPortrait,
      promptTxt,
    ]);
    this.promptIndicator.setDepth(4500);
    this.promptIndicator.setVisible(false);

    // Click on NPC to interact
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      gameBridge.requestInteraction(this.agentId);
    });

    // Start autonomous idle routine
    this.scheduleNextAutonomousAction();
  }

  // Update attached UI elements positions every frame (snapped to whole integer coordinates)
  private updateAttachedElements(): void {
    const rx = Math.round(this.x);
    const ry = Math.round(this.y);
    this.nameText?.setPosition(rx, ry - 26);
    this.stateText?.setPosition(rx, ry + 24);
    this.statusIcon?.setPosition(rx, ry - 42);
    this.promptIndicator?.setPosition(rx, ry - 52);
    this.setDepth(this.y + 10);
    this.nameText?.setDepth(this.y + 14);
    this.stateText?.setDepth(this.y + 14);
    this.statusIcon?.setDepth(this.y + 16);
  }

  public isNearOwnDesk(): boolean {
    return Math.hypot(this.x - this.deskX, this.y - this.deskY) < 32;
  }

  /**
   * Main physics & animation update cycle:
   * - Steers along corridor waypoints
   * - Predictive lookahead feelers recognize obstacles BEFORE touching
   * - Smooth lateral deflection & sliding without Arcade Physics jitter or 60Hz bounce
   * - Soft inter-NPC avoidance & passing maneuvers
   * - Strict animation synchronization tied to actual intentional velocity
   * - When speaking or conversing: freezes cleanly in place (no overlapping movement!)
   */
  public preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    // Update peer interaction cooldown timer
    if (this.peerConversationCooldown > 0) {
      this.peerConversationCooldown = Math.max(0, this.peerConversationCooldown - delta);
    }

    // Periodic check for spontaneous peer banter (every 500ms)
    this.peerCheckAccumulator += delta;
    if (this.peerCheckAccumulator >= 500) {
      this.peerCheckAccumulator = 0;
      this.checkSpontaneousPeerInteraction();
    }

    // If currently speaking, talking with Boss, or in peer conversation:
    // Freeze cleanly in place, do not move, face conversation partner!
    if (this.isSpeaking || this.isConversingWithBoss || this.isConversingWithPeer) {
      if (this.body && (Math.abs(this.body.velocity.x) > 0.05 || Math.abs(this.body.velocity.y) > 0.05)) {
        this.setVelocity(0, 0);
      }
      if (this.anims.isPlaying) {
        this.anims.stop();
      }
      this.resetFacing();
      this.updateAttachedElements();
      return;
    }

    // Active path following
    if (this.path.length > 0) {
      const currentTarget = this.path[0];
      const dist = Phaser.Math.Distance.Between(this.x, this.y, currentTarget.x, currentTarget.y);

      // Reached waypoint threshold
      if (dist < 10) {
        this.path.shift();
        if (this.path.length === 0) {
          this.stopWalking(true);
          this.updateAttachedElements();
          return;
        }
      }

      // Base angle and speed towards current waypoint
      const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, currentTarget.x, currentTarget.y);
      let steerAngle = targetAngle;
      let targetSpeed = this.walkSpeed;

      const isTargetingOwnDesk = Math.hypot(currentTarget.x - this.deskX, currentTarget.y - this.deskY) < 20;
      const allowOwnDesk = (this.isNearOwnDesk() || isTargetingOwnDesk) ? this.agentId : undefined;

      // 1. Predictive Lookahead Feeler Whisker (Checks ahead BEFORE colliding!)
      const feelerDist = 24;
      const fwdX = this.x + Math.cos(steerAngle) * feelerDist;
      const fwdY = this.y + Math.sin(steerAngle) * feelerDist;

      const forwardBlocked = isPointBlocked(fwdX, fwdY, 4, allowOwnDesk);

      if (forwardBlocked) {
        // Cast Left and Right sensory probes at ±45°
        const leftAngle = steerAngle - 0.785;
        const rightAngle = steerAngle + 0.785;
        const leftX = this.x + Math.cos(leftAngle) * (feelerDist - 4);
        const leftY = this.y + Math.sin(leftAngle) * (feelerDist - 4);
        const rightX = this.x + Math.cos(rightAngle) * (feelerDist - 4);
        const rightY = this.y + Math.sin(rightAngle) * (feelerDist - 4);

        const leftBlocked = isPointBlocked(leftX, leftY, 4, allowOwnDesk);
        const rightBlocked = isPointBlocked(rightX, rightY, 4, allowOwnDesk);

        if (!leftBlocked && rightBlocked) {
          steerAngle -= 0.85;
          targetSpeed *= 0.85;
        } else if (leftBlocked && !rightBlocked) {
          steerAngle += 0.85;
          targetSpeed *= 0.85;
        } else if (!leftBlocked && !rightBlocked) {
          const dLeft = Phaser.Math.Distance.Between(leftX, leftY, currentTarget.x, currentTarget.y);
          const dRight = Phaser.Math.Distance.Between(rightX, rightY, currentTarget.x, currentTarget.y);
          steerAngle += dLeft < dRight ? -0.7 : 0.7;
          targetSpeed *= 0.9;
        } else {
          // Both sides blocked: check 90° lateral avenues to slide cleanly
          const latLeft = isPointBlocked(this.x + Math.cos(steerAngle - 1.57) * 20, this.y + Math.sin(steerAngle - 1.57) * 20, 3, allowOwnDesk);
          const latRight = isPointBlocked(this.x + Math.cos(steerAngle + 1.57) * 20, this.y + Math.sin(steerAngle + 1.57) * 20, 3, allowOwnDesk);

          if (!latLeft) {
            steerAngle -= 1.45;
            targetSpeed *= 0.65;
          } else if (!latRight) {
            steerAngle += 1.45;
            targetSpeed *= 0.65;
          } else {
            targetSpeed *= 0.2;
          }
        }
      }

      let vx = Math.cos(steerAngle) * targetSpeed;
      let vy = Math.sin(steerAngle) * targetSpeed;

      // 2. Predictive Peer Avoidance (Soft repulsion & right-hand passing rule)
      const sceneAny = this.scene as any;
      if (sceneAny.npcs && sceneAny.npcs instanceof Map) {
        sceneAny.npcs.forEach((otherNpc: NPC) => {
          if (otherNpc === this || !otherNpc.active) return;
          const d = Phaser.Math.Distance.Between(this.x, this.y, otherNpc.x, otherNpc.y);
          if (d < 38 && d > 0.1) {
            const pushAngle = Phaser.Math.Angle.Between(otherNpc.x, otherNpc.y, this.x, this.y);
            const repulseFactor = ((38 - d) / 38) * 45;
            const perpAngle = pushAngle + 1.57;
            vx += Math.cos(pushAngle) * repulseFactor + Math.cos(perpAngle) * 12;
            vy += Math.sin(pushAngle) * repulseFactor + Math.sin(perpAngle) * 12;
          }
        });
      }

      // 3. Boss Player Avoidance (proactive steering around Player)
      if (sceneAny.player && sceneAny.player.active) {
        const isSummonArrival = this.isSummonedToBoss && this.path.length <= 1;
        if (!isSummonArrival) {
          const d = Phaser.Math.Distance.Between(this.x, this.y, sceneAny.player.x, sceneAny.player.y);
          if (d < 40 && d > 0.1) {
            const pushAngle = Phaser.Math.Angle.Between(sceneAny.player.x, sceneAny.player.y, this.x, this.y);
            const repulse = ((40 - d) / 40) * 50;
            vx += Math.cos(pushAngle) * repulse;
            vy += Math.sin(pushAngle) * repulse;
          }
        }
      }

      // 4. Smooth Tangential Slide Assist (prevents 60Hz corner jitter/vibration)
      if (this.body) {
        if (this.body.blocked.left && vx < 0) {
          vx = 0;
          if (Math.abs(vy) < 8) vy = currentTarget.y >= this.y ? 35 : -35;
        }
        if (this.body.blocked.right && vx > 0) {
          vx = 0;
          if (Math.abs(vy) < 8) vy = currentTarget.y >= this.y ? 35 : -35;
        }
        if (this.body.blocked.up && vy < 0) {
          vy = 0;
          if (Math.abs(vx) < 8) vx = currentTarget.x >= this.x ? 35 : -35;
        }
        if (this.body.blocked.down && vy > 0) {
          vy = 0;
          if (Math.abs(vx) < 8) vx = currentTarget.x >= this.x ? 35 : -35;
        }
      }

      // Apply normalized velocity
      const currentSpeed = Math.hypot(vx, vy);
      if (currentSpeed > 0) {
        const factor = Math.min(this.walkSpeed, currentSpeed) / currentSpeed;
        this.setVelocity(vx * factor, vy * factor);
      }

      // 5. Stuck Detection: if making no progress for > 400ms, advance waypoint or recalculate
      if (Math.abs(dist - this.lastDist) < 0.8) {
        this.walkStuckTimer += delta;
        if (this.walkStuckTimer > 400) {
          this.walkStuckTimer = 0;
          if (this.path.length > 1) {
            this.path.shift();
          } else {
            this.stopWalking(true);
          }
        }
      } else {
        this.walkStuckTimer = 0;
        this.lastDist = dist;
      }

      // 6. Rock-Solid Animation Synchronization (tied to intended physical motion)
      if (currentSpeed > 6) {
        let animKey = '';
        if (Math.abs(vx) >= Math.abs(vy)) {
          animKey = vx < 0 ? `char_${this.agentId}-walk-left` : `char_${this.agentId}-walk-right`;
          this.currentFacing = vx < 0 ? 'left' : 'right';
        } else {
          animKey = vy < 0 ? `char_${this.agentId}-walk-up` : `char_${this.agentId}-walk-down`;
          this.currentFacing = vy < 0 ? 'up' : 'down';
        }

        if (this.anims.currentAnim?.key !== animKey || !this.anims.isPlaying) {
          this.anims.play(animKey, true);
        }
      } else {
        if (this.anims.isPlaying) {
          this.anims.stop();
        }
        this.resetFacing();
      }
    } else {
      // Stationary state: ensure velocity is 0 and idle facing frame is displayed
      if (this.body && (Math.abs(this.body.velocity.x) > 0.05 || Math.abs(this.body.velocity.y) > 0.05)) {
        this.setVelocity(0, 0);
      }
      if (this.anims.isPlaying) {
        this.anims.stop();
      }
      this.resetFacing();
    }

    // Strict perimeter clamp: ensures NPC can NEVER penetrate walls or escape into the black void
    this.x = Phaser.Math.Clamp(this.x, 38, 730);
    this.y = Phaser.Math.Clamp(this.y, 92, 442);

    this.updateAttachedElements();
  }

  // Face towards target coordinate
  public faceTarget(targetX: number, targetY: number): void {
    const dx = targetX - this.x;
    const dy = targetY - this.y;

    if (Math.abs(dy) > Math.abs(dx)) {
      this.currentFacing = dy < 0 ? 'up' : 'down';
    } else {
      this.currentFacing = dx < 0 ? 'left' : 'right';
    }
    this.resetFacing();
  }

  // Reset to proper idle frame for current facing direction
  public resetFacing(): void {
    const facingFrames = { down: 0, left: 3, right: 6, up: 9 };
    this.setFrame(facingFrames[this.currentFacing] ?? 0);
  }

  // Stop walking cleanly
  public stopWalking(triggerComplete = false): void {
    this.path = [];
    this.setVelocity(0, 0);
    this.anims.stop();
    this.resetFacing();
    this.updateAttachedElements();

    if (triggerComplete && this.onWalkComplete) {
      const cb = this.onWalkComplete;
      this.onWalkComplete = undefined;
      cb();
    }
  }

  /**
   * Builds an intelligent corridor-aware route that navigates safely around desks & walls:
   * - When exiting row 1 desks: steps horizontally along chair row to open aisle, then down to corridor (NEVER cuts through desk!)
   * - When exiting row 2 desks: steps directly north into wide-open central corridor at Y=236
   * - When returning: approaches via corridor, steps into chair row, and seats facing down
   */
  private buildCorridorPath(destX: number, destY: number): { x: number; y: number }[] {
    const startX = this.x;
    const startY = this.y;

    const endX = Phaser.Math.Clamp(destX, 48, 720);
    const endY = Phaser.Math.Clamp(destY, 115, 435);

    const isTargetingDesk = Math.hypot(endX - this.deskX, endY - this.deskY) < 25;
    const isStartingAtDesk = this.isNearOwnDesk();
    const excludeDesk = (isTargetingDesk || isStartingAtDesk) ? this.agentId : undefined;

    // If direct line is completely clear, take direct path
    if (!isSegmentBlocked(startX, startY, endX, endY, excludeDesk)) {
      return [{ x: endX, y: endY }];
    }

    const waypoints: { x: number; y: number }[] = [];

    // Safe horizontal highways:
    // North aisle: Y=120
    // Central aisle: Y=236 (wide open across entire office!)
    // South aisle: Y=350
    let corridorY = 236;
    if (startY < 140 && endY < 140) {
      corridorY = 120;
    } else if (startY > 320 && endY > 320) {
      corridorY = 350;
    }

    const verticalAisles = [115, 295, 495, 690];
    const findNearestAisle = (x: number) => {
      return verticalAisles.reduce((prev, curr) => (Math.abs(curr - x) < Math.abs(prev - x) ? curr : prev));
    };

    const startAisleX = findNearestAisle(startX);
    const endAisleX = findNearestAisle(endX);

    // 1. Exit starting area safely:
    // If sitting at Row 1 desk (startY < 200), step along chair row to vertical aisle before moving down!
    if (isStartingAtDesk && startY < 200) {
      waypoints.push({ x: startAisleX, y: startY });
      waypoints.push({ x: startAisleX, y: corridorY });
    } else if (isSegmentBlocked(startX, startY, startX, corridorY, excludeDesk)) {
      waypoints.push({ x: startAisleX, y: startY });
      waypoints.push({ x: startAisleX, y: corridorY });
    } else {
      waypoints.push({ x: startX, y: corridorY });
    }

    // 2. Cross along horizontal corridor to destination vertical line or aisle:
    if (isTargetingDesk && endY < 200) {
      // Returning to Row 1 desk: reach aisle, walk up to chair row, then step horizontally into chair!
      waypoints.push({ x: endAisleX, y: corridorY });
      waypoints.push({ x: endAisleX, y: endY });
    } else if (isSegmentBlocked(endX, corridorY, endX, endY, excludeDesk)) {
      waypoints.push({ x: endAisleX, y: corridorY });
      waypoints.push({ x: endAisleX, y: endY });
    } else {
      waypoints.push({ x: endX, y: corridorY });
    }

    // 3. Final destination
    waypoints.push({ x: endX, y: endY });

    return waypoints;
  }

  /**
   * Walk to destination using corridor routing and dynamic obstacle avoidance.
   */
  public walkTo(
    targetX: number,
    targetY: number,
    onComplete?: () => void,
    speed = 65
  ): void {
    this.walkSpeed = speed;
    this.onWalkComplete = onComplete;
    this.walkStuckTimer = 0;
    this.lastDist = Infinity;

    this.path = this.buildCorridorPath(targetX, targetY);

    if (this.path.length === 0) {
      this.stopWalking(true);
    }
  }

  /**
   * Summoned by Boss in chat (e.g. "@Zen", "@Gus", "@Iky", etc.):
   * - Pauses at desk and speaks acknowledgment bubble for 2 seconds (clean, no overlapping!)
   * - Dismisses bubble cleanly
   * - Walks smoothly to Boss coordinates
   * - Stands near Boss and faces Boss
   * - Starts 30-second inactivity countdown timer
   */
  public summonToBoss(bossX: number, bossY: number): void {
    if (this.idleDecisionTimer) this.idleDecisionTimer.destroy();
    if (this.bossInactivityTimer) this.bossInactivityTimer.destroy();

    this.isSummonedToBoss = true;
    this.isWandering = false;
    this.isConversingWithPeer = false;

    // Responsive acknowledgment bubble
    const acks: Record<AgentId, string> = {
      [AGENT_IDS.LEADER]: 'Siap Bos! Zen segera meluncur ke posisi Anda.',
      [AGENT_IDS.RESEARCH]: 'Siap Bos! Dre segera merapat ke posisi Anda.',
      [AGENT_IDS.ENGINEERING]: 'Hadir Bos! Iky meluncur ke posisi Anda.',
      [AGENT_IDS.AUTOMATION]: 'Siap Bos! Gus siaga di dekat Anda.',
      [AGENT_IDS.QA]: 'Siap Bos! Rai segera ke sana untuk verifikasi.',
      [AGENT_IDS.MEMORY]: 'Siap Bos! Dhea segera merapat.',
    };

    // Show acknowledgment bubble immediately
    gameBridge.showBubble({
      agentId: this.agentId,
      text: acks[this.agentId] || 'Siap Bos! Saya menuju ke posisi Anda.',
      durationMs: 2000,
      bubbleType: 'speech',
    });

    // Start walking quickly with natural 250ms reaction time - bubble travels with agent!
    this.scene.time.delayedCall(250, () => {
      this.isSpeaking = false;

      // Open standing spot near Boss (offset 38px)
      const offsetX = bossX >= 384 ? -38 : 38;
      const targetX = Phaser.Math.Clamp(bossX + offsetX, 48, 720);
      const targetY = Phaser.Math.Clamp(bossY, 115, 430);

      this.walkTo(targetX, targetY, () => {
        this.faceTarget(bossX, bossY);
        this.startBossInactivityTimer(30000);
      });
    });
  }

  // Refreshes 30-second interaction timer when Boss sends another message
  public refreshBossInteraction(): void {
    if (this.isSummonedToBoss) {
      this.startBossInactivityTimer(30000);
    }
  }

  // Starts 30-second inactivity countdown timer
  private startBossInactivityTimer(delayMs = 30000): void {
    if (this.bossInactivityTimer) {
      this.bossInactivityTimer.destroy();
    }

    this.bossInactivityTimer = this.scene.time.delayedCall(delayMs, () => {
      this.onBossInactivityExpired();
    });
  }

  /**
   * Triggered when 30 seconds have passed with no new chat/request from Boss:
   * - Speaks polite departure line while pausing
   * - Dismisses bubble, then returns to desk or dynamic routine
   */
  private onBossInactivityExpired(): void {
    if (!this.isSummonedToBoss) return;
    this.isSummonedToBoss = false;

    this.isSpeaking = true;
    this.stopWalking(false);

    // Polite departure line
    gameBridge.showBubble({
      agentId: this.agentId,
      text: 'Tidak ada arahan lagi Bos? Saya izin kembali beraktivitas ya.',
      durationMs: 2500,
      bubbleType: 'speech',
    });

    this.scene.time.delayedCall(2500, () => {
      this.isSpeaking = false;
      gameBridge.clearBubble(this.agentId);

      if (this.currentAgentState !== 'idle') {
        this.returnToDesk();
      } else {
        this.performDynamicPostInactivityRoutine();
      }
    });
  }

  // Dynamic autonomous routine after 30s inactivity
  private performDynamicPostInactivityRoutine(): void {
    const roll = Math.random();

    if (roll < 0.35) {
      // 1. Visit Panoramic Window and gaze outside
      const windowX = Math.random() > 0.5 ? 210 : 546;
      this.isWandering = true;
      this.walkTo(windowX, 118, () => {
        this.currentFacing = 'up';
        this.resetFacing();
        this.isSpeaking = true;

        gameBridge.showBubble({
          agentId: this.agentId,
          text: 'Pemandangan luar kantor terasa menyegarkan.',
          durationMs: 3000,
        });

        this.scene.time.delayedCall(3200, () => {
          this.isSpeaking = false;
          gameBridge.clearBubble(this.agentId);
          this.returnToDesk();
        });
      });
    } else if (roll < 0.70) {
      // 2. Chat casually with another idle NPC colleague!
      this.attemptChatWithColleague();
    } else {
      // 3. Visit espresso/water fixture or return to desk
      this.performAutonomousRoutine();
    }
  }

  // ==========================================
  // SPONTANEOUS PEER CONVERSATION & GREETINGS
  // ==========================================

  // Periodically scans for idle peers within greeting proximity
  private checkSpontaneousPeerInteraction(): void {
    if (this.peerConversationCooldown > 0) return;
    if (
      this.isSpeaking ||
      this.isConversingWithPeer ||
      this.isConversingWithBoss ||
      this.isSummonedToBoss ||
      this.currentAgentState !== 'idle'
    ) {
      return;
    }

    const sceneAny = this.scene as any;
    if (!sceneAny.npcs || !(sceneAny.npcs instanceof Map)) return;

    for (const otherNpc of sceneAny.npcs.values()) {
      if (otherNpc === this || !otherNpc.active) continue;
      if (
        otherNpc.isSpeaking ||
        otherNpc.isConversingWithPeer ||
        otherNpc.isConversingWithBoss ||
        otherNpc.isSummonedToBoss ||
        otherNpc.currentAgentState !== 'idle' ||
        otherNpc.peerConversationCooldown > 0
      ) {
        continue;
      }

      const dist = Phaser.Math.Distance.Between(this.x, this.y, otherNpc.x, otherNpc.y);
      if (dist < 46) {
        // 35% probability to pause for a spontaneous peer greeting / chat!
        if (Math.random() < 0.35) {
          this.startPeerConversation(otherNpc);
          return;
        } else {
          this.peerConversationCooldown = 10000;
        }
      }
    }
  }

  /**
   * Initiates a spontaneous, smart dialogue between two passing or neighboring agents.
   * - Speaker A (initiator) speaks FIRST with greeting/question for 2000ms.
   * - Speaker B (recipient) answers SECOND after Speaker A finishes for 2000ms.
   * - Snappy timing: NO overlap, NO reversed order, NO awkward frozen delays!
   */
  public startPeerConversation(peer: NPC): void {
    this.isConversingWithPeer = true;
    peer.isConversingWithPeer = true;
    this.isSpeaking = true;
    peer.isSpeaking = true;

    // Apply 20-second cooldown to both
    this.peerConversationCooldown = 20000;
    peer.peerConversationCooldown = 20000;

    // Both stop physical motion completely
    this.stopWalking(false);
    peer.stopWalking(false);

    // Both face each other
    this.faceTarget(peer.x, peer.y);
    peer.faceTarget(this.x, this.y);

    const myName = AGENT_CONFIGS[this.agentId].name.split(' ')[0];
    const peerName = AGENT_CONFIGS[peer.agentId].name.split(' ')[0];

    // lineA is ALWAYS the opening / question by this agent (the initiator)
    // lineB is ALWAYS the response / answer by the peer (the recipient)
    const { lineA, lineB } = this.getSmartDialoguePair(this.agentId, peer.agentId, myName, peerName);

    // Turn 1: Speaker A (Initiator) speaks opening/question for 2000ms
    gameBridge.showBubble({
      agentId: this.agentId,
      text: lineA,
      durationMs: 2000,
      bubbleType: 'speech',
    });

    // Turn 2: Speaker B (Recipient) speaks answer AFTER Speaker A finishes (at 2150ms) for 2000ms
    this.scene.time.delayedCall(2150, () => {
      if (!this.active || !peer.active) return;
      gameBridge.clearBubble(this.agentId);
      gameBridge.showBubble({
        agentId: peer.agentId,
        text: lineB,
        durationMs: 2000,
        bubbleType: 'speech',
      });
    });

    // Wrap up conversation after Speaker B finishes (at 4300ms)
    this.scene.time.delayedCall(4300, () => {
      gameBridge.clearBubble(this.agentId);
      gameBridge.clearBubble(peer.agentId);

      this.isSpeaking = false;
      peer.isSpeaking = false;
      this.isConversingWithPeer = false;
      peer.isConversingWithPeer = false;

      // Both can now resume their activities promptly without overlapping or hanging!
      if (this.currentAgentState === 'idle') {
        this.scheduleNextAutonomousAction();
      } else {
        this.returnToDesk();
      }

      if (peer.currentAgentState === 'idle') {
        peer.scheduleNextAutonomousAction();
      } else {
        peer.returnToDesk();
      }
    });
  }

  // Generates smart contextual dialogues based on agent roles and personalities
  // ALWAYS guarantees lineA is Opening/Question by Initiator, and lineB is Answer by Recipient
  private getSmartDialoguePair(
    initiatorId: AgentId,
    recipientId: AgentId,
    initiatorName: string,
    recipientName: string
  ): { lineA: string; lineB: string } {
    const roleDialogues: Record<string, [string, string][]> = {
      // Zen (Leader) initiates
      [`${AGENT_IDS.LEADER}_${AGENT_IDS.ENGINEERING}`]: [
        ['Iky, gimana progres modul core engine dan testing hari ini?', 'Semua aman Zen! Codebase modular, build pass 100% tanpa issue.'],
        ['Iky, pastikan arsitektur sistem tetap clean dan maintainable ya.', 'Siap Zen! Clean architecture dan zero tech debt selalu jadi prioritas.'],
      ],
      [`${AGENT_IDS.LEADER}_${AGENT_IDS.RESEARCH}`]: [
        ['Dre, ada temuan baru dari analisis dokumentasi dan intent?', 'Ada Zen! Rekomendasi teknis dan context diagram sudah tervalidasi.'],
      ],
      [`${AGENT_IDS.LEADER}_${AGENT_IDS.AUTOMATION}`]: [
        ['Gus, bagaimana performa background workers dan pipeline automasi?', 'Semua worker task berjalan sangat lancar Zen! Throughput tinggi tanpa bottleneck.'],
      ],
      [`${AGENT_IDS.LEADER}_${AGENT_IDS.QA}`]: [
        ['Rai, apakah laporan audit mutu dan anti-hallucination sudah keluar?', 'Sudah Zen! Hasil verifikasi menunjukkan nol regresi dan checklist valid.'],
      ],
      [`${AGENT_IDS.LEADER}_${AGENT_IDS.MEMORY}`]: [
        ['Dhea, apakah riwayat context dan preferensi Boss tersinkronisasi?', 'Sinkronisasi pgvector realtime Zen! Semua intent tersimpan akurat untuk recall.'],
      ],

      // Iky (Engineering) initiates
      [`${AGENT_IDS.ENGINEERING}_${AGENT_IDS.LEADER}`]: [
        ['Zen, modul core dan test suite sudah selesai saya refactor.', 'Kerja bagus Iky! Arsitektur bersih bikin tim gerak lebih cepat.'],
      ],
      [`${AGENT_IDS.ENGINEERING}_${AGENT_IDS.AUTOMATION}`]: [
        ['Gus, script CI/CD dan shell runner siap dieksekusi kan?', 'Siap sedia Iky! Semua automated pipeline siap dipanggil sekali klik.'],
        ['Gus, worker testing otomatisnya sudah jalan?', 'Sudah aktif Iky! Regresi ditangani otomatis begitu ada perubahan kode.'],
      ],
      [`${AGENT_IDS.ENGINEERING}_${AGENT_IDS.QA}`]: [
        ['Rai, coba cek test suite dan assertion terbaru yang baru saya buat.', 'Sudah saya periksa Iky! Edge case aman dan coverage naik signifikan.'],
      ],
      [`${AGENT_IDS.ENGINEERING}_${AGENT_IDS.RESEARCH}`]: [
        ['Dre, spec arsitektur dari risetmu sudah mulai saya implementasikan.', 'Bagus sekali Iky! Kalau butuh detail tambahan kasih tahu saya ya.'],
      ],
      [`${AGENT_IDS.ENGINEERING}_${AGENT_IDS.MEMORY}`]: [
        ['Dhea, log error commit tadi sudah tercatat di memori?', 'Sudah Iky! Riwayat error pattern tersimpan untuk preventif ke depan.'],
      ],

      // Gus (Automation) initiates
      [`${AGENT_IDS.AUTOMATION}_${AGENT_IDS.LEADER}`]: [
        ['Zen, seluruh background jobs dan automation runner terpantau stabil.', 'Bagus Gus! Tetap pantau latensi eksekusinya ya.'],
      ],
      [`${AGENT_IDS.AUTOMATION}_${AGENT_IDS.ENGINEERING}`]: [
        ['Iky, mau trigger build automasi untuk commit terbaru sekarang?', 'Boleh Gus! Tolong jalankan test runner-nya sekarang ya.'],
      ],
      [`${AGENT_IDS.AUTOMATION}_${AGENT_IDS.QA}`]: [
        ['Rai, pipeline automated QA malam ini siap dijalankan?', 'Siap Gus! Semua checklist pengujian sudah terkonfigurasi dengan tepat.'],
      ],
      [`${AGENT_IDS.AUTOMATION}_${AGENT_IDS.RESEARCH}`]: [
        ['Dre, ada scraper tool baru yang perlu kita otomatisasi?', 'Ada Gus! Nanti saya kirimkan daftar API endpoint-nya ya.'],
      ],
      [`${AGENT_IDS.AUTOMATION}_${AGENT_IDS.MEMORY}`]: [
        ['Dhea, database backup dan vector collection aman?', 'Sangat aman Gus! Snapshot otomatis berjalan setiap jam tanpa issue.'],
      ],

      // Dre (Research) initiates
      [`${AGENT_IDS.RESEARCH}_${AGENT_IDS.LEADER}`]: [
        ['Zen, hasil riset dan analisis kebutuhan teknis sudah siap direview.', 'Terima kasih Dre! Ayo kita diskusikan roadmap eksekusinya.'],
      ],
      [`${AGENT_IDS.RESEARCH}_${AGENT_IDS.ENGINEERING}`]: [
        ['Iky, ada referensi library baru yang sangat optimal untuk task kita.', 'Menarik sekali Dre! Kirimkan dokumentasinya, akan saya uji coba.'],
      ],
      [`${AGENT_IDS.RESEARCH}_${AGENT_IDS.MEMORY}`]: [
        ['Dhea, tolong index insight riset terbaru ke semantic memory ya.', 'Beres Dre! Sudah terindeks di vector collection dan siap di-query.'],
      ],
      [`${AGENT_IDS.RESEARCH}_${AGENT_IDS.QA}`]: [
        ['Rai, acceptance criteria untuk modul baru sudah saya susun.', 'Siap Dre! Segera saya buatkan skenario pengujiannya.'],
      ],
      [`${AGENT_IDS.RESEARCH}_${AGENT_IDS.AUTOMATION}`]: [
        ['Gus, script pengumpul data riset bisa dijalankan otomatis?', 'Tentu Dre! Worker otomatisasi siap mengeksekusinya di background.'],
      ],

      // Rai (QA) initiates
      [`${AGENT_IDS.QA}_${AGENT_IDS.LEADER}`]: [
        ['Zen, audit mutu komprehensif menunjukkan status zero defect.', 'Luar biasa Rai! Standar kualitas tim kita terjaga sangat tinggi.'],
      ],
      [`${AGENT_IDS.QA}_${AGENT_IDS.ENGINEERING}`]: [
        ['Iky, regression test build terakhir menunjukkan hasil sempurna!', 'Terima kasih Rai! Assertion yang kamu buat sangat membantu.'],
      ],
      [`${AGENT_IDS.QA}_${AGENT_IDS.AUTOMATION}`]: [
        ['Gus, auto-test pipeline baru saja selesai tanpa satu pun error.', 'Keren Rai! Worker automasi kita mencatat latensi terendah hari ini.'],
      ],
      [`${AGENT_IDS.QA}_${AGENT_IDS.RESEARCH}`]: [
        ['Dre, skenario test case sudah sesuai dengan dokumen requirement.', 'Mantap Rai! Verifikasimu bikin kode kita jauh lebih terpercaya.'],
      ],
      [`${AGENT_IDS.QA}_${AGENT_IDS.MEMORY}`]: [
        ['Dhea, checklist verifikasi rilis sudah tersimpan rapi kan?', 'Sudah Rai! Terarsipkan di episodic memory dan siap diaudit kapan pun.'],
      ],

      // Dhea (Memory) initiates
      [`${AGENT_IDS.MEMORY}_${AGENT_IDS.LEADER}`]: [
        ['Zen, riwayat task dan memory snapshot berhasil diarsipkan lengkap.', 'Sip Dhea! Memori yang akurat bikin keputusan kita selalu tepat.'],
      ],
      [`${AGENT_IDS.MEMORY}_${AGENT_IDS.RESEARCH}`]: [
        ['Dre, data dokumen riset baru sudah terintegrasi ke vector index.', 'Hebat Dhea! Pengambilan konteks sekarang jadi jauh lebih cepat.'],
      ],
      [`${AGENT_IDS.MEMORY}_${AGENT_IDS.ENGINEERING}`]: [
        ['Iky, histori bug fix kemarin sudah dipelajari oleh model memori.', 'Bagus Dhea! Jadi sistem kita makin cerdas dari waktu ke waktu.'],
      ],
      [`${AGENT_IDS.MEMORY}_${AGENT_IDS.AUTOMATION}`]: [
        ['Gus, cache memory worker automasi sudah dibersihkan dan dioptimasi.', 'Terima kasih Dhea! Memory footprint jadi jauh lebih ringan sekarang.'],
      ],
      [`${AGENT_IDS.MEMORY}_${AGENT_IDS.QA}`]: [
        ['Rai, laporan audit mutu minggu ini sudah terindeks dengan rapi.', 'Sempurna Dhea! Dokumentasi kualitas kita jadi sangat tertata.'],
      ],
    };

    const directKey = `${initiatorId}_${recipientId}`;
    if (roleDialogues[directKey] && roleDialogues[directKey].length > 0) {
      const pair = roleDialogues[directKey][Math.floor(Math.random() * roleDialogues[directKey].length)];
      return { lineA: pair[0], lineB: pair[1] };
    }

    // Default natural casual office chatter
    // Initiator greets first, Recipient responds!
    const casualDialogues: [string, string][] = [
      [`Halo ${recipientName}! Kopi di espresso bar tadi aromanya enak banget, sudah seduh?`, `Sudah ${initiatorName}! Fresh espresso bikin fokus kerja seharian terasa mantap.`],
      [`Pemandangan kota dari jendela luar hari ini cerah sekali ya ${recipientName}.`, `Iya ${initiatorName}, suasana ruang kantor juga terasa sangat produktif dan nyaman.`],
      [`Semangat ${recipientName}, kolaborasi antar-agent kita hari ini berjalan sangat rapi!`, `Terima kasih ${initiatorName}, senang bisa bekerja sama dalam satu tim solid ini!`],
      [`${recipientName}, istirahat sejenak meregangkan badan bagus untuk konsentrasi lho.`, `Benar sekali ${initiatorName}, recharge sejenak lalu lanjut beraksi lagi!`],
    ];

    const chosen = casualDialogues[Math.floor(Math.random() * casualDialogues.length)];
    return { lineA: chosen[0], lineB: chosen[1] };
  }

  // Casual peer banter initiated autonomously: walks to open corridor in front of colleague's desk!
  private attemptChatWithColleague(): void {
    const sceneAny = this.scene as any;
    if (!sceneAny.npcs || !(sceneAny.npcs instanceof Map)) {
      this.returnToDesk();
      return;
    }

    const peers: NPC[] = [];
    sceneAny.npcs.forEach((npc: NPC) => {
      if (
        npc !== this &&
        npc.currentAgentState === 'idle' &&
        !npc.isSummonedToBoss &&
        !npc.isWandering &&
        !npc.isSpeaking &&
        !npc.isConversingWithPeer
      ) {
        peers.push(npc);
      }
    });

    if (peers.length === 0) {
      this.returnToDesk();
      return;
    }

    const colleague = peers[Math.floor(Math.random() * peers.length)];

    // Target open corridor right in front of colleague's desk (ZERO collision with desk or chair!)
    // For Row 1 desks (Y < 200): stand at Y=230 facing up across desk
    // For Row 2 desks (Y > 250): stand at Y=236 facing down across desk
    const standX = colleague.deskX;
    const standY = colleague.deskY < 200 ? 230 : 236;

    this.isWandering = true;
    this.walkTo(standX, standY, () => {
      this.startPeerConversation(colleague);
    });
  }

  // Schedule next autonomous decision
  private scheduleNextAutonomousAction(): void {
    if (this.idleDecisionTimer) {
      this.idleDecisionTimer.destroy();
    }

    const delay = 14000 + Math.random() * 12000;
    this.idleDecisionTimer = this.scene.time.delayedCall(delay, () => {
      this.performAutonomousRoutine();
    });
  }

  // Autonomous routine for idle agents with safe open-floor waypoints
  private performAutonomousRoutine(): void {
    if (
      this.currentAgentState !== 'idle' ||
      this.isSpeaking ||
      this.isConversingWithBoss ||
      this.isSummonedToBoss ||
      this.isConversingWithPeer
    ) {
      this.scheduleNextAutonomousAction();
      return;
    }

    // 25% chance to go greet a colleague directly in front of their desk
    if (Math.random() < 0.25) {
      this.attemptChatWithColleague();
      return;
    }

    const waypoints: OfficeWaypoint[] = [
      { name: 'coffee', x: 110, y: 350, facing: 'left', bubbleText: 'Fresh espresso break.' },
      { name: 'water', x: 86, y: 350, facing: 'left', bubbleText: 'Refill air minum sejenak.' },
      { name: 'whiteboard', x: 384, y: 120, facing: 'up', bubbleText: 'Reviewing architecture roadmap.' },
      { name: 'window_west', x: 210, y: 118, facing: 'up', bubbleText: 'Memandang pemandangan kota di luar.' },
      { name: 'window_east', x: 546, y: 118, facing: 'up', bubbleText: 'Udara kantor terasa nyaman.' },
      { name: 'lounge', x: 605, y: 365, facing: 'right', bubbleText: 'Istirahat sejenak di lounge.' },
    ];

    const destination = waypoints[Math.floor(Math.random() * waypoints.length)];
    this.isWandering = true;

    this.walkTo(destination.x, destination.y, () => {
      if (
        this.currentAgentState !== 'idle' ||
        this.isConversingWithBoss ||
        this.isSummonedToBoss ||
        this.isConversingWithPeer
      ) {
        this.returnToDesk();
        return;
      }

      this.currentFacing = destination.facing;
      this.resetFacing();

      if (destination.bubbleText && Math.random() > 0.4) {
        this.isSpeaking = true;
        gameBridge.showBubble({
          agentId: this.agentId,
          text: destination.bubbleText,
          durationMs: 2000,
        });

        this.scene.time.delayedCall(2150, () => {
          this.isSpeaking = false;
          gameBridge.clearBubble(this.agentId);
          this.returnToDesk();
        });
      } else {
        this.scene.time.delayedCall(1600 + Math.random() * 1200, () => {
          if (!this.isConversingWithBoss && !this.isSummonedToBoss && !this.isConversingWithPeer) {
            this.returnToDesk();
          }
        });
      }
    });
  }

  // Return to assigned workstation desk
  public returnToDesk(onComplete?: () => void): void {
    this.walkTo(this.deskX, this.deskY, () => {
      this.isWandering = false;
      this.isSummonedToBoss = false;
      this.isConversingWithPeer = false;
      this.isSpeaking = false;
      this.currentFacing = 'down';
      this.resetFacing();
      this.scheduleNextAutonomousAction();
      onComplete?.();
    });
  }

  // Pause when Boss player approaches or speaks
  public pauseForBoss(bossX: number, bossY: number): void {
    this.isConversingWithBoss = true;
    this.isConversingWithPeer = false;
    this.path = [];
    this.setVelocity(0, 0);
    this.anims.stop();
    this.faceTarget(bossX, bossY);
  }

  // Resume after Boss leaves or dialogue closes
  public resumeFromBoss(): void {
    this.isConversingWithBoss = false;
    if (this.currentAgentState !== 'idle') {
      this.returnToDesk();
    } else {
      this.scheduleNextAutonomousAction();
    }
  }

  // Update agent state (working, thinking, idle, etc.)
  public setAgentState(state: AgentStateType): this {
    const prevState = this.currentAgentState;
    this.currentAgentState = state;

    const colors: Record<AgentStateType, string> = {
      idle: '#94A3B8',
      thinking: '#38BDF8',
      moving: '#FBBF24',
      working: '#34D399',
      consulting: '#A78BFA',
      blocked: '#F87171',
      reviewing: '#F472B6',
      reporting: '#60A5FA',
      offline: '#64748B',
      fallback_mode: '#FB923C',
    };

    this.stateText.setText(`• ${state}`);
    this.stateText.setColor(colors[state] || '#FFFFFF');

    // If assigned work and currently wandering or summoned, immediately return to desk!
    if (
      (state === 'working' || state === 'thinking' || state === 'reviewing' || state === 'consulting') &&
      prevState === 'idle'
    ) {
      if (this.isWandering || this.isSummonedToBoss || this.isConversingWithPeer) {
        if (this.bossInactivityTimer) this.bossInactivityTimer.destroy();
        this.isConversingWithPeer = false;
        this.isSpeaking = false;
        gameBridge.clearBubble(this.agentId);

        gameBridge.showBubble({
          agentId: this.agentId,
          text: 'Task diterima! Kembali ke meja kerja.',
          durationMs: 2200,
        });

        this.scene.time.delayedCall(2200, () => {
          gameBridge.clearBubble(this.agentId);
          this.returnToDesk();
        });
      }
    }

    // Update floating status icon
    if (!this.statusIcon) return this;

    if (state === 'working') {
      this.statusIcon.setTexture('icon_working');
      this.statusIcon.setVisible(true);
    } else if (state === 'thinking' || state === 'consulting') {
      this.statusIcon.setTexture('icon_thinking');
      this.statusIcon.setVisible(true);
    } else if (state === 'reviewing') {
      this.statusIcon.setTexture('icon_review');
      this.statusIcon.setVisible(true);
    } else if (state === 'blocked' || state === 'offline') {
      this.statusIcon.setTexture('icon_blocked');
      this.statusIcon.setVisible(true);
    } else {
      this.statusIcon.setVisible(false);
    }

    return this;
  }

  public showPrompt(show: boolean): void {
    this.promptIndicator.setVisible(show);
  }

  public destroy(fromScene?: boolean): void {
    this.stopWalking();
    if (this.idleDecisionTimer) this.idleDecisionTimer.destroy();
    if (this.bossInactivityTimer) this.bossInactivityTimer.destroy();
    this.nameText?.destroy();
    this.stateText?.destroy();
    this.statusIcon?.destroy();
    this.promptIndicator?.destroy();
    super.destroy(fromScene);
  }
}
