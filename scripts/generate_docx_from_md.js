#!/usr/bin/env node
/*
 scripts/generate_docx_from_md.js

 Converts documentation/QLMonitor_documentation.md -> documentation/QLMonitor_documentation.docx
 Uses: markdown-it + html-to-docx

 Usage:
   npm install markdown-it html-to-docx
   node scripts/generate_docx_from_md.js

 Output:
   documentation/QLMonitor_documentation.docx
*/

const fs = require('fs');
const path = require('path');
const markdownIt = require('markdown-it');
const htmlToDocx = require('html-to-docx');

(async () => {
  try {
    const repoRoot = path.resolve(__dirname, '..');
    const mdPath = path.join(repoRoot, 'documentation', 'QLMonitor_documentation.md');
    const outPath = path.join(repoRoot, 'documentation', 'QLMonitor_documentation.docx');

    if (!fs.existsSync(mdPath)) {
      console.error('ERROR: Markdown source not found at', mdPath);
      process.exit(1);
    }

    const markdown = fs.readFileSync(mdPath, 'utf8');
    const md = markdownIt({ html: true, linkify: true, typographer: true });
    const body = md.render(markdown);

    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${body}</body></html>`;

    console.log('Converting markdown -> HTML -> DOCX...');

    const fileBuffer = await htmlToDocx(html, null, {
      table: { row: { cantSplit: true } },
    });

    fs.writeFileSync(outPath, fileBuffer);
    console.log('✅ Generated DOCX:', outPath);
  } catch (err) {
    console.error('❌ Failed to generate DOCX:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
