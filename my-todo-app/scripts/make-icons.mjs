// Renders the PNG app icons from public/favicon.svg. Run with: node scripts/make-icons.mjs
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
const targets = [
  { file: "icon-192.png", size: 192, pad: 0 },
  { file: "icon-512.png", size: 512, pad: 0 },
  // Maskable icons get cropped to a circle or squircle, so the mark sits inside a safe zone.
  { file: "icon-maskable-512.png", size: 512, pad: 0.14, background: "#6e2580" },
  { file: "apple-touch-icon.png", size: 180, pad: 0.1, background: "#6e2580" },
];

const browser = await chromium.launch();
for (const { file, size, pad, background } of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(
    `<body style="margin:0;display:grid;place-items:center;width:${size}px;height:${size}px;background:${background ?? "transparent"}">
       <div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div>
     </body>`
  );
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: !background });
  await page.close();
}
await browser.close();
