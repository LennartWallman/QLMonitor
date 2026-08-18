#!/usr/bin/env node
/*
 scripts/generate_diagrams_and_docx.js

This helper script will:
 1) Render Mermaid .mmd files under documentation/diagrams/ to SVG and PNG (1200px width) using mermaid-cli (via npx).
 2) Update (no-op) and then generate documentation/QLMonitor_documentation.docx using pandoc.

Usage:
  - Ensure Node.js and npm are installed.
  - Install mermaid-cli if you want globally, or use npx (script uses npx by default):
      npm install -g @mermaid-js/mermaid-cli
    or the script will call npx for each render.
  - Install pandoc (required to create .docx): https://pandoc.org/installing.html
  - From repo root run:
      node scripts/generate_diagrams_and_docx.js

Notes:
  - The script will attempt to call 'npx @mermaid-js/mermaid-cli' for rendering and 'pandoc' for DOCX creation.
  - If you prefer SVG-only or different sizes, edit the DIAGRAMS array and WIDTH constant below.
*/

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '..');
const diagramsDir = path.join(repoRoot, 'documentation', 'diagrams');
const mdFile = path.join(repoRoot, 'documentation', 'QLMonitor_documentation.md');
const outDocx = path.join(repoRoot, 'documentation', 'QLMonitor_documentation.docx');

const DIAGRAMS = [
  'system-architecture.mmd',
  'monitoring-cycle.mmd',
  'alerting-flow.mmd',
];
const WIDTH = 1200; // PNG width in px

function run(cmd) {
  console.log('> ' + cmd);
  return execSync(cmd, { stdio: 'inherit' });
}

(async () => {
  try {
    if (!fs.existsSync(diagramsDir)) {
      console.error('Diagrams directory not found:', diagramsDir);
      process.exit(1);
    }
    if (!fs.existsSync(mdFile)) {
      console.error('Markdown file not found:', mdFile);
      process.exit(1);
    }

    console.log('Rendering Mermaid diagrams to SVG + PNG...');

    for (const d of DIAGRAMS) {
      const inPath = path.join(diagramsDir, d);
      if (!fs.existsSync(inPath)) {
        console.warn('Skipping missing diagram file:', inPath);
        continue;
      }
      const base = path.basename(d, '.mmd');
      const svgOut = path.join(diagramsDir, base + '.svg');
      const pngOut = path.join(diagramsDir, base + '.png');

      // Render SVG
      try {
        run(`npx @mermaid-js/mermaid-cli -i "${inPath}" -o "${svgOut}"`);
      } catch (e) {
        console.warn('Failed to render SVG with mermaid-cli via npx. Make sure @mermaid-js/mermaid-cli is installed.');
        console.warn('You can install it globally with: npm install -g @mermaid-js/mermaid-cli');
      }

      // Render PNG at WIDTH
      try {
        run(`npx @mermaid-js/mermaid-cli -i "${inPath}" -o "${pngOut}" -w ${WIDTH}`);
      } catch (e) {
        console.warn('Failed to render PNG with mermaid-cli via npx. You may convert SVG -> PNG with another tool (e.g. rsvg-convert or ImageMagick).');
      }
    }

    console.log('\nGenerating DOCX via pandoc...');
    try {
      // Use pandoc to convert markdown to docx; pandoc will inline images referenced in the markdown
      run(`pandoc "${mdFile}" -s -o "${outDocx}"`);
      console.log('\n✅ Generated DOCX:', outDocx);
    } catch (e) {
      console.warn('Pandoc step failed. Ensure pandoc is installed and on PATH: https://pandoc.org/installing.html');
      console.warn('If you prefer a Node-based conversion, run the existing scripts/generate_docx_from_md.js after rendering images.');
    }

    console.log('\nDone. If everything ran without errors, commit the generated files:');
    console.log('  git add documentation/diagrams/*.svg documentation/diagrams/*.png documentation/QLMonitor_documentation.docx');
    console.log('  git commit -m "Add diagrams (Mermaid + images) and embed them in documentation; generate DOCX"');
    console.log('  git push origin feat/docs-generate');
  } catch (err) {
    console.error('Unexpected error:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
