/*
  Panel styles, scoped inside a shadow root so Canvas's CSS can't change the
  panel and the panel can't change Canvas. Follows the RJEdTech tool
  standard: charcoal masthead with a Raider-red rule, 16px body text, 14px
  minimum for secondary text, neutral charcoal dark mode, WCAG AA contrast.
*/
export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.wrap {
  --bg: #ffffff; --fg: #1f2329; --muted: #5b6168; --line: #d8dbe0; --card: #f6f7f9;
  --red: #C11430; --red-text: #a3122a; --warn-bg: #fff4e5; --warn-fg: #7a4100;
  --fix-bg: #fdecef; --link: #0b5cad; --focus: #2563eb;
  font: 16px/1.5 "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
  color: var(--fg);
}
@media (prefers-color-scheme: dark) {
  .wrap {
    --bg: #15161a; --fg: #e8e9ec; --muted: #a9adb4; --line: #33363d; --card: #1d1f24;
    --red-text: #ed516a; --warn-bg: #3a2a12; --warn-fg: #ffd28a; --fix-bg: #3a1a20; --link: #8ab8ff;
  }
}
button, select { font: inherit; color: inherit; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }

.launcher {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-radius: 999px; border: 0; cursor: pointer;
  background: #2a2a2a; color: #fff; font-weight: 600; font-size: 15px;
  box-shadow: 0 4px 14px rgba(0,0,0,.25); border-bottom: 3px solid var(--red);
}
.launcher:hover { background: #3a3a3a; }
.badge {
  min-width: 24px; padding: 0 7px; border-radius: 999px; background: var(--red);
  color: #fff; font-size: 14px; line-height: 24px; text-align: center;
}

.panel {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483001;
  width: min(460px, 100vw); display: flex; flex-direction: column;
  background: var(--bg); color: var(--fg); border-left: 1px solid var(--line);
  box-shadow: -8px 0 24px rgba(0,0,0,.18);
}
.mast { background: #2a2a2a; color: #fff; border-bottom: 6px solid var(--red); padding: 14px 16px 12px; display: flex; align-items: center; gap: 12px; }
.mark { width: 34px; height: 34px; border-radius: 6px; background: var(--red); color: #fff; font-weight: 800; font-size: 15px; display: grid; place-items: center; letter-spacing: .02em; flex: none; }
.mast h2 { margin: 0; font-size: 18px; font-weight: 700; line-height: 1.2; }
.mast .tag { margin: 2px 0 0; color: #b8b8b8; font-size: 13px; text-transform: uppercase; letter-spacing: .12em; }
.mast .close { margin-left: auto; background: transparent; border: 1px solid #555; color: #fff; border-radius: 6px; width: 36px; height: 36px; cursor: pointer; font-size: 18px; line-height: 1; }

.scope { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--line); }
.scope label { font-size: 14px; color: var(--muted); }
.scope select { flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); }

.tabs { display: flex; border-bottom: 1px solid var(--line); padding: 0 8px; }
.tab { flex: 1; padding: 10px 4px 8px; background: none; border: 0; border-bottom: 3px solid transparent; cursor: pointer; font-size: 15px; color: var(--muted); font-weight: 600; }
.tab[aria-selected="true"] { color: var(--fg); border-bottom-color: var(--red); }
.tab .n { font-weight: 700; }

.body { flex: 1; overflow-y: auto; padding: 12px 16px 20px; }
.summary { margin: 0 0 12px; font-size: 16px; }
.note { margin: 12px 0 0; font-size: 14px; color: var(--muted); }
.empty { padding: 24px 8px; text-align: center; color: var(--muted); }
h3 { margin: 16px 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
h3:first-child { margin-top: 0; }

.row { display: block; padding: 10px 12px; margin: 0 0 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); }
.row.old { border-left: 4px solid var(--red); }
.row.fix { border-left: 4px solid var(--red); }
.row.check { border-left: 4px solid #b26b00; }
.code { display: inline-block; font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
.title { display: block; font-weight: 600; color: var(--link); text-decoration: none; overflow-wrap: anywhere; }
a.title:hover { text-decoration: underline; }
.plain { color: var(--fg); }
.meta { display: block; font-size: 14px; color: var(--muted); }
.meta b { color: var(--fg); font-weight: 600; }
.late { color: var(--red-text); font-weight: 600; }
.actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.btn { display: inline-flex; align-items: center; padding: 5px 12px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); font-size: 14px; cursor: pointer; text-decoration: none; }
.btn.primary { background: #2a2a2a; color: #fff; border-color: #2a2a2a; }
@media (prefers-color-scheme: dark) { .btn.primary { background: #e8e9ec; color: #15161a; border-color: #e8e9ec; } }

.privacy { display: flex; gap: 10px; align-items: center; justify-content: space-between; padding: 10px 12px; margin: 0 0 12px; border-radius: 8px; background: var(--warn-bg); color: var(--warn-fg); font-size: 14px; }
.count { display: flex; justify-content: space-between; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; margin: 0 0 8px; }
details.row > summary { cursor: pointer; list-style: revert; }
details.row ul { margin: 8px 0 0; padding-left: 20px; font-size: 15px; }

.day { margin: 0 0 14px; }
.day h4 { margin: 0 0 6px; font-size: 16px; }
.day h4 .muted { color: var(--muted); font-weight: 400; font-size: 14px; }
.flag { padding: 6px 10px; margin: 0 0 6px; border-radius: 6px; background: var(--warn-bg); color: var(--warn-fg); font-size: 14px; }
.item { display: flex; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--line); font-size: 15px; }
.item .time { flex: none; width: 74px; color: var(--muted); font-size: 14px; }
.item a { color: var(--link); text-decoration: none; overflow-wrap: anywhere; }
.item .code { display: block; }
.item .pts { margin-left: auto; flex: none; color: var(--muted); font-size: 14px; }

.foot { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--line); font-size: 14px; color: var(--muted); }
.foot .spacer { flex: 1; }
.linkbtn { background: none; border: 0; padding: 4px 6px; color: var(--link); cursor: pointer; font-size: 14px; text-decoration: underline; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;
