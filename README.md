# Project Aria

A 3D zombie survival sandbox that runs in the browser. You start with nothing, craft your way from stone tools to machined guns, build a base the dead will try to tear down, and found a family dynasty that carries on after you die.

Built with plain JavaScript and [Three.js](https://threejs.org/) (vendored in `vendor/`). There is no build step.

## Play locally

Any static file server works. ES modules don't load from `file://`, so you can't just open `index.html`:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy to Vercel

The repo is a plain static site, so Vercel needs no configuration:

1. Push this repo to GitHub.
2. In Vercel, choose **Add New → Project** and import the repo.
3. Set **Framework Preset** to **Other**, leave the build command empty and the output directory as the root, then click **Deploy**.

Or use the CLI from the repo root: `npx vercel` (and `npx vercel --prod` for production).

## What's in it

| System | Details |
| --- | --- |
| **Sandbox world** | Procedural 200×200 tile map: forests, lakes, roads, towns with lootable buildings, ore fields, wrecked cars. |
| **Survival** | Hunger, thirst, energy and stamina. Bleeding, infection (fatal without antibiotics) and food poisoning. Boil murky water. Farm potatoes, collect rain. |
| **Progression** | By hand → campfire → workbench → forge (iron, gunpowder) → machine shop (assault rifles, chainsaws, jackhammers). Five RPG skills level up with use and unlock recipes and builds. |
| **Inventory** | Tarkov-style grid: items have sizes, rotate with R while dragging, Shift+click transfers, backpacks enlarge the grid. |
| **Junk loop** | Fallout-style scrapping: toasters, radios, typewriters and the like break down into screws, springs, adhesive and electronics. |
| **Building** | Walls, doors, floors, traps, storage, beds and crafting stations, plus repair and deconstruct tools. |
| **Zombie AI** | Zombies hear noise and see light, run faster at night, and follow a flow field to you. When walls block the way, they smash through the weakest point. Every 7th night a Blood Moon horde hunts you. |
| **Humans** | Survivors have traits, opinions and romance. Chat, joke, gift, recruit, and command companions to follow, guard or gather. Raiders attack. Wolves hunt at night. |
| **Permadeath and dynasty** | One save. You age a year each day and can die of old age. If your partner outlives you, play on as your heir in the same world. Every death earns legacy points for permanent perks. |

## Controls

| Key | Action |
| --- | --- |
| WASD | Move (Shift sprint, C crouch/sneak) |
| Mouse | Aim; left click to attack, harvest or use |
| Right-drag / Z / X | Rotate camera (mouse wheel zooms) |
| E | Interact |
| Tab / I | Inventory |
| Q | Craft |
| B | Build |
| K | Character |
| M | Map |
| R | Reload |
| 1–5 | Hotbar |
| Esc | Pause |

## Code layout

```
index.html, style.css     page shell and UI styles
src/main.js               menus, input, camera controls, main loop
src/game.js               simulation: player, combat, crafting, building, social, death and succession, saves
src/ai.js                 zombies, survivors, raiders, wildlife, spawning
src/world.js              world generation, tiles and objects, line of sight
src/render3d.js           Three.js renderer: chunked instanced world, characters, lighting, effects
src/ui.js                 HUD, grid inventory, crafting, build menu, dialogue, maps
src/inventory.js          grid inventory logic
src/legacy.js             permanent perks and family history
src/data/*.js             items, recipes, world objects, loot tables
```
