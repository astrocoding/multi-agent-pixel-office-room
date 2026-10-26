import * as Phaser from 'phaser';

export class BubbleChatSystem {
  private scene: Phaser.Scene;
  private activeBubbles: Map<string, Phaser.GameObjects.Container> = new Map();
  private bubbleTimers: Map<string, Phaser.Time.TimerEvent> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public showBubble(
    entityId: string,
    x: number,
    y: number,
    text: string,
    durationMs = 3800,
    bubbleType: 'speech' | 'thought' | 'alert' = 'speech'
  ): void {
    // Immediately remove existing bubble and pending timer for this entity
    this.removeBubble(entityId);

    const paddingX = 10;
    const paddingY = 8;
    const maxTextWidth = 150;

    // Clean raw markdown markup (asterisks, backticks, headers) for clean in-game canvas text
    const cleanText = text
      .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`+(.*?)`+/g, '$1')
      .replace(/^#{1,4}\s+/gm, '')
      .trim();

    // Pixel styled text with crisp 2x resolution
    const textObj = this.scene.add.text(0, 0, cleanText, {
      fontFamily: '"Share Tech Mono", "VT323", monospace, sans-serif',
      fontSize: '11px',
      color: bubbleType === 'alert' ? '#F16E5E' : '#F0F1DD',
      align: 'center',
      wordWrap: { width: maxTextWidth, useAdvancedWrap: true },
      resolution: 2,
    });
    textObj.setOrigin(0.5, 0.5);

    const bounds = textObj.getBounds();
    const boxWidth = Math.max(bounds.width + paddingX * 2, 56);
    const boxHeight = bounds.height + paddingY * 2;

    // Pixel speech bubble frame
    const graphics = this.scene.add.graphics();
    const bgColor = bubbleType === 'alert' ? 0x1b211d : 0x121615;
    const borderColor = bubbleType === 'alert' ? 0xf16e5e : 0x465047;

    graphics.fillStyle(bgColor, 0.98);
    graphics.lineStyle(1.5, borderColor, 1);

    // Box with sharp pixel corners (0-radius)
    graphics.fillRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
    graphics.strokeRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);

    // Tail pointing down to speaker
    graphics.fillStyle(bgColor, 1);
    graphics.beginPath();
    graphics.moveTo(-4, boxHeight / 2);
    graphics.lineTo(0, boxHeight / 2 + 5);
    graphics.lineTo(4, boxHeight / 2);
    graphics.closePath();
    graphics.fillPath();

    graphics.beginPath();
    graphics.moveTo(-4, boxHeight / 2);
    graphics.lineTo(0, boxHeight / 2 + 5);
    graphics.lineTo(4, boxHeight / 2);
    graphics.strokePath();

    // Container placed over character head (high depth so it's never obscured)
    const container = this.scene.add.container(x, y - 52, [graphics, textObj]);
    container.setDepth(5500);
    container.setScale(0.8);

    // Pop-in animation
    this.scene.tweens.add({
      targets: container,
      scaleX: 1,
      scaleY: 1,
      duration: 150,
      ease: 'Back.easeOut',
    });

    this.activeBubbles.set(entityId, container);

    // Reliable auto-dismiss timer
    const timer = this.scene.time.delayedCall(durationMs, () => {
      this.bubbleTimers.delete(entityId);
      if (this.activeBubbles.get(entityId) === container && container.active) {
        this.scene.tweens.add({
          targets: container,
          alpha: 0,
          y: container.y - 8,
          duration: 180,
          onComplete: () => {
            if (this.activeBubbles.get(entityId) === container) {
              container.destroy();
              this.activeBubbles.delete(entityId);
            }
          },
        });
      }
    });

    this.bubbleTimers.set(entityId, timer);
  }

  // Smoothly updates bubble position matching current entity coordinates every frame
  public updatePosition(entityId: string, x: number, y: number): void {
    const bubble = this.activeBubbles.get(entityId);
    if (bubble && bubble.active) {
      bubble.setPosition(x, y - 52);
    }
  }

  public isShowingBubble(entityId: string): boolean {
    return this.activeBubbles.has(entityId);
  }

  public removeBubble(entityId: string): void {
    const timer = this.bubbleTimers.get(entityId);
    if (timer) {
      timer.destroy();
      this.bubbleTimers.delete(entityId);
    }

    const existing = this.activeBubbles.get(entityId);
    if (existing) {
      existing.destroy();
      this.activeBubbles.delete(entityId);
    }
  }

  public destroy(): void {
    this.bubbleTimers.forEach((t) => t.destroy());
    this.bubbleTimers.clear();
    this.activeBubbles.forEach((b) => b.destroy());
    this.activeBubbles.clear();
  }
}
