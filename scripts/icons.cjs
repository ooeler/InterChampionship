// Erzeugt die App-Icons (Startbildschirm) aus dem Club-Logo: node scripts/icons.cjs <logo-datei> app [hintergrundfarbe]
const { chromium } = require("@playwright/test");
const fs = require("fs"), path = require("path");
const BG = process.argv[4] || "#B9001B"; // Hintergrund: Vereinsrot wie die App
(async () => {
  const [src, out] = process.argv.slice(2);
  const ext = path.extname(src).slice(1);
  const url = `data:image/${ext};base64,` + fs.readFileSync(src).toString("base64");
  const b = await chromium.launch(), p = await b.newPage();
  await p.setContent("<canvas></canvas>");
  const res = await p.evaluate(async ({ url, BG }) => {
    const im = new Image(); im.src = url; await im.decode();
    // Ränder ohne Inhalt abschneiden
    const c0 = document.createElement("canvas"); c0.width = im.naturalWidth; c0.height = im.naturalHeight;
    const x0 = c0.getContext("2d"); x0.drawImage(im, 0, 0);
    const d = x0.getImageData(0, 0, c0.width, c0.height).data;
    let l = c0.width, t = c0.height, r = 0, bt = 0;
    for (let y = 0; y < c0.height; y++) for (let x = 0; x < c0.width; x++) {
      const i = (y * c0.width + x) * 4; const a = d[i + 3];
      if (a > 16) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > bt) bt = y; }
    }
    const sw = r - l + 1, sh = bt - t + 1;
    const mk = (size, frac) => {
      const c = document.createElement("canvas"); c.width = c.height = size; const x = c.getContext("2d");
      x.fillStyle = BG; x.fillRect(0, 0, size, size);
      const s = Math.min(size * frac / sw, size * frac / sh), w = sw * s, h = sh * s;
      x.imageSmoothingQuality = "high"; x.drawImage(im, l, t, sw, sh, (size - w) / 2, (size - h) / 2, w, h);
      return c.toDataURL("image/png").split(",")[1];
    };
    return { w: im.naturalWidth, h: im.naturalHeight, crop: [l, t, sw, sh],
      "icon-192.png": mk(192, 0.9), "icon-512.png": mk(512, 0.9), "icon-maskable-512.png": mk(512, 0.64), "apple-touch-icon.png": mk(180, 0.88) }; // maskable: Logo im sicheren Kreis (80 %)
  }, { url, BG });
  for (const k of Object.keys(res)) if (k.endsWith(".png")) fs.writeFileSync(path.join(out, k), Buffer.from(res[k], "base64"));
  console.log(res.w, res.h, res.crop);
  await b.close();
})();
