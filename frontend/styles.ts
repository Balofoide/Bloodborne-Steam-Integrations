const STYLE_ID = "bbpc-style"

// Visual language copied from Steam's desktop library (Motiva Sans, #dcdedf
// text, dark gradient panels, blue progress) so the injected sections read as
// native ones.
const CSS = `
html[data-bbpc-active] [data-bbpc-notice] { display: none !important; }

.bbpc-section { margin: 0 0 28px; color: #dcdedf; font-family: "Motiva Sans", Arial, sans-serif; }
.bbpc-section__header {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  font-size: 14px; font-weight: 500; letter-spacing: .12em; text-transform: uppercase;
  color: #dcdedf; margin: 0 0 10px; opacity: .92;
}
.bbpc-section__header small { font-size: 12px; letter-spacing: 0; text-transform: none; color: #8b929a; font-weight: 400; }
.bbpc-panel {
  position: relative; border-radius: 3px; padding: 16px 18px;
  background: linear-gradient(to bottom, rgba(47, 53, 63, .92) 0%, rgba(36, 41, 49, .92) 100%);
  box-shadow: 0 0 0 1px rgba(255,255,255,.035) inset, 0 4px 14px rgba(0,0,0,.25);
}

/* progress */
.bbpc-progress__label { font-size: 13px; color: #b8bcbf; margin-bottom: 8px; }
.bbpc-progress__label b { color: #fff; font-weight: 500; }
.bbpc-bar { height: 6px; border-radius: 3px; background: rgba(0,0,0,.45); overflow: hidden; }
.bbpc-bar > div { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #1a9fff 0%, #5bc0ff 100%); transition: width .4s ease; }

/* icon grids */
.bbpc-icons { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 6px; margin-top: 14px; }
.bbpc-icons__sub { font-size: 13px; color: #8b929a; margin: 16px 0 8px; }
.bbpc-icon {
  position: relative; aspect-ratio: 1; border-radius: 3px; overflow: hidden; flex: none;
  background: #1b1f25; box-shadow: 0 0 0 1px rgba(255,255,255,.06) inset; cursor: pointer;
  transition: box-shadow .12s ease;
}
.bbpc-icon:hover { box-shadow: 0 0 0 1px rgba(255,255,255,.4) inset, 0 6px 14px rgba(0,0,0,.4); }
.bbpc-icon img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bbpc-icon--locked img { filter: grayscale(1) brightness(.45); }
.bbpc-icon--hidden { display: grid; place-items: center; color: #5d6670; font-size: 22px; font-weight: 700; }
.bbpc-icon--more {
  display: grid; place-items: center; font-size: 15px; color: #dcdedf; font-weight: 500;
  background: rgba(255,255,255,.07);
}
.bbpc-tier { position: absolute; right: 3px; bottom: 3px; width: 9px; height: 9px; border-radius: 50%;
  box-shadow: 0 0 0 1.5px rgba(0,0,0,.75); }
.bbpc-tier--P { background: #c9d7ef; } .bbpc-tier--G { background: #e7b64a; }
.bbpc-tier--S { background: #c4cbd2; } .bbpc-tier--B { background: #c4814b; }

.bbpc-button {
  display: block; width: 100%; margin-top: 16px; padding: 9px 0; border: 0; border-radius: 2px; cursor: pointer;
  font: inherit; font-size: 13px; color: #dcdedf; background: rgba(255,255,255,.08);
  transition: background .12s ease, color .12s ease;
}
.bbpc-button:hover { background: #dcdedf; color: #1b1f25; }

/* tooltip */
.bbpc-tip {
  position: fixed; z-index: 99999; max-width: 300px; pointer-events: none; padding: 10px 12px; border-radius: 3px;
  background: #3d4450; color: #dcdedf; box-shadow: 0 8px 24px rgba(0,0,0,.55); font-size: 12px; line-height: 1.4;
  font-family: "Motiva Sans", Arial, sans-serif;
}
.bbpc-tip b { display: block; font-size: 14px; font-weight: 500; color: #fff; margin-bottom: 3px; }
.bbpc-tip i { display: block; margin-top: 6px; font-style: normal; color: #8b929a; }

/* activity feed */
.bbpc-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; padding: 12px 16px;
  border-radius: 3px; font-size: 14px; color: #fff;
  background: linear-gradient(90deg, rgba(26,159,255,.32), rgba(26,159,255,.08));
  box-shadow: 0 0 0 1px rgba(26,159,255,.45) inset;
}
.bbpc-banner--ok { background: rgba(255,255,255,.04); box-shadow: 0 0 0 1px rgba(255,255,255,.06) inset; color: #b8bcbf; }
.bbpc-banner span { color: #b8d8f5; font-size: 12px; }
.bbpc-banner--ok span { color: #8b929a; }
.bbpc-day { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #8b929a; margin: 18px 0 8px; }
.bbpc-day:first-child { margin-top: 0; }
.bbpc-card { padding: 0; overflow: hidden; margin-bottom: 8px; cursor: pointer; transition: background .15s ease; }
.bbpc-card:hover { background: linear-gradient(to bottom, rgba(58, 65, 77, .95), rgba(44, 50, 60, .95)); }
.bbpc-card__body { padding: 14px 18px 16px; }
.bbpc-card__kind { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #1a9fff; margin-bottom: 6px; }
.bbpc-card__kind--beta { color: #e7b64a; }
.bbpc-card__title { font-size: 18px; color: #fff; margin-bottom: 6px; }
.bbpc-card__text { font-size: 13px; line-height: 1.5; color: #a7adb3; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.bbpc-card__more { margin-top: 8px; font-size: 12px; color: #8b929a; }
.bbpc-unlock { display: flex; align-items: center; gap: 14px; padding: 10px 14px; margin-bottom: 8px; cursor: pointer; }
.bbpc-unlock .bbpc-icon { width: 46px; cursor: inherit; }
.bbpc-unlock__kind { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #8b929a; }
.bbpc-unlock__name { font-size: 15px; color: #fff; margin: 2px 0; }
.bbpc-unlock__detail { font-size: 12px; color: #8b929a; }
.bbpc-link { display: inline-block; margin-top: 4px; font-size: 13px; color: #8b929a; cursor: pointer; }
.bbpc-link:hover { color: #fff; }
.bbpc-empty { font-size: 13px; color: #8b929a; }

/* play bar stat */
.bbpc-stat { cursor: pointer; }
.bbpc-stat__bar { width: 92px; height: 4px; margin-top: 4px; border-radius: 2px; background: rgba(255,255,255,.12); overflow: hidden; }
.bbpc-stat__bar > div { height: 100%; background: linear-gradient(90deg, #1a9fff, #5bc0ff); }

/* modal */
.bbpc-modal { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; background: rgba(0,0,0,.7);
  font-family: "Motiva Sans", Arial, sans-serif; color: #dcdedf; animation: bbpc-fade .15s ease; }
@keyframes bbpc-fade { from { opacity: 0 } to { opacity: 1 } }
.bbpc-modal__dialog { width: min(920px, 92vw); max-height: 86vh; display: flex; flex-direction: column; border-radius: 4px; overflow: hidden;
  background: linear-gradient(to bottom, #2f3540, #1e2228); box-shadow: 0 18px 60px rgba(0,0,0,.7); }
.bbpc-modal__head { padding: 22px 26px 18px; border-bottom: 1px solid rgba(255,255,255,.06); }
.bbpc-modal__title { display: flex; justify-content: space-between; align-items: center; font-size: 22px; color: #fff; margin-bottom: 12px; }
.bbpc-modal__close { border: 0; background: transparent; color: #8b929a; font-size: 26px; cursor: pointer; line-height: 1; }
.bbpc-modal__close:hover { color: #fff; }
.bbpc-modal__tools { display: flex; gap: 8px; margin-top: 14px; align-items: center; flex-wrap: wrap; }
.bbpc-chip { border: 0; border-radius: 2px; padding: 6px 12px; font: inherit; font-size: 12px; cursor: pointer;
  color: #b8bcbf; background: rgba(255,255,255,.06); }
.bbpc-chip--on { background: #1a9fff; color: #fff; }
.bbpc-chip--toggle { margin-left: auto; }
.bbpc-modal__list { overflow-y: auto; padding: 10px 18px 22px; }
.bbpc-group { font-size: 12px; text-transform: uppercase; letter-spacing: .1em; color: #8b929a; margin: 18px 8px 8px; }
.bbpc-row { display: flex; align-items: center; gap: 16px; padding: 10px 12px; border-radius: 3px; margin-bottom: 4px;
  background: rgba(255,255,255,.035); }
.bbpc-row:hover { background: rgba(255,255,255,.07); }
.bbpc-row .bbpc-icon { width: 64px; cursor: default; }
.bbpc-row__main { flex: 1; min-width: 0; }
.bbpc-row__name { font-size: 15px; color: #fff; }
.bbpc-row--locked .bbpc-row__name { color: #b8bcbf; }
.bbpc-row__detail { font-size: 13px; color: #8b929a; margin-top: 3px; white-space: pre-line; }
.bbpc-row__side { text-align: right; font-size: 12px; color: #8b929a; white-space: nowrap; }
.bbpc-row__tier { display: flex; justify-content: flex-end; align-items: center; gap: 6px; margin-top: 4px; }
.bbpc-row__tier .bbpc-tier { position: static; }
`

export function ensureStyles(doc: Document) {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement("style")
  style.id = STYLE_ID
  style.textContent = CSS
  ;(doc.head || doc.documentElement).appendChild(style)
}
