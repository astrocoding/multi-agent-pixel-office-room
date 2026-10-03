import * as Phaser from 'phaser';
import { OfficeLayout, type RectCollider } from '@agent-office/game-core';

export class CollisionSystem {
  private scene: Phaser.Scene;
  public staticGroup!: Phaser.Physics.Arcade.StaticGroup;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.createColliders();
  }

  private createColliders(): void {
    this.staticGroup = this.scene.physics.add.staticGroup();
    const colliders = OfficeLayout.getColliders();

    colliders.forEach((col: RectCollider) => {
      // Invisible static physics body
      const zone = this.scene.add.zone(col.x, col.y, col.width, col.height);
      this.scene.physics.world.enable(zone, Phaser.Physics.Arcade.STATIC_BODY);
      this.staticGroup.add(zone);
    });
  }

  public getGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.staticGroup;
  }
}

