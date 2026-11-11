/*
  Panel styles, scoped inside a shadow root so Canvas's CSS can't change the
  panel and the panel can't change Canvas. Follows the RJEdTech tool
  standard: charcoal masthead with a Raider-red rule, 16px body text, 14px
  minimum for secondary text, neutral charcoal dark mode, WCAG AA contrast.
*/
import { RJ_MARK } from './rjMark';

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
/* Explicit colors so the native box follows the theme (it showed light text on white in dark mode). */
select { background: var(--bg); color: var(--fg); color-scheme: light dark; border: 1px solid var(--line); border-radius: 4px; }
/* Canvas dark mode flips the whole page. A panel already in dark colors flips
   back on itself. The filter can't go on the host: that would trap these
   fixed elements inside a zero-height box, off the screen. */
@media (prefers-color-scheme: dark) {
  :host-context(html.rj-dark-canvas) .launcher,
  :host-context(html.rj-dark-canvas) .panel { filter: invert(1) hue-rotate(180deg); }
}
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
.mark { width: 34px; height: 40px; background: url(${RJ_MARK}) center / contain no-repeat; font-size: 0; color: transparent; }
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

/* grading coming in */
.fc { margin: 0 0 18px; padding: 10px 12px 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); }
.fc h3 { margin: 0 0 4px; }
.fc .summary { font-size: 15px; margin: 0 0 8px; }
.bars { list-style: none; display: grid; grid-template-columns: repeat(14, 1fr); gap: 3px; margin: 0; padding: 0; height: 132px; }
.col { display: flex; flex-direction: column; align-items: stretch; min-width: 0; }
.col.wknd .well { background: rgba(127,127,127,.12); }
.col.mon { border-left: 2px solid var(--line); padding-left: 2px; }
.tot { font-size: 12px; font-weight: 700; text-align: center; height: 16px; line-height: 16px; }
.well { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; border-radius: 3px; }
.stack { display: flex; flex-direction: column-reverse; min-height: 0; border-radius: 3px; overflow: hidden; }
.seg { display: block; min-height: 2px; }
.dl { font-size: 11px; color: var(--muted); text-align: center; line-height: 16px; }
.col:first-child .dl { font-size: 9px; font-weight: 700; text-transform: uppercase; }
.c0 { background: #1d4ed8; } .c1 { background: #c2410c; } .c2 { background: #047857; }
.c3 { background: #7c3aed; } .c4 { background: #b91c1c; } .c5 { background: #0e7490; }
@media (prefers-color-scheme: dark) {
  .c0 { background: #60a5fa; } .c1 { background: #fb923c; } .c2 { background: #34d399; }
  .c3 { background: #a78bfa; } .c4 { background: #f87171; } .c5 { background: #22d3ee; }
}
.legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 6px 0 0; font-size: 13px; color: var(--muted); }
.legend > span { display: inline-flex; align-items: center; gap: 5px; }
.chip { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.fc .note { margin-top: 6px; }

.foot { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--line); font-size: 14px; color: var(--muted); }
.foot .spacer { flex: 1; }
.linkbtn { background: none; border: 0; padding: 4px 6px; color: var(--link); cursor: pointer; font-size: 14px; text-decoration: underline; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;

/*
  The sidebar card sits inside Canvas's own right sidebar, so it is built to
  read as one more Canvas section, like To Do and Coming Up: no box or banner,
  same type sizes, colors, heading rule and badge. Values measured on RJ's
  live Canvas (Nov 2026). Light only, as Canvas is, and links follow the
  school's Canvas theme color when it's available.
*/
export const CARD_CSS = `
:host { all: initial; display: block; margin: 0 0 18px; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.card {
  --ink: #273540; --quiet: #767676; --rule: #e8eaec; --red: #c41130;
  --link: var(--ic-link-color, #0e68b3);
  font: 14px/1.3 "Lato Extended", Lato, "Helvetica Neue", Helvetica, Arial, sans-serif;
  color: var(--ink);
}
:focus-visible { outline: 2px solid var(--link); outline-offset: 2px; border-radius: 2px; }
button { font: inherit; color: inherit; }

/* heading: same as "Coming Up  View Calendar" */
.head { display: flex; align-items: baseline; gap: 10px; padding: 0 0 6px; border-bottom: 1px solid var(--rule); }
.head h2 { margin: 0 auto 0 0; font-size: 16px; line-height: 24px; font-weight: 700; color: var(--ink); }
.open, .hide { padding: 0; background: none; border: 0; color: var(--link); font-size: 12px; line-height: 18px; cursor: pointer; }
.open:hover, .hide:hover { text-decoration: underline; }

.sec { padding: 10px 0 2px; }
.sec-head { display: flex; align-items: center; gap: 6px; width: 100%; padding: 0; background: none; border: 0; cursor: pointer; text-align: left; }
.sec-head .label { font-size: 14px; line-height: 18px; font-weight: 700; color: var(--ink); }
.sec-head:hover .label { color: var(--link); text-decoration: underline; }
.sec-head .chev { margin-left: auto; color: var(--quiet); font-size: 16px; line-height: 18px; }
/* same as Canvas's To Do count badge */
.pill { min-width: 18px; padding: 0 6px; border-radius: 9px; background: #e8eaec; color: var(--ink); font-size: 11px; line-height: 18px; text-align: center; }
.pill.red { background: var(--red); color: #fff; }

.muted, .small { margin: 3px 0 0; color: var(--quiet); font-size: 12px; line-height: 15.6px; overflow-wrap: anywhere; }
.small { display: block; }
.muted.pad { padding: 10px 0 0; margin: 0; }
.line { margin: 3px 0 0; font-size: 14px; line-height: 18.2px; }

/* assignment rows: same as a To Do row */
.list { list-style: none; margin: 0; padding: 0; }
.list li { padding: 6px 0 0; }
.list a { color: var(--link); text-decoration: none; overflow-wrap: anywhere; }
.list a:hover { text-decoration: underline; }
.more { display: block; margin: 6px 0 0; padding: 0; background: none; border: 0; color: var(--link); font-size: 12px; line-height: 15.6px; cursor: pointer; text-align: left; }
.more:hover { text-decoration: underline; }

/* the week: a tinted box for each day, so it reads at a glance */
.strip { list-style: none; display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; margin: 6px 0 0; padding: 0; }
.strip li { display: flex; flex-direction: column; align-items: center; padding: 3px 0; border-radius: 4px; background: #f3f4f5; }
.strip li.some { background: #e7eef7; }
.strip li.flag { background: #fdecef; box-shadow: inset 0 -3px 0 var(--red); }
.strip .d { color: #5b6870; font-size: 11px; line-height: 14px; }
.strip .n { font-size: 15px; font-weight: 700; line-height: 20px; color: var(--ink); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.foot { margin: 12px 0 0; color: var(--quiet); font-size: 12px; line-height: 15.6px; }
.foot a { color: var(--link); text-decoration: none; }
.foot a:hover, .setlink:hover { text-decoration: underline; }
.setlink { padding: 0; border: 0; background: none; color: var(--link); font: inherit; cursor: pointer; }
`;
