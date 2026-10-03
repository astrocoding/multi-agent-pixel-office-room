import * as Phaser from 'phaser';
import { gameBridge } from '../ui-bridge/GameBridge.js';

export class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private speed = 160;
  private lastEmitTime = 0;
  public currentDirection: 'down' | 'up' | 'left' | 'right' = 'down';
  private isMoving = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'char_boss', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Enlarged scale for rich 2D pixel-art presence
    this.setScale(1.5);
    this.setCollideWorldBounds(true);

    // Foot-level hitbox matching 1.5x scaled body
    this.setSize(18, 14);
    this.setOffset(7, 18);
    this.setDepth(y);

    this.initInputs();
  }

  // Detects if user is currently focused on an HTML input or textarea
  public static isTypingInInput(): boolean {
    if (typeof document === 'undefined') return false;
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      (el as HTMLElement).isContentEditable
    );
  }

  private initInputs(): void {
    if (this.scene.input.keyboard) {
      this.cursors = this.scene.input.keyboard.createCursorKeys();
      // CRITICAL: clearCaptures removes default preventDefault on arrow keys
      this.scene.input.keyboard.clearCaptures();

      // Pass enableCapture = false so WASD never swallows typing in HTML inputs!
      this.wasdKeys = this.scene.input.keyboard.addKeys(
        {
          W: Phaser.Input.Keyboard.KeyCodes.W,
          A: Phaser.Input.Keyboard.KeyCodes.A,
          S: Phaser.Input.Keyboard.KeyCodes.S,
          D: Phaser.Input.Keyboard.KeyCodes.D,
        },
        false
      ) as typeof this.wasdKeys;

      this.scene.input.keyboard.clearCaptures();
    }
  }

  public faceTarget(targetX: number, targetY: number): void {
    const dx = targetX - this.x;
    const dy = targetY - this.y;

    if (Math.abs(dy) > Math.abs(dx)) {
      this.setDirection(dy < 0 ? 'up' : 'down');
    } else {
      this.setDirection(dx < 0 ? 'left' : 'right');
    }
  }

  public setDirection(dir: 'down' | 'up' | 'left' | 'right'): void {
    this.currentDirection = dir;
    if (this.isMoving) {
      this.anims.play(`char_boss-walk-${dir}`, true);
    } else {
      this.anims.stop();
      const idleFrames = { down: 0, left: 3, right: 6, up: 9 };
      this.setFrame(idleFrames[dir]);
    }
  }

  public update(): void {
    // If user is focused on an HTML input or textarea, freeze player movement completely
    if (Player.isTypingInInput()) {
      if (this.isMoving) {
        this.setVelocity(0, 0);
        this.isMoving = false;
        this.setDirection(this.currentDirection);
      }
      return;
    }

    let vx = 0;
    let vy = 0;

    const left = this.cursors?.left.isDown || this.wasdKeys?.A.isDown;
    const right = this.cursors?.right.isDown || this.wasdKeys?.D.isDown;
    const up = this.cursors?.up.isDown || this.wasdKeys?.W.isDown;
    const down = this.cursors?.down.isDown || this.wasdKeys?.S.isDown;

    if (left) vx -= this.speed;
    if (right) vx += this.speed;
    if (up) vy -= this.speed;
    if (down) vy += this.speed;

    // Normalize diagonal velocity
    if (vx !== 0 && vy !== 0) {
      vx *= 0.7071;
      vy *= 0.7071;
    }

    this.setVelocity(vx, vy);
    const wasMoving = this.isMoving;
    this.isMoving = vx !== 0 || vy !== 0;

    // Direction calculation
    if (Math.abs(vy) > Math.abs(vx)) {
      if (vy < 0 && this.currentDirection !== 'up') {
        this.currentDirection = 'up';
      } else if (vy > 0 && this.currentDirection !== 'down') {
        this.currentDirection = 'down';
      }
    } else if (vx !== 0) {
      if (vx < 0 && this.currentDirection !== 'left') {
        this.currentDirection = 'left';
      } else if (vx > 0 && this.currentDirection !== 'right') {
        this.currentDirection = 'right';
      }
    }

    // Play walk animation or stop at idle frame
    if (this.isMoving) {
      this.anims.play(`char_boss-walk-${this.currentDirection}`, true);
    } else if (wasMoving) {
      this.anims.stop();
      const idleFrames = { down: 0, left: 3, right: 6, up: 9 };
      this.setFrame(idleFrames[this.currentDirection]);
    }

    // Dynamic depth sorting by Y
    this.setDepth(this.y + 16);

    // Strict perimeter clamp to keep Player inside room bounds
    this.x = Phaser.Math.Clamp(this.x, 34, 734);
    this.y = Phaser.Math.Clamp(this.y, 90, 446);

    // Throttle emit player position for bridge
    const now = Date.now();
    if (now - this.lastEmitTime > 100 && this.isMoving) {
      this.lastEmitTime = now;
      gameBridge.emit('player:position', { x: Math.round(this.x), y: Math.round(this.y) });
    }
  }
}
