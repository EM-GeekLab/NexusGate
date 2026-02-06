/**
 * Generate a TanStack Start SPA shell (index.html) for the docs site.
 *
 * When running inside Docker, the Vite preview server used by TanStack Start's
 * prerender step crashes with ECONNREFUSED (v1.147.1 forces prerender on in SPA
 * mode). This script produces a functionally equivalent _shell.html so the SPA
 * boots correctly even when prerender fails.
 *
 * Usage: node scripts/generate-docs-shell.cjs <assets-dir> <output-path>
 *   e.g. node scripts/generate-docs-shell.cjs backend/docs/assets backend/docs/index.html
 */

"use strict";

const fs = require("fs");
const path = require("path");

const assetsDir = process.argv[2];
const outputPath = process.argv[3];

if (!assetsDir || !outputPath) {
  console.error(
    "Usage: node generate-docs-shell.cjs <assets-dir> <output-path>"
  );
  process.exit(1);
}

const files = fs.readdirSync(assetsDir);
const mainJs = files.find((f) => /^main-\w+\.js$/.test(f));
const cssFiles = files.filter((f) => f.endsWith(".css"));

// The "/" route component is the smallest index-*.js file (typically ~40 bytes,
// just `const n=()=>null;export{n as component};`).
const indexJsCandidates = files
  .filter((f) => /^index-\w+\.js$/.test(f))
  .map((f) => ({ name: f, size: fs.statSync(path.join(assetsDir, f)).size }))
  .sort((a, b) => a.size - b.size);
const indexJs = indexJsCandidates.length > 0 ? indexJsCandidates[0].name : null;

if (!mainJs) {
  console.error(`No main-*.js entry found in ${assetsDir}`);
  process.exit(1);
}

const mainSrc = `/docs/assets/${mainJs}`;
const indexSrc = indexJs ? `/docs/assets/${indexJs}` : null;
const cssLinks = cssFiles
  .map((c) => `<link rel="stylesheet" href="/docs/assets/${c}"/>`)
  .join("");

// Build the TanStack Router stream-barrier bootstrap.
// This is the minimal manifest the SPA shell needs so that TanStack Router can
// initialise client-side routing. Without it the page is blank.
const tsrBootstrap = `<script class="$tsr" id="$tsr-stream-barrier">`
  + `(self.$R=self.$R||{})["tsr"]=[];`
  + `self.$_TSR={`
  +   `h(){this.hydrated=!0,this.c()},`
  +   `e(){this.streamEnded=!0,this.c()},`
  +   `c(){this.hydrated&&this.streamEnded&&(delete self.$_TSR,delete self.$R.tsr)},`
  +   `p(e){this.initialized?e():this.buffer.push(e)},`
  +   `buffer:[]`
  + `};`
  + `\n`
  // Minimal router manifest – declares __root__ and "/" (index) routes.
  // TanStack Router discovers nested routes via code-splitting at runtime.
  + `;$_TSR.router=($R=>$R[0]={`
  +   `manifest:$R[1]={`
  +     `routes:$R[2]={`
  +       `__root__:$R[3]={`
  +         `preloads:$R[4]=["${mainSrc}"],`
  +         `assets:$R[5]=[$R[6]={tag:"script",attrs:$R[7]={type:"module",async:!0},children:"import('${mainSrc}')"}]`
  +       `}` + (indexSrc ? `,"/":{preloads:["${indexSrc}"]}` : "")
  +     `},`
  +     `matches:$R[10]=[$R[11]={i:"__root__/",u:${Date.now()},s:"success",ssr:!0}],`
  +     `lastMatchId:"__root__/"`
  +   `}`
  + `})($R["tsr"]);`
  + `$_TSR.e();document.currentScript.remove()`
  + `</script>`;

// Theme initializer (next-themes). Sets light/dark before first paint to
// prevent a flash of unstyled content.
const themeScript = `<script>((e2,i,s,u,m,a,l2,h)=>{`
  + `let d=document.documentElement,w=["light","dark"];`
  + `function p(n2){(Array.isArray(e2)?e2:[e2]).forEach((y)=>{`
  + `let k=y==="class",S=k&&a?m.map((f)=>a[f]||f):m;`
  + `k?(d.classList.remove(...S),d.classList.add(a&&a[n2]?a[n2]:n2)):d.setAttribute(y,n2);`
  + `}),R(n2);}function R(n2){h&&w.includes(n2)&&(d.style.colorScheme=n2);}`
  + `function c(){return window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}`
  + `if(u)p(u);else try{let n2=localStorage.getItem(i)||s,y=l2&&n2==="system"?c():n2;p(y);}catch(n2){}`
  + `})("class","theme","system",null,["light","dark"],null,true,true)</script>`;

const html = `<!DOCTYPE html>`
  + `<html lang="en"><head>`
  + `<meta charSet="utf-8"/>`
  + `<meta name="viewport" content="width=device-width, initial-scale=1"/>`
  + `<title>NexusGate Docs</title>`
  + `<link rel="modulepreload" href="${mainSrc}"/>`
  + cssLinks
  + `</head><body class="flex flex-col min-h-screen">`
  + themeScript
  + tsrBootstrap
  + `<script type="module" async="">import('${mainSrc}')</script>`
  + `</body></html>`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html);
console.log(`Generated SPA shell: ${outputPath}`);
