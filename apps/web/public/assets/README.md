# Agent Office Room — Pixel Asset Pack V1

Original cohesive **top-down 2D pixel-art** resources created for a Phaser/JavaScript game.

## Inventory

- `characters/`: 7 character spritesheets (Boss, Leader, Research, Engineering, Automation, QA, Memory). Each PNG is **96×128 px**, with **12 frames (3 columns × 4 rows)**. Individual frames are exactly **32×32 px**.
- `tiles/`: 32 individual tiles and a **128×64 px tile atlas**. Each tile is exactly **16×16 px**.
- `props/`: 38 individual PNG furniture items and a **256×160 px prop atlas**. Each atlas frame is exactly **32×32 px**, with transparent padding where appropriate.
- `ui/`: 24 individual **16×16 px** status icons, 16×16 icon atlas, and a **48×24 px** speech bubble.
- `previews/`: upscaled previews. These are for visualization only; **do not use them as spritesheets**.
- `reference/`: visual concept sheet to help maintain the style, **not a pixel-aligned runtime atlas**.
- `assets-manifest.json`: names, paths, atlas indices, animation frame maps.
- `demo-room-layout.json`: example room composition.

## Character spritesheet frame order

Each row is a direction; frame order is row-major:

| Row | Direction | Frame indices |
|---:|---|---|
| 0 | down | 0, 1, 2 |
| 1 | left | 3, 4, 5 |
| 2 | right | 6, 7, 8 |
| 3 | up | 9, 10, 11 |

Frame `0/3/6/9` is idle. Frames `1/2`, `4/5`, `7/8`, `10/11` are short walking variants.

## Example: Phaser 3 loading

```js
// preload()
this.load.spritesheet('boss', '/assets/characters/boss_32x32.png', {
  frameWidth: 32, frameHeight: 32,
});
this.load.spritesheet('leader', '/assets/characters/leader_32x32.png', {
  frameWidth: 32, frameHeight: 32,
});
this.load.image('office-tiles', '/assets/tiles/office_tileset_16x16.png');
this.load.spritesheet('office-props', '/assets/props/office_props_atlas_32x32.png', {
  frameWidth: 32, frameHeight: 32,
});
this.load.spritesheet('office-icons', '/assets/ui/office_ui_icons_16x16.png', {
  frameWidth: 16, frameHeight: 16,
});

// create()
this.anims.create({
  key: 'boss-walk-down',
  frames: this.anims.generateFrameNumbers('boss', { frames: [1, 0, 2, 0] }),
  frameRate: 6,
  repeat: -1,
});
const boss = this.add.sprite(96, 96, 'boss', 0);
boss.setScale(2); // integer scaling preserves pixel edges

// Phaser config (outside scene)
// render: { pixelArt: true, antialias: false, roundPixels: true }
// scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
```

**Tilemap note:** Atlas tile index `i` corresponds to pixel rect `((i%8)*16, floor(i/8)*16, 16,16)`.
Names and indices are listed in `assets-manifest.json`. For a Tiled tilemap, add the atlas as a 16px tileset.

**Props note:** Props atlas index `i` corresponds to a 32×32 frame at `((i%8)*32, floor(i/8)*32)`.
Use the individual prop PNGs when you need varying origin/bounds.

## Practical limitations

- This is a lightweight **starter asset pack**, not a finished commercial-grade environment/animation pipeline.
- Sprites do not contain collision bounds or Tiled object layers. Define collision boxes in your Phaser scene.
- The movement cycles are short loops, designed for low-speed office character motion. Add more frames if more fluid animation is needed.
- `demo-room-layout.json` is an illustrative example; verify walkability and collision before using it as a production map.
- Reference screenshots provided by the user informed the *overall genre/style*, but individual assets here are newly created rather than cut directly from those screenshots.
