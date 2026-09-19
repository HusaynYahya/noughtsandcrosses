/* ============================================================================
   PAPER.md → paper.html
   ----------------------------------------------------------------------------
   A browser will not display a .md file — it downloads it — so the report is
   published as a page as well. The markdown stays the source of truth; this
   turns it into HTML in the site's own clothes.

     node tools/build-paper.js
   ============================================================================ */
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var src = fs.readFileSync(path.join(ROOT, "PAPER.md"), "utf8");

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Inline marks: code first and set aside, so nothing inside a code span is
   mistaken for emphasis afterwards. */
function inline(s) {
  var codes = [];
  s = escapeHtml(s).replace(/`([^`]+)`/g, function (_, c) {
    codes.push(c);
    return "@@CODE" + (codes.length - 1) + "@@";
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return s.replace(/@@CODE(\d+)@@/g, function (_, i) {
    return "<code>" + codes[+i] + "</code>";
  });
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function tableRow(line) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); });
}

var out = [], toc = [];
var lines = src.split("\n");
var i = 0;

while (i < lines.length) {
  var line = lines[i];

  if (/^```/.test(line)) {                                   /* code block */
    var code = [];
    i++;
    while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
    i++;
    out.push("<pre><code>" + escapeHtml(code.join("\n")) + "</code></pre>");
    continue;
  }

  if (/^\s*$/.test(line)) { i++; continue; }

  if (/^---+\s*$/.test(line)) { out.push("<hr />"); i++; continue; }

  var h = /^(#{1,4})\s+(.*)$/.exec(line);
  if (h) {
    var level = h[1].length, text = h[2].trim(), id = slug(text);
    if (level === 2) toc.push({ id: id, text: text });
    out.push("<h" + level + ' id="' + id + '">' + inline(text) + "</h" + level + ">");
    i++;
    continue;
  }

  if (/^>\s?/.test(line)) {                                  /* quote */
    var quote = [];
    while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ""));
    out.push("<blockquote><p>" + inline(quote.join(" ")) + "</p></blockquote>");
    continue;
  }

  if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {   /* table */
    var head = tableRow(line);
    i += 2;
    var body = [];
    while (i < lines.length && /^\s*\|/.test(lines[i])) body.push(tableRow(lines[i++]));
    out.push('<div class="scroll"><table><thead><tr>' +
      head.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      body.map(function (r) {
        return "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>");
    continue;
  }

  if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {                  /* list */
    var ordered = /^\s*\d+\./.test(line);
    var items = [];
    while (i < lines.length && /^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])) {
      var item = [lines[i++].replace(/^\s*(?:[-*]|\d+\.)\s+/, "")];
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]) &&
             !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])) item.push(lines[i++].trim());
      items.push(item.join(" "));
    }
    var tag = ordered ? "ol" : "ul";
    out.push("<" + tag + ">" +
      items.map(function (t) { return "<li>" + inline(t) + "</li>"; }).join("") +
      "</" + tag + ">");
    continue;
  }

  var para = [];                                             /* paragraph */
  while (i < lines.length && !/^\s*$/.test(lines[i]) &&
         !/^(#{1,4}\s|>|```|---+\s*$)/.test(lines[i]) &&
         !/^\s*\|/.test(lines[i]) && !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])) {
    para.push(lines[i++]);
  }
  if (para.length) out.push("<p>" + inline(para.join(" ").trim()) + "</p>");
}

var contents = toc.map(function (t) {
  return '<li><a href="#' + t.id + '">' + escapeHtml(t.text) + "</a></li>";
}).join("");

var body = out.join("\n").replace(/<\/h1>/,
  '</h1>\n<nav class="toc"><b>Contents</b><ol>' + contents + "</ol></nav>");

var page = [
'<!DOCTYPE html>',
'<html lang="en">',
'<head>',
'<meta charset="UTF-8" />',
'<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
'<meta name="description" content="How the ultimate noughts and crosses engine learned to play: a linear policy trained on its own search, inside a Monte-Carlo tree search." />',
'<meta name="theme-color" content="#161512" />',
'<title>Learning to play ultimate noughts and crosses</title>',
'<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Cg stroke=\'%23629924\' stroke-width=\'6\' fill=\'none\'%3E%3Cpath d=\'M36 8v84M64 8v84M8 36h84M8 64h84\'/%3E%3C/g%3E%3C/svg%3E" />',
'<style>',
'  :root {',
'    color-scheme: dark;',
'    --bg: #161512; --surface: #1c1a17; --surface-2: #232120; --line: #3f3c38;',
'    --text: #c6c3be; --text-strong: #ecebe8; --muted: #8a8681;',
'    --go: #629924; --go-hi: #8bc34a; --blue: #6da7ec;',
'    --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;',
'    --serif: "Iowan Old Style", Palatino, Georgia, "Times New Roman", serif;',
'    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;',
'  }',
'  * { box-sizing: border-box; }',
'  body { margin: 0; background: var(--bg); color: var(--text);',
'         font-family: var(--serif); font-size: 17px; line-height: 1.65;',
'         -webkit-text-size-adjust: 100%; -webkit-font-smoothing: antialiased; }',
'  header.top { background: var(--surface); border-bottom: 1px solid var(--line); }',
'  .top__in { max-width: 860px; margin-inline: auto; padding: .7rem clamp(1rem, 4vw, 1.5rem);',
'             display: flex; gap: 1rem; justify-content: space-between; align-items: center;',
'             flex-wrap: wrap; font-family: var(--font); font-size: .85rem; }',
'  .top a { color: var(--text); text-decoration: none; }',
'  .top a:hover { color: var(--go-hi); }',
'  .top b { color: var(--text-strong); }',
'  main { max-width: 860px; margin-inline: auto; padding: 0 clamp(1rem, 4vw, 1.5rem) 5rem; }',
'  h1 { font-size: clamp(1.9rem, 5vw, 2.7rem); line-height: 1.12; color: var(--text-strong);',
'       margin: 2.2rem 0 1rem; font-weight: 600; }',
'  h2 { font-size: clamp(1.25rem, 3vw, 1.6rem); color: var(--text-strong); margin: 2.8rem 0 .8rem;',
'       font-weight: 600; padding-top: .7rem; border-top: 1px solid var(--line); }',
'  h3 { font-size: 1.1rem; color: var(--text-strong); margin: 2rem 0 .6rem; font-weight: 600; }',
'  h4 { font-size: 1rem; color: var(--text-strong); margin: 1.6rem 0 .5rem; font-weight: 600; }',
'  p { margin: 0 0 1.1rem; }',
'  strong { color: var(--text-strong); font-weight: 600; }',
'  a { color: var(--blue); }',
'  a:hover { color: var(--go-hi); }',
'  hr { border: 0; border-top: 1px solid var(--line); margin: 2.5rem 0; }',
'  blockquote { margin: 1.4rem 0; padding: .85rem 1.1rem; background: var(--surface);',
'               border-left: 3px solid var(--go); color: var(--text-strong); }',
'  blockquote p { margin: 0; }',
'  ul, ol { margin: 0 0 1.2rem; padding-left: 1.3rem; }',
'  li { margin-bottom: .5rem; }',
'  code { font-family: var(--mono); font-size: .86em; background: var(--surface-2);',
'         padding: .1rem .3rem; border-radius: 3px; color: var(--text-strong); }',
'  pre { background: var(--surface); border: 1px solid var(--line); padding: .9rem 1rem;',
'        overflow-x: auto; margin: 0 0 1.3rem; }',
'  pre code { background: none; padding: 0; font-size: .82rem; line-height: 1.5; }',
'  .scroll { overflow-x: auto; margin: 0 0 1.4rem; }',
'  table { border-collapse: collapse; width: 100%; font-family: var(--font); font-size: .84rem; }',
'  th, td { padding: .45rem .6rem; border-bottom: 1px solid var(--line); text-align: left;',
'           vertical-align: top; }',
'  th { color: var(--muted); font-weight: 500; white-space: nowrap; }',
'  td strong { color: var(--go-hi); }',
'  .toc { background: var(--surface); border: 1px solid var(--line); padding: 1rem 1.2rem;',
'         margin: 1.5rem 0 2.5rem; font-family: var(--font); font-size: .86rem; }',
'  .toc b { display: block; color: var(--muted); font-size: .7rem; text-transform: uppercase;',
'           letter-spacing: .12em; margin-bottom: .6rem; font-weight: 500; }',
'  .toc ol { margin: 0; padding-left: 1.1rem; }',
'  .toc li { margin-bottom: .3rem; }',
'  .toc a { color: var(--text); text-decoration: none; }',
'  .toc a:hover { color: var(--go-hi); }',
'</style>',
'</head>',
'<body>',
'<header class="top">',
'  <div class="top__in">',
'    <span><b>How the engine learned</b></span>',
'    <span><a href="index.html">home</a> · <a href="play.html">play</a> ·',
'      <a href="progress.html">the charts</a> ·',
'      <a href="https://github.com/HusaynYahya/noughtsandcrosses/blob/main/PAPER.md">the markdown</a></span>',
'  </div>',
'</header>',
'<main>',
body,
'</main>',
'</body>',
'</html>',
''].join("\n");

fs.writeFileSync(path.join(ROOT, "paper.html"), page);
console.log("wrote paper.html — " + out.length + " blocks, " + toc.length + " sections");
