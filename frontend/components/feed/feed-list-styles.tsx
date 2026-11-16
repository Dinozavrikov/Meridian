// Стили режима «Список». Цвета только из токенов --mf-* (FEED_TOKENS), локальная переменная одна — --c
// (цвет типа на строке, цвет статуса на вердикте и плашке). Раскладка зависит от ширины самой ленты (container query):
// вкладка лаборатории уже страницы ленты. Иконка вердикта подмешивает светлый токен: часть цветов statusColor
// (тёмно-серые) на тёмной карточке сама по себе нечитаема.
export const LIST_RULES = `
.mfl-toolbar{display:flex;justify-content:flex-end;margin-bottom:12px}
.mfl-toggle{display:inline-flex;padding:2px;border:1px solid var(--mf-ln2);border-radius:999px;background:var(--mf-card)}
.mfl-toggle button{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border:0;border-radius:999px;background:transparent;color:var(--mf-t3);font-size:12.5px;cursor:pointer;transition:background .12s,color .12s}
.mfl-toggle button:hover{color:var(--mf-t1)}
.mfl-toggle button[aria-pressed="true"]{background:var(--mf-hover);color:var(--mf-t1)}
.mfl{container-type:inline-size;overflow:hidden;border:1px solid var(--mf-ln2);border-radius:14px;background:var(--mf-card)}
.mfl-ul{margin:0;padding:0;list-style:none}
.mfl-row{display:grid;grid-template-columns:104px minmax(0,1fr) auto;column-gap:20px;align-items:center;padding:16px 22px 16px 14px;border-top:1px solid var(--mf-ln1);color:var(--mf-t2);text-decoration:none;transition:background .12s}
.mfl-ul>li:first-child .mfl-row{border-top:0}
.mfl-row:hover{background:var(--mf-card-hover)}
.mf .mfl-row:focus-visible{outline:2px solid var(--mf-accent);outline-offset:-2px}
.mfl-verdict{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;text-align:center}
.mfl-score{display:inline-flex;align-items:baseline;gap:6px;font-family:var(--mf-mono);font-size:24px;font-weight:500;line-height:1}
.mfl-score-ok{color:var(--mf-ok)}
.mfl-score-bad{color:var(--mf-bad)}
.mfl-score-neu{color:var(--mf-neu)}
.mfl-score-sep{color:var(--mf-t4)}
.mfl-bar{display:flex;gap:2px;width:64px;height:4px;overflow:hidden;border-radius:2px}
.mfl-seg{flex-basis:0;min-width:3px}
.mfl-seg-ok{background:var(--mf-ok)}
.mfl-seg-bad{background:var(--mf-bad)}
.mfl-seg-neu{background:var(--mf-neu)}
.mfl-cap{font-size:11.5px;line-height:1.3;color:var(--mf-t3);white-space:normal;overflow-wrap:anywhere}
.mfl-ic{display:inline-flex;color:color-mix(in srgb,var(--c,var(--mf-t3)) 70%,var(--mf-t1))}
.mfl-dash{font-family:var(--mf-mono);font-size:24px;line-height:1;color:var(--mf-t4)}
.mfl-main{display:flex;flex-direction:column;gap:7px;min-width:0}
.mfl-by{display:flex;align-items:center;gap:8px;min-width:0}
.mfl-name{max-width:220px;overflow:hidden;font-size:14px;font-weight:600;color:var(--mf-t1);text-overflow:ellipsis;white-space:nowrap}
.mfl-sep{color:var(--mf-t4)}
.mfl-time{font-family:var(--mf-mono);font-size:11.5px;color:var(--mf-t4);white-space:nowrap}
.mfl-text{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;font-size:15.5px;font-weight:500;line-height:1.4;color:var(--mf-t1);overflow-wrap:anywhere}
.mfl-meta{display:flex;align-items:center;flex-wrap:wrap;gap:4px 12px;min-width:0;font-size:12px;color:var(--mf-t4)}
.mfl-typelbl{display:inline-flex;align-items:center;gap:6px;color:var(--c,var(--mf-t3));font-weight:600}
.mfl-st{display:inline-flex;align-items:center;gap:6px;color:var(--mf-t2)}
.mfl-dot{width:6px;height:6px;border-radius:50%;background:var(--c,var(--mf-t1))}
.mfl-new{padding:1px 7px;border:1px solid color-mix(in srgb,var(--mf-teal) 35%,transparent);border-radius:999px;background:color-mix(in srgb,var(--mf-teal) 12%,transparent);color:var(--mf-teal);font-size:10.5px;font-weight:700}
.mfl-cnt{display:inline-flex;align-items:center;gap:4px;font-family:var(--mf-mono);font-size:12px;color:var(--mf-t3)}
.mfl-cnt[data-zero="true"]{color:var(--mf-t4)}
.mfl-cnt-c{justify-self:end;font-size:13px}
@container (max-width:560px){
.mfl-row{grid-template-columns:76px minmax(0,1fr);column-gap:14px;row-gap:8px;padding:14px 16px 14px 10px}
.mfl-cnt-c{grid-column:2;justify-self:start}
.mfl-score,.mfl-dash{font-size:20px}
}
@media (prefers-reduced-motion:reduce){.mfl-row,.mfl-toggle button{transition:none}}
`

export function FeedListStyles() {
  return <style>{LIST_RULES}</style>
}
