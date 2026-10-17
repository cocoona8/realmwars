# Realm Wars

A browser real-time strategy game. Pick Humans, Magic, or Monsters, gather wood, gold, and iron, and destroy every enemy building.

## Play

```bash
npm install
npm run dev
```

Then open [http://127.0.0.1:5173](http://127.0.0.1:5173).

You need Node.js 18 or newer. If the `node` on your PATH is older, `npm run dev` still works on this Mac when Cursor is installed, because the script falls back to Cursor's Node.

## Build a copy you can put online

```bash
npm run build
npm run preview
```

`npm run build` writes the site into `dist/`. Upload that folder anywhere static files can be hosted, and open `index.html` from there.

## Controls

- Left-click selects one unit or building. Drag a box to select many. Shift-click adds or removes. Double-click or Ctrl-click selects every unit of that type on screen.
- Right-click moves, attacks, gathers, or sets a building's rally point.
- A, then click: attack-move. M: move. S: stop. H: hold. P: patrol.
- Hold Shift to queue commands.
- With workers selected, B opens the build menu. Each building and unit has its own letter key.
- Ctrl+1 through 9 saves a control group. Press the number again to select it, and press it twice to center the camera.
- Scroll the map by moving the mouse to the screen edge or with the arrow keys. Click the minimap to jump there. Right-click the minimap to send units.

Costs and unit stats live in `src/data/races.ts`.
