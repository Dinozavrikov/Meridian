// Единые стили ленты. Цвета правил берутся только из токенов --mf-* (FEED_TOKENS): светлая тема включается
// переопределением токенов, а не правкой каждого правила. feed-styles.test.ts следит, чтобы в FEED_RULES не было
// цветовых литералов и ссылок на несуществующие токены. Цвет типа, статуса и связи приходит из компонента как --c.
export const FEED_TOKENS = `.mf{--mf-card:#0b0d14;--mf-card-hover:#0d1018;--mf-surface:#111420;--mf-t1:#e2e0db;--mf-t2:#b4b9d2;--mf-t3:#8b92b5;--mf-t4:#7f86ab;--mf-ln1:rgba(255,255,255,.06);--mf-ln2:rgba(255,255,255,.1);--mf-ln3:rgba(255,255,255,.17);--mf-hover:rgba(255,255,255,.06);--mf-accent:#4A90D9;--mf-ok:#27AE60;--mf-bad:#E74C3C;--mf-neu:#8892A6;--mf-warn:#F5A623;--mf-teal:#4dcfa6;--mf-on-accent:#0b0d14;--mf-shadow:rgba(0,0,0,.35);--mf-skel-a:rgba(255,255,255,.04);--mf-skel-b:rgba(255,255,255,.09);--mf-mono:'JetBrains Mono','Fira Code',monospace}\n`

// Узкие экраны и одноколоночная лента (вкладка лаборатории): панель фильтров становится строками чипов над лентой.
const compact = (root: string) => [
  `${root} .mf-box{background:transparent;border:0;padding:0}`,
  `${root} .mf-h,${root} .mf-hint{display:none}`,
  `${root} .mf-facets,${root} .mf-topics{flex-direction:row;flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px}`,
  `${root} .mf-facet{width:auto;flex:none;border:1px solid var(--mf-ln2);border-radius:999px;padding:6px 12px}`,
  `${root} .mf-tag{flex:none}`,
].join("\n")

const LAYOUT = `
.mf{color:var(--mf-t2)}
.mf a:focus-visible,.mf button:focus-visible{outline:2px solid var(--mf-accent);outline-offset:2px;border-radius:6px}
.mf-pagehead{margin:0 0 22px}
.mf-pagehead h1{margin:0 0 6px;font-size:26px;font-weight:700;letter-spacing:-.02em;color:var(--mf-t1)}
.mf-pagehead p{margin:0;max-width:640px;font-size:14px;line-height:1.6;color:var(--mf-t3)}
.mf-stat{margin-top:10px;font-family:var(--mf-mono);font-size:12px;color:var(--mf-t4)}
.mf-layout{display:grid;grid-template-columns:minmax(0,720px) 300px;column-gap:28px;justify-content:center;align-items:start}
.mf-main{grid-column:1;grid-row:1;min-width:0}
.mf-rail{grid-column:2;grid-row:1;position:sticky;top:68px;display:flex;flex-direction:column;gap:14px;min-width:0;max-height:calc(100vh - 84px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
.mf-single{grid-template-columns:minmax(0,720px)}
.mf-single .mf-main{grid-column:1;grid-row:2}
.mf-single .mf-rail{grid-column:1;grid-row:1;position:static;max-height:none;overflow:visible;gap:8px;margin-bottom:12px}
.mf-extras{display:flex;flex-direction:column;gap:14px}
.mf-box{background:var(--mf-card);border:1px solid var(--mf-ln2);border-radius:14px;padding:16px}
.mf-h{margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mf-t4)}
.mf-hint{margin:10px 8px 0;font-size:11.5px;line-height:1.5;color:var(--mf-t4)}
.mf-facets{display:flex;flex-direction:column;gap:2px}
.mf-facet{display:flex;align-items:center;gap:9px;width:100%;padding:7px 8px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--mf-t3);font-size:13px;text-align:left;cursor:pointer;transition:background .12s,color .12s}
.mf-facet:hover{background:var(--mf-hover);color:var(--mf-t1)}
.mf-facet[aria-pressed="true"]{background:color-mix(in srgb,var(--c,var(--mf-t1)) 14%,transparent);color:var(--mf-t1)}
.mf-facet .n{margin-left:auto;font-family:var(--mf-mono);font-size:11.5px;color:var(--mf-t4)}
.mf-dot{display:inline-block;flex:none;width:8px;height:8px;border-radius:50%;background:var(--c,var(--mf-t1))}
.mf-topics{display:flex;flex-wrap:wrap;gap:6px}
.mf-tag{padding:3px 10px;border:1px solid var(--mf-ln2);border-radius:999px;background:transparent;color:var(--mf-t3);font-size:12px;cursor:pointer;transition:color .12s,border-color .12s,background .12s}
.mf-tag:hover{color:var(--mf-t1);border-color:var(--mf-ln3)}
.mf-tag[aria-pressed="true"]{color:var(--mf-t1);border-color:var(--mf-accent);background:color-mix(in srgb,var(--mf-accent) 14%,transparent)}
.mf-tag .n{margin-left:4px;font-family:var(--mf-mono);font-size:10.5px;color:var(--mf-t4)}
.mf-teaser{display:flex;align-items:center;gap:14px;color:inherit;text-decoration:none;transition:border-color .15s}
.mf-teaser:hover{border-color:var(--mf-ln3)}
.mf-teaser-t{font-size:13.5px;font-weight:600;color:var(--mf-t1)}
.mf-teaser-s{margin:2px 0 6px;font-family:var(--mf-mono);font-size:11.5px;color:var(--mf-t3)}
.mf-teaser-go{font-size:12px;color:var(--mf-accent)}
.mf-line{display:flex;align-items:center;gap:8px;padding:7px 0;color:var(--mf-t2);font-size:12.5px;text-decoration:none}
.mf-line+.mf-line{border-top:1px solid var(--mf-ln1)}
.mf-line:hover .mf-line-t{color:var(--mf-t1);text-decoration:underline}
.mf-line-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mf-line b{flex:none;font-size:11.5px;font-weight:600;color:var(--c,var(--mf-t3))}
.mf-banner{position:sticky;top:64px;z-index:30;display:flex;justify-content:center;margin-bottom:12px}
.mf-banner button{display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border:0;border-radius:999px;background:var(--mf-teal);color:var(--mf-on-accent);font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:0 6px 18px var(--mf-shadow)}
.mf-state{padding:72px 0;text-align:center;color:var(--mf-t3);font-size:13px}
.mf-state p{margin:0 0 6px}
.mf-state .sub{font-size:11px;color:var(--mf-t4)}
.mf-end{margin-top:10px;padding-top:22px;border-top:1px solid var(--mf-ln1);text-align:center;font-family:var(--mf-mono);font-size:11px;color:var(--mf-t4)}
@keyframes mf-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
.mf-skel{height:210px;margin-bottom:16px;border:1px solid var(--mf-ln1);border-radius:16px;background:linear-gradient(90deg,var(--mf-skel-a),var(--mf-skel-b),var(--mf-skel-a));background-size:200% 100%;animation:mf-shimmer 1.6s linear infinite}
`

const CARD = `
.mf-card{margin-bottom:16px;padding:22px 24px;border:1px solid var(--mf-ln2);border-radius:16px;background:var(--mf-card);transition:border-color .15s,background .15s}
.mf-card:hover{border-color:var(--mf-ln3);background:var(--mf-card-hover)}
.mf-head-row{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.mf-av{display:inline-flex;flex:none;text-decoration:none}
.mf-who{display:flex;flex:1;flex-direction:column;gap:1px;min-width:0}
.mf-author{overflow:hidden;font-size:15px;font-weight:600;line-height:1.3;color:var(--mf-t1);text-decoration:none;text-overflow:ellipsis;white-space:nowrap}
.mf-author:hover{text-decoration:underline}
.mf-time{font-family:var(--mf-mono);font-size:12px;color:var(--mf-t4)}
.mf-tools{display:flex;flex:none;align-items:center;gap:2px}
.mf-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:var(--mf-t4);cursor:pointer}
.mf-icon-btn:hover:not(:disabled){background:var(--mf-hover);color:var(--mf-t1)}
.mf-icon-btn:disabled{opacity:.5;cursor:default}
.mf-meta{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;margin-bottom:10px;font-size:12px}
.mf-type{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--c)}
.mf-pill{padding:3px 10px;border:1px solid color-mix(in srgb,var(--c) 30%,transparent);border-radius:999px;background:color-mix(in srgb,var(--c) 14%,transparent);color:var(--c);font-size:12px;font-weight:600;white-space:nowrap}
.mf-new{padding:2px 9px;border:1px solid color-mix(in srgb,var(--mf-teal) 35%,transparent);border-radius:999px;background:color-mix(in srgb,var(--mf-teal) 12%,transparent);color:var(--mf-teal);font-size:11px;font-weight:700}
.mf-title{margin:0 0 8px;font-size:20px;font-weight:600;line-height:1.3;letter-spacing:-.01em;color:var(--mf-t1);overflow-wrap:anywhere}
.mf-title a{color:inherit;text-decoration:none}
.mf-title a:hover{text-decoration:underline}
.mf-lead{display:-webkit-box;margin:0 0 16px;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:3;font-size:14.5px;line-height:1.65;color:var(--mf-t2)}
.mf-stage{margin:0 0 14px}
.mf-ev{display:grid;grid-template-columns:minmax(0,1fr) 132px;gap:22px;margin-top:4px;padding:16px 0;border-top:1px solid var(--mf-ln1);border-bottom:1px solid var(--mf-ln1)}
.mf-bal{display:flex;gap:2px;height:8px;margin-bottom:9px}
.mf-bal i{display:block;min-width:6px;border-radius:3px}
.mf-seg-ok{background:var(--mf-ok)}
.mf-seg-bad{background:var(--mf-bad)}
.mf-seg-neu{background:var(--mf-neu)}
.mf-legend{display:flex;flex-wrap:wrap;gap:4px 14px;margin-bottom:12px;font-size:12px;color:var(--mf-t3)}
.mf-legend b{font-family:var(--mf-mono);font-weight:500;color:var(--mf-t1)}
.mf-row{display:flex;align-items:center;gap:10px;min-width:0;padding:8px 0;color:var(--mf-t1);font-size:13.5px;text-decoration:none}
.mf-row+.mf-row{border-top:1px solid var(--mf-ln1)}
.mf-row:hover .mf-row-t{text-decoration:underline}
.mf-row-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mf-mark{display:grid;flex:none;place-items:center;width:20px;height:20px;border-radius:6px;background:color-mix(in srgb,var(--c) 16%,transparent);color:var(--c)}
.mf-chip{flex:none;padding:2px 8px;border-radius:999px;background:var(--mf-hover);color:var(--c,var(--mf-t3));font-size:11px}
.mf-count{display:inline-flex;align-items:center;gap:3px;flex:none;font-family:var(--mf-mono);font-size:11px;color:var(--mf-t4)}
.mf-graph{align-self:center;color:var(--mf-t3)}.mf-graph-open{display:block;padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer}.mf-graph-cta{display:none}
.mf-link{display:inline-flex;align-items:center;gap:4px;padding:4px 0;border:0;background:none;color:var(--mf-accent);font-size:12.5px;cursor:pointer;text-decoration:none}
.mf-link:hover{text-decoration:underline}
.mf-muted{margin:0;font-size:12.5px;color:var(--mf-t4)}
.mf-notes{display:flex;flex-direction:column;gap:6px;margin-top:12px;padding:12px 14px;border:1px solid var(--mf-ln1);border-radius:10px}
.mf-notes-h{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mf-t3)}
.mf-note{font-size:12.5px;line-height:1.5;color:var(--mf-t2)}
.mf-note-q{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2}.mf-lead p,.mf-note-q p{margin:0}.mf-note-q>p:first-of-type{display:inline}
.mf-block{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:10px;font-size:12px;color:var(--mf-t3)}
.mf-ref{display:inline-flex;align-items:center;gap:5px;max-width:220px;padding:2px 9px;border:1px solid var(--mf-ln2);border-radius:999px;color:var(--mf-t2);text-decoration:none}
.mf-ref:hover{border-color:var(--mf-ln3);color:var(--mf-t1)}
.mf-ref span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mf-foot{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding-top:14px;font-size:13px;color:var(--mf-t3)}
.mf-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;font-size:13px;text-decoration:none;cursor:pointer;transition:background .12s,color .12s}
.mf-btn:hover:not(:disabled){background:var(--mf-hover);color:var(--mf-t1)}
.mf-btn:disabled{opacity:.5;cursor:default}
.mf-foot-r{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;margin-left:auto}
.mf-next{font-size:12.5px}
.mf-next b{font-family:var(--mf-mono);font-weight:500;color:var(--mf-t1)}
.mf-next[data-state="overdue"]{color:var(--mf-warn)}
.mf-updated{font-family:var(--mf-mono);font-size:11px;color:var(--mf-t4)}
.mf-pop{position:absolute;bottom:calc(100% + 8px);left:0;z-index:50;width:220px;padding:12px 14px;border:1px solid var(--mf-ln2);border-radius:10px;background:var(--mf-surface);box-shadow:0 8px 24px var(--mf-shadow)}
.mf-pop p{margin:6px 0 10px;font-size:12px;line-height:1.6;color:var(--mf-t3)}
.mf-cta{display:block;padding:6px 0;border-radius:7px;background:var(--mf-ok);color:var(--mf-on-accent);font-size:12px;font-weight:600;text-align:center;text-decoration:none}
`

const NARROW = `
@media (max-width:1023px){
.mf-layout{grid-template-columns:minmax(0,1fr)}
.mf-main{grid-column:1;grid-row:2}
.mf-rail{grid-column:1;grid-row:1;position:static;max-height:none;overflow:visible;gap:8px;margin-bottom:12px}
.mf-extras{display:none}
${compact(".mf-layout")}
}
@media (max-width:639px){
.mf-pagehead h1{font-size:22px}
.mf-card{padding:16px;border-radius:14px}
.mf-title{font-size:17px}
.mf-ev{grid-template-columns:minmax(0,1fr)}
.mf-graph-open{display:flex;align-items:center;gap:12px;width:100%;min-height:52px;padding:6px 14px 6px 10px;border:1px solid var(--mf-ln1);border-radius:14px;-webkit-tap-highlight-color:transparent;transition:border-color .15s,transform .1s}.mf-graph-open:active{transform:scale(.985);border-color:var(--mf-t3)}.mf-graph-open:focus-visible{outline:2px solid var(--mf-t2);outline-offset:2px}.mf-graph{width:44px;height:44px;flex:none}.mf-graph-cta{display:flex;flex:1;align-items:center;gap:8px;min-width:0;font-size:13.5px;font-weight:600;color:var(--mf-t1)}.mf-graph-cta-t{flex:1;text-align:left}.mf-graph-cta-n{min-width:22px;padding:2px 7px;border-radius:999px;border:1px solid var(--mf-ln1);font-size:11.5px;font-weight:600;text-align:center;color:var(--mf-t3)}
.mf-lbl{display:none}
.mf-foot-r{width:100%;margin-left:0}
}
@media (prefers-reduced-motion:reduce){.mf-skel{animation:none}.mf-card,.mf-tag,.mf-facet,.mf-btn{transition:none}}
`

export const FEED_RULES = LAYOUT + compact(".mf-single") + CARD + NARROW
export const FEED_CSS = FEED_TOKENS + FEED_RULES

export function FeedStyles() {
  return <style>{FEED_CSS}</style>
}
