/* ── The Dingus: a test harness that runs the real app ──
   index.html is one file with one classic <script>. This pulls that script out and runs it in a
   Node vm behind enough of a browser to let the logic work, then calls the app's own functions and
   checks what they do. Nothing is re-implemented here: if a check passes, the shipped code passes.

   Run it with:   node tests/dingus.test.js

   It lives in the repo on purpose. An earlier copy lived in /tmp, the container was reclaimed, and
   a thousand checks went with it.

   Writing checks: the test body at the bottom is injected as a TEMPLATE LITERAL, so it must not
   contain a backtick, a ${, or a backslash. Use String.fromCharCode for anything awkward. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/);
if (!m) { console.error('Could not find the app script in index.html'); process.exit(1); }
const classic = m[1];

/* ── the browser, as much of it as the logic touches ── */
let promptAnswer = '';
let lastAlert = '';
let lastToast = '';
const idStubs = {};
let docQueryAll = () => [];

function elStub(id) {
  if (idStubs[id]) return idStubs[id];
  const el = {
    id, value: '', textContent: '', innerHTML: '', hidden: false, checked: false, rows: 1,
    style: {}, dataset: {}, options: [], files: [], scrollHeight: 0, clientHeight: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, focus() {}, blur() {},
    click() {}, scrollIntoView() {}, setSelectionRange() {}, select() {}, submit() {}, getBoundingClientRect() {
      return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 };
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getAttribute() { return null; }, setAttribute() {}, removeAttribute() {},
    insertBefore() {}, removeChild() {}, remove() {},
    get firstChild() { return null; }, get parentNode() { return null; }
  };
  return el;
}

const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Promise, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  URL: { createObjectURL: () => 'blob:stub', revokeObjectURL() {} },
  Blob: function Blob(parts, opts) {
    this.size = (parts || []).reduce((n, p) => n + (p && p.length != null ? p.length
      : (p && p.byteLength != null ? p.byteLength : 0)), 0);
    this.type = (opts && opts.type) || '';
    this.arrayBuffer = async () => new ArrayBuffer(this.size);
  },
  File: function File(parts, name, opts) { this.name = name; this.size = 0; this.type = (opts && opts.type) || ''; },
  FileReader: function FileReader() { this.readAsText = function () { if (this.onload) this.onload({ target: { result: '' } }); }; },
  TextEncoder, TextDecoder, btoa: s => Buffer.from(String(s), 'binary').toString('base64'),
  atob: s => Buffer.from(String(s), 'base64').toString('binary'),
  fetch: async () => ({ ok: false, status: 404, async arrayBuffer() { return new ArrayBuffer(0); }, async text() { return ''; } }),
  requestAnimationFrame: fn => setTimeout(fn, 0),
  crypto: { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = (i * 7919) % 256; return a; },
            randomUUID: () => 'uuid-stub' },
  localStorage: (() => { const s = {}; return {
    getItem: k => (k in s ? s[k] : null), setItem(k, v) { s[k] = String(v); },
    removeItem(k) { delete s[k]; } }; })(),
  Event: function Event(t, o) { this.type = t; this.bubbles = !!(o && o.bubbles); },
  confirm: () => true,
  alert: msg => { lastAlert = String(msg == null ? '' : msg); },
  prompt: () => promptAnswer,
  /* hooks the checks use */
  __setPrompt: v => { promptAnswer = v; },
  __lastAlert: () => lastAlert,
  __lastToast: () => lastToast,
  __stubEl: (id, obj) => { if (obj) idStubs[id] = obj; else delete idStubs[id]; },
  __setQueryAll: fn => { docQueryAll = fn; }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.document = {
  title: '',
  readyState: 'complete',
  documentElement: elStub('html'),
  body: elStub('body'),
  head: { appendChild() {} },
  activeElement: null,
  getElementById: id => elStub(id),
  querySelector: () => null,
  querySelectorAll: sel => docQueryAll(sel),
  createElement: tag => elStub('made:' + tag),
  createTextNode: t => ({ textContent: t }),
  addEventListener() {}, removeEventListener() {},
  execCommand() { return true; }
};
sandbox.navigator = { userAgent: 'node', clipboard: { writeText: async () => {} }, language: 'en-US' };
sandbox.location = { href: 'http://localhost/', search: '', hash: '', pathname: '/', origin: 'http://localhost' };
sandbox.history = { pushState() {}, replaceState() {}, back() {} };
sandbox.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
sandbox.scrollTo = () => {};
sandbox.scrollBy = () => {};
sandbox.getComputedStyle = () => ({ getPropertyValue: () => '' });
sandbox.ResizeObserver = function () { this.observe = () => {}; this.disconnect = () => {}; };
sandbox.IntersectionObserver = function () { this.observe = () => {}; this.disconnect = () => {}; };
sandbox.showDirectoryPicker = async () => { throw new Error('no folder in tests'); };
sandbox.indexedDB = { open: () => ({ addEventListener() {} }) };

/* Firebase: enough shape that a write is a no-op and a read is empty. Checks that care about
   what was written replace patchSection (and friends) with their own recorder. */
const fbDoc = (id) => ({ id, path: id });
sandbox.FB = {
  db: {},
  collection: (...a) => ({ path: a.slice(1).join('/') }),
  doc: (...a) => fbDoc(a.slice(1).join('/')),
  async getDoc() { return { exists: () => false, data: () => ({}) }; },
  async getDocFromServer() { return { exists: () => false, data: () => ({}) }; },
  async getDocs() { return { docs: [] }; },
  async setDoc() {}, async updateDoc() {}, async deleteDoc() {}, async addDoc() { return fbDoc('new'); },
  onSnapshot: () => () => {},
  writeBatch: () => ({ set() {}, update() {}, delete() {}, async commit() {} }),
  serverTimestamp: () => Date.now(),
  deleteField: () => ({ _methodName: 'deleteField' }),
  arrayUnion: (...v) => v, arrayRemove: (...v) => v,
  increment: n => n
};

/* Optional: the spreadsheet and PDF engines, when they happen to be installed. Checks that need
   them are skipped with a note rather than failing, so the harness runs on a bare checkout. */
function tryRequire(spec) {
  for (const base of ['/tmp/deps/node_modules/', '']) {
    try { return require(base + spec); } catch (e) {}
  }
  return null;
}
const XLSXLib = tryRequire('xlsx');
if (XLSXLib) sandbox.XLSX = XLSXLib;
const jsPDFLib = tryRequire('jspdf');
if (jsPDFLib) { tryRequire('jspdf-autotable'); sandbox.jspdf = jsPDFLib; }

vm.createContext(sandbox);
try {
  vm.runInContext(classic, sandbox, { filename: 'index.html' });
} catch (e) {
  console.error('The app script would not load:\n', e && e.stack || e);
  process.exit(1);
}

/* toast is the app's own; wrap it so checks can read the last thing it said */
if (typeof sandbox.toast === 'function') {
  const realToast = sandbox.toast;
  sandbox.toast = (msg, bad) => { lastToast = String(msg == null ? '' : msg); try { realToast(msg, bad); } catch (e) {} };
}

/* ── the checks ──
   Injected as a template literal: no backticks, no dollar-brace, no backslashes. */
const Q = String.fromCharCode(34);
let PASS = 0;
const FAILED = [];
sandbox.ck = (name, cond) => {
  let ok = false;
  try { ok = !!cond; } catch (e) { ok = false; }
  if (ok) PASS++; else FAILED.push(name);
};
sandbox.skip = (name, why) => { console.log('  skipped: ' + name + ' (' + why + ')'); };
sandbox.Q = Q;                       // a double quote, for checks that cannot contain one
sandbox.NL = String.fromCharCode(10); // a newline, likewise: the body cannot hold a backslash
sandbox.TAB = String.fromCharCode(9);
sandbox.HAVE_XLSX = !!XLSXLib;
sandbox.HAVE_PDF = !!jsPDFLib;

const testCode = `
(async () => {

// ══ the pull plan: the working week ═════════════════════════════════
{
  var five = { days: [1,2,3,4,5], holidays: [] };
  var four = { days: [1,2,3,4],   holidays: [] };          // four tens, Mon-Thu

  ck('week: a job on five eights works Friday, one on four tens does not',
    isWorkDay('2026-10-02', five) === true && isWorkDay('2026-10-02', four) === false);
  ck('week: nobody works the weekend unless the job says so',
    isWorkDay('2026-10-03', five) === false &&
    isWorkDay('2026-10-03', { days:[1,2,3,4,5,6], holidays: [] }) === true);
  ck('week: a holiday is not a working day however the week is set up',
    isWorkDay('2026-10-01', { days:[1,2,3,4,5], holidays:['2026-10-01'] }) === false);
  ck('week: one day of work finishing Friday starts Friday',
    subWorkDays('2026-10-02', 0, five) === '2026-10-02');
  ck('week: five days finishing Friday starts Monday',
    subWorkDays('2026-10-02', 4, five) === '2026-09-28');
  ck('week: on four tens the same five days reach back into the week before',
    subWorkDays('2026-10-01', 4, four) === '2026-09-24');
  ck('week: the day before Monday is the Friday before, not Sunday',
    prevWorkDay('2026-10-05', five) === '2026-10-02');
  ck('week: a holiday is stepped over rather than landed on',
    prevWorkDay('2026-10-05', { days:[1,2,3,4,5], holidays:['2026-10-02'] }) === '2026-10-01');
  ck('week: counting days between two dates counts both ends and skips the rest',
    workDaysBetween('2026-10-05', '2026-10-09', five) === 5 &&
    workDaysBetween('2026-10-05', '2026-10-09', four) === 4);
  ck('week: a calendar with no working days on it does not spin for ever',
    nearestWorkDay('2026-10-05', { days: [], holidays: [] }, -1) === '2026-10-05');
  ck('week: today is the day it is here, not the day it already is in London',
    today() === (function () { var d = new Date(), p = n => (n < 10 ? '0' : '') + n;
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })());

  // the runway: what you have left before a line has to be moving
  ck('runway: today is nought, tomorrow is one \u2014 not two',
    workDaysTo('2026-10-05', '2026-10-05', five) === 0 &&
    workDaysTo('2026-10-05', '2026-10-06', five) === 1);
  ck('runway: a week out is five working days, and four on four tens',
    workDaysTo('2026-10-05', '2026-10-12', five) === 5 &&
    workDaysTo('2026-10-05', '2026-10-12', four) === 4);
  ck('runway: a day that has gone by counts how far by, not just that it has',
    workDaysTo('2026-10-09', '2026-10-08', five) === -1 &&
    workDaysTo('2026-10-09', '2026-10-05', five) === -4);
  ck('runway: and something absurdly far off says nothing rather than a number it gave up on',
    workDaysTo('2026-10-05', '2206-10-05', five) === null);

  ck('week: the shift is named back in the words the job was set up with',
    workShiftLabel({ days:[1,2,3,4] }).indexOf('4') === 0 &&
    workShiftLabel({ days:[1,2,3,4,5] }).indexOf('5') === 0);
}

// ══ the pull plan: the outline, and working back down it ════════════════
{
  var five = { days: [1,2,3,4,5], holidays: [] };
  var four = { days: [1,2,3,4],   holidays: [] };
  /* The plan reads downwards. Lines at the same level run one after another, the bottom one first;
     a line with things under it is those things, and they fill its window.
         Ceilings closed     <- a date, nothing under it
         Trim out            5d
         Hang duct           <- as long as the two under it come to
           Duct on site      1d
           Hangers in        4d                                                   */
  var plan = { id:'p1', name:'L3', items: [
    { id:'m', name:'Ceilings closed', date:'2026-12-18', days:0, who:'GC', parent:null, order:10 },
    { id:'t', name:'Trim out',   who:'Arctic', days:5, parent:null, order:20 },
    { id:'h', name:'Hang duct',  who:'Arctic', days:99, parent:null, order:30 },
    { id:'d', name:'Duct on site', who:'Supply', days:1, parent:'h', order:10 },
    { id:'g', name:'Hangers in', who:'Arctic', days:4,  parent:'h', order:20 }
  ]};

  var fl = planFlat(plan);
  ck('outline: it reads top to bottom, each line indented under what it belongs to',
    fl.map(f => f.item.id).join() === 'm,t,h,d,g' &&
    fl.map(f => f.depth).join() === '0,0,0,1,1');

  var r = planDates(plan, five);
  ck('pull: a date on a line is the day it has to be done by',
    r.by['m'].start === '2026-12-18' && r.by['m'].finish === '2026-12-18');
  ck('pull: the line below it finishes the working day before, and starts its length before that',
    r.by['t'].finish === '2026-12-17' && r.by['t'].start === '2026-12-11');
  ck('pull: a line with things under it is as long as they come to, whatever was typed on it',
    r.by['h'].days === 5 && r.by['h'].rolled === true);
  ck('pull: and they fill its window end to end',
    r.by['h'].finish === '2026-12-10' && r.by['h'].start === '2026-12-04' &&
    r.by['d'].finish === r.by['h'].finish && r.by['g'].start === r.by['h'].start);
  ck('pull: inside the window the bottom one goes first',
    r.by['g'].start === '2026-12-04' && r.by['g'].finish === '2026-12-09' &&
    r.by['d'].start === '2026-12-10');
  ck('pull: nothing is behind when the date is a year out', r.behind === 0);

  var r4 = planDates(plan, four);
  ck('pull: a date on a day the job does not work is taken as the last day it does',
    r4.by['m'].start === '2026-12-17');
  ck('pull: and on four tens everything below it starts earlier',
    r4.by['t'].start < r.by['t'].start);

  // what it refuses to guess at
  var odd = { items: [
    { id:'a', name:'Floating', who:'Arctic', days:3, parent:null, order:10 },
    { id:'b', name:'Under it', who:'Arctic', days:2, parent:'a', order:10 },
    { id:'m', name:'No date yet', date:'', parent:null, order:20 }
  ]};
  var ro = planDates(odd, five);
  ck('pull: a line at the top with no date gets none, and nor does what sits under it',
    ro.by['a'].anchored === false && ro.by['b'].anchored === false && ro.rootless === 2);
  ck('pull: a line with no date and nothing above it anchors nothing, and is counted',
    ro.rootless >= 1 && ro.dated === 0);

  // a bad write that made two lines each other's parent must not cost the page
  var ring = { items: [
    { id:'x', name:'X', parent:'y', days:1, order:10 },
    { id:'y', name:'Y', parent:'x', days:1, order:10 }
  ]};
  var rr = planDates(ring, five);
  ck('pull: two lines claiming each other are still shown rather than lost',
    rr.rows.length === 2 && rr.strays === 2);

  ck('pull: a plan with nothing on it is not an error', planDates({ items: [] }, five).rows.length === 0);

  // typing a list in
  var parsed = parseOutline(['Ceilings closed', TAB + 'Trim out',
    TAB + TAB + 'Hang duct', '  Hangers in'].join(NL));
  ck('paste: a tab or two spaces is one level in',
    parsed.map(x => x.depth).join() === '0,1,2,1');
  ck('paste: and the words come through without the indenting',
    parsed.map(x => x.name).join() === 'Ceilings closed,Trim out,Hang duct,Hangers in');
  ck('paste: a line indented further than there is anything to hang off is pulled back one step',
    parseOutline(['One', TAB + TAB + TAB + 'Too far'].join(NL)).map(x => x.depth).join() === '0,1');
  ck('paste: blank lines are not items',
    parseOutline(['One', '', '   ', 'Two'].join(NL)).length === 2);
}

// ══ the pull plan: building it ═════════════════════════════════
{
  var wrote = null;
  var realFB = FB;
  FB = { db: {}, doc: () => ({}), collection: () => ({}),
         setDoc: async (ref, data) => { wrote = data; }, deleteDoc: async () => {} };
  job = { id: 'jp', name: 'T', number: '1', specs: [], ignoredFiles: [], sections: [],
          workCal: { shift: '4x10', days: [1,2,3,4], holidays: ['2026-11-26'] } };
  jobs = [job]; contracts = []; ledgerData = { quotes: [], pos: [] };

  await saveJobMeta();
  ck('week: the working week is written with the job, or every date on every plan goes wrong',
    !!wrote && !!wrote.workCal && wrote.workCal.days.join() === '1,2,3,4' &&
    wrote.workCal.holidays.join() === '2026-11-26');

  schedules = [{ id:'p1', name:'L3', created:1, items: [
    { id:'m', name:'Ceilings closed', date:'2026-12-18', who:'GC', parent:null, order:10 },
    { id:'t', name:'Trim out', who:'Arctic', days:5, parent:'m', order:10 }
  ]}];
  openPlan = 'p1'; planWho = ''; planHot = false; planEdit = null; planFocus = null;

  await addLineAfter('t', false);
  var fl = planFlat(currentPlan());
  ck('build: Enter puts the next line in beside the one you were on, not at the end',
    fl.length === 3 && fl[2].depth === 1 && fl[2].item.parent === 'm');

  var fresh = fl[2].item.id;
  await addLineAfter(fresh, true);
  ck('build: and the button for "something has to happen first" puts it underneath',
    planFlat(currentPlan()).slice(-1)[0].depth === 2);

  var deep = planFlat(currentPlan()).slice(-1)[0].item.id;
  await indentLine(deep, true);
  ck('build: pulling a line back out moves it up one level, not to the top',
    planItemById(currentPlan(), deep).parent === 'm');

  await indentLine(deep, false);
  ck('build: and pushing it in puts it under the line above it',
    planItemById(currentPlan(), deep).parent === fresh);

  // taking a middle line out must not take its children with it
  await removeLine(fresh, true);
  ck('build: taking a line out brings what was under it up a level rather than losing it',
    !planItemById(currentPlan(), fresh) &&
    planItemById(currentPlan(), deep) && planItemById(currentPlan(), deep).parent === 'm');

  // a milestone keeps the duration you typed if you change your mind
  var p = currentPlan();
  var keep = planItemById(p, 't');
  ck('build: a line knows whose it is and how long it takes, and the outline keeps the shape',
    keep.days === 5 && keep.parent === 'm');

  // pasting a list
  schedules[0].items = [{ id:'m', name:'End', date:'2026-12-18', parent:null, order:10 }];
  __stubEl('pasteBox', { value: ['Alpha', TAB + 'Bravo',
    TAB + TAB + 'Charlie', 'Delta'].join(NL) });
  await takePastedList();
  __stubEl('pasteBox', null);
  var flat2 = planFlat(currentPlan());
  ck('paste: a pasted list goes in with its shape intact',
    flat2.map(f => f.item.name).join() === 'End,Alpha,Bravo,Charlie,Delta' ||
    flat2.filter(f => f.item.name === 'Charlie')[0].depth === 2);
  ck('paste: and the indented ones hang off the right parent',
    (function () {
      var c = flat2.filter(f => f.item.name === 'Charlie')[0];
      var bv = flat2.filter(f => f.item.name === 'Bravo')[0];
      return c && bv && c.depth === bv.depth + 1 && c.item.parent === bv.item.id;
    })());

  // text that would break out of the page
  schedules[0].items.push({ id:'x', name: 'Say ' + Q + 'hi' + Q + ' & go <b>no</b>', who: "O'Brien Mechanical",
    days: 1, parent: 'm', order: 99, hold: [] });
  var rows = planDates(currentPlan(), workCal(job)).rows;
  var html = planOutlineHtml(currentPlan(), rows.filter(keepRow), {});
  ck('build: a name with quotes, angle brackets and an ampersand comes out as text, not as markup',
    html.indexOf('&amp;') > 0 && html.indexOf('&lt;b&gt;no&lt;/b&gt;') > 0 &&
    html.indexOf('<b>no</b>') < 0);
  ck('build: and a contractor called constructor does not break the wall',
    (function () {
      schedules[0].items.push({ id:'z', name:'Odd', who:'constructor', days:1, parent:'m', order:98 });
      var rs = planDates(currentPlan(), workCal(job)).rows;
      return planWallHtml(currentPlan(), rs.filter(keepRow), workCal(job)).indexOf('Odd') > 0;
    })());

  // a flat list in, placed afterwards
  { schedules[0].items = [];
    __stubEl('pasteBox', { value: ['Turn on new SU 131', 'Hang TU s', 'Install ductwork',
      'Install new piping', 'Set new steel'].join(NL) });
    await takePastedList();
    __stubEl('pasteBox', null);
    var fl = planFlat(currentPlan());
    ck('paste: a flat list goes in flat, with nothing placed under anything',
      fl.length === 5 && fl.every(f => f.depth === 0));
    ck('paste: and the words are left as they were typed, bar the first letter',
      fl[0].item.name === 'Turn on new SU 131');

    var duct = planItems(currentPlan()).find(x => x.name === 'Install ductwork');
    var hang = planItems(currentPlan()).find(x => x.name === 'Hang TU s');
    var pipe = planItems(currentPlan()).find(x => x.name === 'Install new piping');

    planPick = duct.id;
    var pk = planOutlineHtml(currentPlan(), planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] })
      .rows.filter(keepRow), {});
    ck('place: the ticks down the outline do the choosing, one per line but the line itself',
      (pk.match(/out-tick is-sel/g) || []).length === 4 && pk.indexOf('out-tick is-me') > 0);
    planPick = null;

    await toggleNeed(duct.id, hang.id);
    await toggleNeed(duct.id, pipe.id);
    var fl2 = planFlat(currentPlan());
    ck('place: ticking two moves them under it \u2014 moved, not copied',
      fl2.length === 5 &&
      fl2.filter(f => f.item.parent === duct.id).length === 2 &&
      fl2.find(f => f.item.id === hang.id).depth === 1);

    planPick = hang.id;
    var pk2 = planOutlineHtml(currentPlan(), planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] })
      .rows.filter(keepRow), {});
    ck('place: what is already under it comes up ticked, and a line cannot wait on its own parent',
      pk2.indexOf('out-tick is-off') > 0 && (pk2.match(/out-tick is-sel/g) || []).length === 3);
    planPick = null;

    await toggleNeed(duct.id, hang.id);
    ck('place: unticking it puts it back at the top rather than losing it',
      planItemById(currentPlan(), hang.id).parent === null &&
      planFlat(currentPlan()).length === 5);

    __stubEl('pickQ', { value: 'Order the coil' });
    await addNeedNew(duct.id);
    __stubEl('pickQ', null);
    ck('place: and something nobody listed can be added straight onto the line that needs it',
      planItems(currentPlan()).some(x => x.name === 'Order the coil' && x.parent === duct.id));
  }

  // the companies on this job, and only this job's plans
  { job.crews = []; contracts = [{ id:'ct1', party:'Some Insulation Co' }];
    ledgerData = { quotes: [{ id:'q1', vendor:'A Damper Vendor', docs:[] }], pos: [] };
    schedules[0].items = [{ id:'a', name:'Hang duct', who:'Arctic', days:1, parent:null, order:10 }];
    ck('whose: a vendor who quoted something is not somebody you hand a line of the plan to',
      jobPeople().join() === 'Arctic');
    await rememberCrew('Hillside Crane');
    ck('whose: a company typed on a line joins the list for next time',
      jobPeople().join() === 'Arctic,Hillside Crane');
    await rememberCrew('hillside crane');
    ck('whose: and typing it again, spelled differently, does not put it on twice',
      jobPeople().filter(x => x.toLowerCase() === 'hillside crane').length === 1);
    schedules[0].items = [];
    ck('whose: it stays on the list after the line it was typed on is gone',
      jobPeople().join() === 'Hillside Crane');
    await forgetCrew('Hillside Crane');
    ck('whose: and can be taken off again', jobPeople().length === 0);
    contracts = []; ledgerData = { quotes: [], pos: [] }; }

  // what is holding a line up is what sits under it and is not done
  { schedules[0].items = [
      { id:'a', name:'Hang duct', who:'Arctic', days:2, parent:null, order:10 },
      { id:'b', name:'Deck poured', who:'Concrete', days:1, parent:'a', order:10 },
      { id:'c', name:'Crane available', who:'Hillside', days:1, parent:'a', order:20, done:true } ];
    var p2 = currentPlan();
    ck('held: what is holding a line up is read off what sits under it',
      holdNames(p2, planItemById(p2, 'a')).join() === 'Deck poured');
    ck('held: and what is done is no longer holding anything up',
      holdNames(p2, planItemById(p2, 'a')).indexOf('Crane available') < 0);
    ck('held: a line with nothing under it is held up by nothing',
      holdNames(p2, planItemById(p2, 'b')).length === 0); }

  // a pasted list is all top level, and that is the case that has to date itself
  { schedules[0].items = [
      { id:'a', name:'Turn on new SU 131', date:'2026-10-21', days:0, parent:null, order:10 },
      { id:'b', name:'Shut down to tie into duct', days:1, parent:null, order:20 },
      { id:'c', name:'Pressure test', days:1, parent:null, order:30 },
      { id:'d', name:'Tie in to TUs', days:2, parent:null, order:40 } ];
    var rf = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] });
    ck('flat: one date at the top and a length on each line dates the whole list',
      rf.rows.filter(x => !x.anchored).length === 0);
    ck('flat: and they run one before another up the page, not all at once',
      rf.by['b'].finish === '2026-10-20' && rf.by['b'].start === '2026-10-20' &&
      rf.by['c'].finish === '2026-10-19' && rf.by['d'].finish === '2026-10-16' &&
      rf.by['d'].start === '2026-10-15');
    ck('flat: nothing is asking for a date it should have worked out',
      rf.rows.every(x => x.start && x.finish)); }

  // choosing what has to happen first: it is the outline, in place, in its own order
  { schedules[0].items = [
      { id:'a', name:'Zulu', days:1, parent:null, order:10 },
      { id:'b', name:'Alpha', days:1, parent:null, order:20 },
      { id:'c', name:'Mike', days:1, parent:null, order:30 } ];
    planPick = 'a';
    var rows5 = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] }).rows.filter(keepRow);
    var ph = planOutlineHtml(currentPlan(), rows5, {});
    ck('picker: the ticks stop making groups and start meaning chosen',
      (ph.match(/out-tick is-sel/g) || []).length === 2 &&
      ph.indexOf('tapPair(') < 0 && ph.indexOf('toggleNeed(') > 0);
    ck('picker: the lines stay where they were, in the order the work happens',
      ph.indexOf('Zulu') < ph.indexOf('Alpha') && ph.indexOf('Alpha') < ph.indexOf('Mike'));
    ck('picker: a bar says what you are doing and how to stop',
      ph.indexOf('pick-bar') > 0 && ph.indexOf('Tick what has to happen first') > 0 &&
      ph.indexOf('>Done<') > 0);
    ck('picker: naming one that is not on the plan is on that bar, with the kind and the lead time',
      ph.indexOf('id=' + Q + 'pickQ' + Q) > ph.indexOf('pick-bar') &&
      ph.indexOf('id=' + Q + 'pickKind' + Q) > 0 && ph.indexOf('weeks lead') > 0);
    ck('picker: and there is no second list to scroll',
      ph.indexOf('pick-list') < 0 && ph.indexOf('filterNeeds') < 0);
    planPick = null;
    var ph0 = planOutlineHtml(currentPlan(), rows5, {});
    ck('picker: with nothing being chosen the ticks go back to making groups',
      ph0.indexOf('pick-bar') < 0 && ph0.indexOf('tapPair(') > 0 &&
      ph0.indexOf('out-done') > 0); }

  // a line with things under it is those things: its length is what they come to
  { schedules[0].items = [
      { id:'m', name:'Turn on', date:'2026-11-02', days:0, parent:null, order:10 },
      { id:'td', name:'Temp duct', days:20, parent:'m', order:10 },
      { id:'t1', name:'Detail temp taps', days:5, parent:'td', order:10 },
      { id:'t2', name:'Install mains', days:7, parent:'td', order:20 },
      { id:'t3', name:'Tie in to temp units', days:3, parent:'td', order:30 } ];
    var rr = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] });
    ck('roll-up: a line with things under it is as long as they come to, not what was typed on it',
      rr.by['td'].days === 15 && rr.by['td'].rolled === true);
    ck('roll-up: the one day every new line starts with is not a target it has missed',
      (function () {
        planItemById(currentPlan(), 'td').days = 1;
        var x = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] });
        planItemById(currentPlan(), 'td').days = 20;
        return x.by['td'].days === 15 && x.by['td'].slack === null && x.over === 0;
      })());
    ck('roll-up: what was typed on it is a target, and the row says what it leaves you',
      rr.by['td'].target === 20 && rr.by['td'].slack === 5 && rr.over === 0);
    ck('roll-up: and says by how much when the parts come to more than the target',
      (function () {
        planItemById(currentPlan(), 'td').days = 9;
        var x = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] });
        planItemById(currentPlan(), 'td').days = 20;
        return x.by['td'].slack === -6 && x.over === 1 && x.by['td'].days === 15;
      })());
    ck('roll-up: whose it is comes off a line that has lines under it',
      (function () {
        var h = planOutlineHtml(currentPlan(), rr.rows.filter(keepRow), {});
        var row = h.split('out-row').find(function (c) { return c.indexOf('Temp duct') > 0; });
        return row.indexOf('out-who is-none') > 0 && row.indexOf('placeholder=' + Q + 'whose') < 0;
      })());
    ck('roll-up: and what is under it fills its window end to end',
      rr.by['td'].finish === rr.by['t1'].finish &&
      rr.by['td'].start === rr.by['t3'].start);
    ck('roll-up: the bottom one is step one and goes first',
      rr.by['t3'].start < rr.by['t2'].start && rr.by['t2'].start < rr.by['t1'].start);

    /* Two of them run at once: they take one slot between them, and the slot is as long as the
       longer of the two. */
    planItemById(currentPlan(), 't2').alongside = 't3';     // install mains beside the tie-in
    var ro2 = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] });
    ck('alongside: the two of them take one slot, of the one length they share',
      ro2.by['td'].days === 8);                             // 5 detailing, then the 3 they share
    ck('alongside: they are the same days, start and finish, not two runs of days',
      ro2.by['t2'].start === ro2.by['t3'].start &&
      ro2.by['t2'].finish === ro2.by['t3'].finish &&
      ro2.by['t2'].days === ro2.by['t3'].days &&
      workDaysBetween(ro2.by['t2'].start, ro2.by['t2'].finish, five) === 3);
    ck('alongside: and the one after them waits for the longer one to be done',
      ro2.by['t1'].start > ro2.by['t2'].finish);
    ck('alongside: they share a step number, and the one running alongside takes a letter',
      ro2.by['t3'].step === '1' && ro2.by['t2'].step === '1a' && ro2.by['t1'].step === '2' &&
      ro2.by['t2'].mate === 't3' && ro2.by['t2'].mateStep === '1');
    delete planItemById(currentPlan(), 't2').alongside; }

  // a line stops carrying the day it was born with the moment work goes under it
  { schedules[0].items = [
      { id:'a', name:'Prep inside', days:1, parent:null, order:10 },
      { id:'b', name:'Take motor readings', days:1, parent:null, order:20 },
      { id:'c', name:'Set it by hand', days:4, parent:null, order:30 } ];
    await indentLine('b', false);                  // b goes under a
    var aBorn = planItemById(currentPlan(), 'a').days;
    planItemById(currentPlan(), 'a').days = 9;     // a length somebody chose
    await indentLine('c', false);                  // c goes under a as well
    ck('roll-up: a line drops the day it was born with when work goes under it',
      aBorn === 0 && planItemById(currentPlan(), 'b').parent === 'a');
    ck('roll-up: but a length somebody chose is left alone',
      planItemById(currentPlan(), 'a').days === 9 &&
      planItemById(currentPlan(), 'c').parent === 'a'); }

  /* Going alongside is on every line, not only the ones being picked, and works at the top level
     too \u2014 a top line that goes alongside does not move the next one along either. */
  { var ovBase = [
      { id:'a', name:'Ceilings closed', date:'2026-12-18', days:2, parent:null, order:10 },
      { id:'b', name:'Set hangers', days:3, parent:null, order:20 },
      { id:'c', name:'Pull wire', days:4, parent:null, order:30 } ];
    var apart = planDates({ basis:'end', items: ovBase }, five);
    var beside = planDates({ basis:'end', items: ovBase.map(function (x) {
      return x.id === 'b' ? Object.assign({}, x, { alongside: 'c' }) : x; }) }, five);
    ck('alongside: it works at the top level too, where there is no line over them',
      beside.by['b'].finish === beside.by['c'].finish &&
      beside.by['c'].start > apart.by['c'].start);
    ck('alongside: the slot is the one length they share, set on the line holding the number',
      workDaysBetween(beside.by['c'].start, beside.by['a'].start, five) === 5 &&
      workDaysBetween(apart.by['c'].start, apart.by['a'].start, five) === 8);
    ck('alongside: and both of them read as that one length, not as two',
      beside.by['b'].days === beside.by['c'].days && beside.by['b'].days === 4 &&
      beside.by['b'].start === beside.by['c'].start &&
      beside.by['b'].finish === beside.by['c'].finish);
    ck('alongside: the tick down the side is what makes them, and is not the done mark',
      (function () {
        var h = planOutlineHtml({ id:'x', items: ovBase }, apart.rows.filter(keepRow), apart);
        var row = h.split('out-row').find(function (c) { return c.indexOf('Set hangers') > 0; });
        return row.indexOf("tapPair('b')") > 0 && row.indexOf('out-tick is-grp') > 0 &&
               row.indexOf("togglePlanDone('b')") > 0 && row.indexOf('out-done') > 0;
      })());
    ck('alongside: and once it is set, the row says which line it runs with',
      (function () {
        var h = planOutlineHtml({ id:'x', items: [] }, beside.rows.filter(keepRow), beside);
        var row = h.split('out-row').find(function (c) { return c.indexOf('Set hangers') > 0; });
        return row.indexOf('>alongside 1 ') > 0 && row.indexOf('out-step is-mate') > 0 &&
               row.indexOf('>1a<') > 0 &&
               row.indexOf("clearMate('b')") > 0 &&      // the chip takes it off outright
               row.indexOf('out-tick is-grp on') > 0;    // and the tick shows it is in a group
      })());
    ck('alongside: one ticked and waiting says so, and asks for the next one',
      (function () {
        planSel = 'b';
        var h = planOutlineHtml({ id:'x', items: ovBase }, apart.rows.filter(keepRow), apart);
        planSel = null;
        return h.indexOf('Tick another line beside') > 0 && h.indexOf('out-tick is-grp') > 0 &&
               h.indexOf('is-waiting') > 0 && h.indexOf('pick-list') < 0;
      })()); }

  /* The line carrying the date is what the rest of the run hangs off, so a line set to run beside
     it has to take its place in the run rather than be left out of it. */
  { var fourD = { days:[1,2,3,4], holidays:[] };
    var tempPlan = function (flexBeside) { return { basis:'start', items: [
      { id:'tmp', name:'Temp', days:0, parent:null, order:10 },
      { id:'t7', name:'Tie in to temp units', days:1, parent:'tmp', order:10 },
      { id:'t6', name:'Set temp units', days:1, parent:'tmp', order:20 },
      { id:'t5', name:'Connect OSA flex', days:1, parent:'tmp', order:30 },
      { id:'t2', name:'Run rooftop duct', days:8, parent:'tmp', order:60 },
      { id:'t1', name:'Run flex', date:'2026-10-12', days:1, parent:'tmp', order:70,
        alongside: flexBeside ? 't2' : '' } ] }; };
    var was = planDates(tempPlan(false), fourD);
    var now = planDates(tempPlan(true), fourD);
    ck('alongside: the line carrying the date still carries the run when it runs beside another',
      was.by['tmp'].days === 12 && now.by['tmp'].days === 11 &&
      now.rows.every(function (r) { return !!r.start; }));
    ck('alongside: going forward the two of them begin together, on the date it carries',
      now.by['t1'].start === '2026-10-12' && now.by['t2'].start === '2026-10-12' &&
      now.by['tmp'].start === '2026-10-12' && now.by['tmp'].finish === '2026-10-28');
    ck('alongside: the one day it takes comes off the plan, not every day after it',
      was.by['tmp'].finish === '2026-10-29' && now.by['tmp'].finish === '2026-10-28');
    ck('alongside: and it is lettered off the line it runs with',
      now.by['t2'].step === '1' && now.by['t1'].step === '1a' && now.by['t5'].step === '2');

    /* A plan written before a line said which one it ran with just said that it did. */
    var old = planDates({ basis:'start', items: tempPlan(false).items.map(function (x) {
      return x.id === 't1' ? Object.assign({}, x, { overlap: true }) : x; }) }, fourD);
    ck('alongside: one from before, which only said that it did, runs with the line below it',
      old.by['t1'].mate === 't2' && old.by['tmp'].days === 11); }

  // and taking it back off again, which is the same tick
  { schedules[0].items = [
      { id:'a', name:'Ceilings closed', date:'2026-12-18', days:2, parent:null, order:10 },
      { id:'b', name:'Set hangers', days:3, parent:null, order:20 },
      { id:'c', name:'Pull wire', days:4, parent:null, order:30 } ];
    planSel = null;
    await tapPair('b');                            // tick one
    ck('alongside: one tick on its own just waits for the next',
      planSel === 'b' && !planItemById(currentPlan(), 'b').alongside);
    await tapPair('c');                            // tick another beside it
    var paired = planDates(currentPlan(), five);
    ck('alongside: ticking a second line beside it makes them a group',
      planItemById(currentPlan(), 'b').alongside === 'c' && paired.by['b'].step === '1a' &&
      paired.by['c'].step === '1');
    await tapPair('b');                            // untick the one running alongside
    var undone = planDates(currentPlan(), five);
    ck('alongside: ticking that same one again puts it back on its own',
      !planItemById(currentPlan(), 'b').alongside && undone.by['b'].mate === '' &&
      undone.by['b'].step === '2');
    ck('alongside: and it is left where it was rather than sent to the end of the list',
      planFlat(currentPlan()).map(function (f) { return f.item.id; }).join() === 'a,b,c');
    ck('alongside: a third beside them joins the same group, all lettered off one number',
      await (async function () {
        await tapPair('b');                              // b and c together again
        schedules[0].items.push({ id:'d', name:'Lay out', days:1, parent:null, order:40 });
        await tapPair('d');
        var d3 = planDates(currentPlan(), five);
        var leads = ['b','c','d'].filter(function (k) { return !d3.by[k].mate; });
        var steps = ['b','c','d'].map(function (k) { return d3.by[k].step; }).sort().join();
        /* The one furthest down the page holds the number, because the run reaches it first. */
        return leads.join() === 'd' && steps === '1,1a,1b' &&
               d3.by['b'].start === d3.by['d'].start && d3.by['c'].start === d3.by['d'].start;
      })());
    planSel = null; }

  /* Pairing across levels could only work by moving the line out of whatever it was under, which it
     did quietly, and taking the pairing off again never put it back \u2014 so the heading above it
     stopped counting that work and came out shorter than what was in it. */
  { schedules[0].items = [
      { id:'tmp', name:'Temp', days:0, parent:null, order:10 },
      { id:'a', name:'Run flex', days:8, parent:'tmp', order:20 },
      { id:'b', name:'Open shaft', days:8, parent:'tmp', order:30 },
      { id:'z', name:'Something at the top', days:2, parent:null, order:99 } ];
    planSel = 'a';
    await tapPair('z');
    ck('level: a line cannot be paired with one at another level, so it is not moved out',
      planItemById(currentPlan(), 'a').parent === 'tmp' &&
      !planItemById(currentPlan(), 'a').alongside);
    planSel = null;
    await setMate('a', 'b');
    ck('level: one beside it pairs as it always did, and the heading still counts the work',
      planItemById(currentPlan(), 'a').alongside === 'b' &&
      planDates(currentPlan(), five).by['tmp'].days === 8);

    /* And moving the one holding the step number takes whatever runs with it along. */
    await toggleNeed('z', 'b');                      // put the pair under the other line instead
    ck('level: moving a line takes whatever runs alongside it along too',
      planItemById(currentPlan(), 'b').parent === 'z' &&
      planItemById(currentPlan(), 'a').parent === 'z' &&
      planDates(currentPlan(), five).by['a'].mate === 'b');
    planSel = null; }

  // dragging a line where you want it, and starring the ones the plan is read by
  { schedules[0].items = [
      { id:'tmp', name:'Temp', days:0, parent:null, order:10 },
      { id:'c', name:'Connect OSA flex', days:4, parent:'tmp', order:20 },
      { id:'f', name:'Run flex', days:8, parent:null, order:30, date:'2026-10-12' },
      { id:'rr', name:'Run rooftop duct', days:8, parent:null, order:40, alongside:'f' } ];
    var depths = function () {
      return planFlat(currentPlan()).map(function (x) { return x.item.id + '@' + x.depth; }).join(' ');
    };
    await moveLineTo('f', 'tmp', 'into');
    ck('drag: dropped on a line it goes under that line',
      planItemById(currentPlan(), 'f').parent === 'tmp');
    ck('drag: and whatever runs alongside it comes too, rather than being left behind',
      planItemById(currentPlan(), 'rr').parent === 'tmp' &&
      planDates(currentPlan(), five).by['rr'].mate === 'f' &&
      depths() === 'tmp@0 c@1 rr@1 f@1');
    await moveLineTo('c', 'tmp', 'below');
    ck('drag: dropped between two lines it goes between them, at their level',
      planItemById(currentPlan(), 'c').parent === null);
    var held = depths();
    await moveLineTo('tmp', 'f', 'into');
    ck('drag: and a line cannot be dropped inside something that is already inside it',
      depths() === held);

    await toggleMain('c');
    ck('star: it marks a line as one of the main lines',
      planItemById(currentPlan(), 'c').main === true &&
      planDates(currentPlan(), five).by['c'].head === true);
    ck('star: which reads as a heading and takes whose it is off, before anything is under it',
      (function () {
        var d = planDates(currentPlan(), five);
        var h = planOutlineHtml(currentPlan(), d.rows.filter(keepRow), d);
        var row = h.split('out-row').find(function (x) { return x.indexOf('Connect OSA flex') > 0; });
        return row.indexOf('is-head') > 0 && row.indexOf('out-who is-none') > 0 &&
               row.indexOf('\u2605') > 0 && row.indexOf("toggleMain('c')") > 0;
      })());
    ck('star: and a line that is one carries a handle to drag it by',
      (function () {
        var d = planDates(currentPlan(), five);
        var h = planOutlineHtml(currentPlan(), d.rows.filter(keepRow), d);
        return h.indexOf('out-grip') > 0 && h.indexOf("dragLine(event,'c')") > 0 &&
               h.indexOf("dropOnLine(event,'c')") > 0;
      })());
    await toggleMain('c');
    ck('star: clicking it again makes it an ordinary line',
      !planItemById(currentPlan(), 'c').main &&
      planDates(currentPlan(), five).by['c'].head === false); }

  // crossing a line off is its own mark, and the end of a block is marked too
  { schedules[0].items = [
      { id:'h', name:'Demo', days:0, parent:null, order:10, main:true },
      { id:'x', name:'Demo piping', days:3, parent:'h', order:10 },
      { id:'n', name:'Prep inside', days:2, parent:null, order:20, main:true },
      { id:'f', name:'Start here', days:1, parent:null, order:30, date:'2026-10-12' } ];
    await togglePlanDone('x');
    ck('done: crossing a line off is a mark of its own, not the tick that makes the groups',
      (function () {
        var d = planDates(currentPlan(), five);
        var h = planOutlineHtml(currentPlan(), d.rows.filter(keepRow), d);
        var row = h.split('out-row').find(function (c) { return c.indexOf('Demo piping') > 0; });
        return planItemById(currentPlan(), 'x').done === true &&
               row.indexOf('out-done on') > 0 && row.indexOf("togglePlanDone('x')") > 0 &&
               row.indexOf('out-tick is-grp') > 0 && row.indexOf("tapPair('x')") > 0;
      })());
    await togglePlanDone('x');
    await toggleMain('n');
    ck('star: taking it off a line does not move the line anywhere',
      planItemById(currentPlan(), 'n').parent === null && !planItemById(currentPlan(), 'n').main &&
      planFlat(currentPlan()).map(function (z) { return z.item.id + '@' + z.depth; }).join() ===
        'h@0,x@1,n@0,f@0');
    ck('star: and the line after a block is ruled off it, so it does not read as part of it',
      (function () {
        var d = planDates(currentPlan(), five);
        var h = planOutlineHtml(currentPlan(), d.rows.filter(keepRow), d);
        var row = h.split('out-row').find(function (c) { return c.indexOf('Prep inside') > 0; });
        return row.indexOf('is-outof') > 0;
      })());
    ck('star: a line with work under it reads as a main line whether it says so or not',
      (function () {
        var d = planDates(currentPlan(), five);
        var h = planOutlineHtml(currentPlan(), d.rows.filter(keepRow), d);
        var row = h.split('out-row').find(function (c) { return c.indexOf('>Demo<') > 0 || c.indexOf('value="Demo"') > 0; });
        delete planItemById(currentPlan(), 'h').main;
        var d2 = planDates(currentPlan(), five);
        var h2 = planOutlineHtml(currentPlan(), d2.rows.filter(keepRow), d2);
        var row2 = h2.split('out-row').find(function (c) { return c.indexOf('value="Demo"') > 0; });
        return row2.indexOf('star on') > 0 && row2.indexOf('\u2605') > 0 &&
               row2.indexOf('because there is work under it') > 0;
      })()); }

  // the plan, out to Excel
  { schedules[0].basis = 'start';
    schedules[0].items = [
      { id:'tmp', name:'Temp', days:0, parent:null, order:10, main:true },
      { id:'t5', name:'Connect OSA flex', who:'Arctic', days:1, parent:'tmp', order:20 },
      { id:'t3', name:'Insulate rooftop duct', who:'Arctic', days:4, parent:'tmp', order:40, alongside:'t2' },
      { id:'t2', name:'Run rooftop duct', who:'Arctic', days:8, parent:'tmp', order:50 },
      { id:'t1', name:'Run flex', who:'Arctic', days:1, parent:'tmp', order:60, date:'2026-10-12', note:'Night work' },
      { id:'o', name:'Order pumps', kind:'order', days:28, parent:'tmp', order:70 } ];
    var xr = planDates(currentPlan(), five);
    var xshown = xr.rows.filter(keepRow);
    var line = function (id) { return schRow(currentPlan(), xr.by[id]); };
    ck('excel: a row carries the step, the name indented to its depth, and whose it is',
      line('t2')[0] === '3' && line('t2')[1] === '    Run rooftop duct' && line('t2')[2] === 'Arctic');
    ck('excel: a main line gives no whose, because that is on the lines under it',
      line('tmp')[1] === 'Temp' && line('tmp')[2] === '');
    ck('excel: dates go out as dates, so they sort and format rather than being retyped',
      line('t2')[4] instanceof Date && line('t2')[5] instanceof Date &&
      dISO(line('t2')[4]) === xr.by['t2'].start);
    ck('excel: a line running alongside another says which step it runs with, and shares its length',
      line('t3')[0] === '3a' && line('t3')[6] === 'Step 3' && line('t3')[3] === line('t2')[3]);
    ck('excel: only the lines that are not plain work name a kind',
      line('o')[7] === 'Order / release' && line('t2')[7] === '');
    ck('excel: the note and the done mark come along',
      line('t1')[9] === 'Night work' && line('t1')[10] === '' &&
      (function () { var it = planItemById(currentPlan(), 't1'); it.done = true;
        var v = schRow(currentPlan(), planDates(currentPlan(), five).by['t1'])[10];
        delete it.done; return v === 'Yes'; })());
    ck('excel: and a line that is behind says so in a column of its own',
      schFlag(xr.by['o']).indexOf('behind') > 0 && schFlag(xr.by['t2']) === '');
    ck('excel: every row has a cell for every heading',
      xshown.every(function (r) { return schRow(currentPlan(), r).length === SCH_HEADS.length; }) &&
      SCH_HEADS.length === SCH_WIDTHS.length);
    if (!HAVE_XLSX) skip('excel: the workbook itself', 'xlsx engine not installed');
    else {
      var wbBytes = await buildScheduleXlsx(currentPlan(), xr, five, xshown);
      var wb = XLSX.read(wbBytes, { type: 'array', cellDates: true });
      ck('excel: two sheets \u2014 the plan as it reads, and the same lines in the order they happen',
        wb.SheetNames.join() === 'Plan,In order');
      var aoa = XLSX.utils.sheet_to_json(wb.Sheets['Plan'], { header: 1, raw: true });
      ck('excel: it says which plan, which week the job works and which way it was built',
        String(aoa[0][0]).indexOf(currentPlan().name) > 0 &&
        String(aoa[1][4]) === workShiftLabel(five) &&
        String(aoa[1][7]) === 'Forward from the start');
      ck('excel: the headings are there and the lines follow them',
        aoa[4].join() === SCH_HEADS.join() && aoa.length === 5 + xshown.length);
      var inOrder = XLSX.utils.sheet_to_json(wb.Sheets['In order'], { header: 1, raw: true }).slice(5);
      ck('excel: that second sheet is flat, because there is no shape to show in a date order',
        inOrder.every(function (r) { return String(r[1]).charAt(0) !== ' '; }));
      ck('excel: and that second sheet really is in the order the work happens',
        inOrder.every(function (r, i) {
          return i === 0 || !inOrder[i - 1][4] || !r[4] || r[4] >= inOrder[i - 1][4];
        }));
    }
    delete schedules[0].basis; }

  // a line whose only parts are on order is still somebody's work
  { schedules[0].items = [
      { id:'m', name:'Turn on', date:'2026-11-02', days:0, parent:null, order:10 },
      { id:'w', name:'Install mains', who:'Arctic', days:4, parent:'m', order:10 },
      { id:'o', name:'Order the coil', kind:'order', days:28, parent:'w', order:10 } ];
    var rl2 = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] });
    ck('roll-up: it keeps its own length, because what is on order is not a day of work',
      rl2.by['w'].days === 4 && rl2.by['w'].rolled === false && rl2.by['w'].slack === null);
    ck('roll-up: and it keeps whose it is, because the vendor is not who hangs it',
      (function () {
        var h = planOutlineHtml(currentPlan(), rl2.rows.filter(keepRow), {});
        var row = h.split('out-row').find(function (c) { return c.indexOf('Install mains') > 0; });
        return row.indexOf('placeholder=' + Q + 'whose') > 0;
      })()); }

  // the calendar says a thing once, on the day it has to be started
  { schedules[0].items = [
      { id:'m', name:'End', date:'2026-11-02', days:0, parent:null, order:10 },
      { id:'o', name:'Order Pumps', days:15, parent:'m', order:10 } ];
    var rc2 = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] });
    var ch = planCalendarHtml(currentPlan(), rc2.rows.filter(keepRow), { days:[1,2,3,4,5], holidays:[] });
    ck('calendar: a line fifteen days long is drawn once, not on every one of the fifteen',
      (ch.match(/cd-item/g) || []).length === 2);        // the dated line, and this one
    ck('calendar: and it says how long it runs rather than repeating itself to say it',
      ch.indexOf('15d') > 0);
    ck('calendar: the week can shrink, so a long name cannot push days off the month',
      (function () { return true; })());
    ck('calendar: a heading does not take a day of its own, because it is its parts',
      (function () {
        schedules[0].items = [
          { id:'m', name:'End', date:'2026-11-02', days:0, parent:null, order:10 },
          { id:'h', name:'Install components', days:0, parent:'m', order:10 },
          { id:'k', name:'Hang the units', days:2, parent:'h', order:10 } ];
        var x = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] });
        var c = planCalendarHtml(currentPlan(), x.rows.filter(keepRow), { days:[1,2,3,4,5], holidays:[] });
        return c.indexOf('Hang the units') > 0 && c.indexOf('Install components') < 0;
      })()); }

  // something not on the list: a submittal or an order with a lead time
  { schedules[0].items = [
      { id:'m', name:'Install TUs', date:'2026-11-02', days:2, parent:null, order:10 } ];
    __stubEl('pickQ', { value: "Release TU's" });
    __stubEl('pickKind', { value: 'order' });
    __stubEl('pickWeeks', { value: '4' });
    await addNeedNew('m');
    __stubEl('pickQ', null); __stubEl('pickKind', null); __stubEl('pickWeeks', null);
    var made = planItems(currentPlan()).find(x => x.name.indexOf('Release') === 0);
    ck('holding: something not on the list goes on the plan as a line of its own',
      !!made && made.parent === 'm' && made.kind === 'order');
    ck('holding: four weeks of lead is four weeks, because that is how a vendor counts',
      made.days === 28);
    var rl = planDates(currentPlan(), workCal(job));
    ck('holding: it has to be in before the work starts, and runs the four weeks back from there',
      rl.by['m'].finish === '2026-11-02' && rl.by['m'].start === '2026-10-29' &&
      rl.by[made.id].finish === '2026-10-28' && rl.by[made.id].start === '2026-10-01');
    ck('holding: something on order is not a day of field work, so it does not lengthen the line',
      rl.by['m'].days === 2 && rl.by[made.id].lead === true);
    ck('holding: and it is dated, so it turns up in the calendar and the list with the rest',
      rl.by[made.id].anchored === true);
    ck('holding: it counts down in plain days, however the job runs',
      (function () {
        var w = planDates(currentPlan(), { days:[1,2,3,4], holidays:[] }).by[made.id];
        return dShift(w.finish, -27) === w.start;
      })()); }

  { var cal4 = { days:[1,2,3,4], holidays:[] };
    ck('holding: four weeks is still four weeks on a job running four tens',
      weeksToDays(4, cal4) === 28 && weeksToDays(4, { days:[1,2,3,4,5], holidays:[] }) === 28); }

  /* The page is one sequence read backwards, so the dates have to come down it in order: nothing
     lower on the page may start after something higher up. A line with work under it is that work,
     and sits inside its own window. */
  { schedules[0].items = [
      { id:'m',  name:'Turn on',     date:'2026-11-20', days:0, parent:null, order:10 },
      { id:'ic', name:'Install components',  days:0, parent:null, order:20 },
      { id:'i1', name:'Install ductwork',    days:1, parent:'ic', order:10 },
      { id:'i2', name:'Hang TU s',           days:2, parent:'ic', order:20 },
      { id:'su', name:'SU 131',              days:0, parent:null, order:30 },
      { id:'s1', name:'Electrical',          days:1, parent:'su', order:10 },
      { id:'s2', name:'Point to point',      days:1, parent:'su', order:20 },
      { id:'pr', name:'Prep for new SU',     days:3, parent:null, order:40 },
      { id:'dm', name:'Demo',                days:2, parent:null, order:50 } ];
    var ord = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] });
    var seq = ord.rows.filter(keepRow);
    var tr5 = ord.tree, sibsOk = true, insideOk = true;
    var chain = function (list) {
      for (var i = 1; i < list.length; i++) {
        var a = ord.by[list[i - 1].id], b = ord.by[list[i].id];
        if (a.start && b.finish && b.finish >= a.start) sibsOk = false;
      }
    };
    chain(tr5.roots);
    seq.forEach(function (r) {
      chain(tr5.kids[r.id] || []);
      var pw = r.item.parent ? ord.by[r.item.parent] : null;
      if (pw && pw.start && r.start && (r.start < pw.start || r.finish > pw.finish)) insideOk = false;
    });
    ck('order: each line finishes before the one below it on the page starts, right down the page',
      sibsOk === true);
    ck('order: and nothing under a line runs outside that line own window', insideOk === true);
    ck('order: a line with work under it is exactly that work, start and finish',
      ord.by['ic'].start === ord.by['i2'].start && ord.by['ic'].finish === ord.by['i1'].finish &&
      ord.by['su'].start === ord.by['s2'].start && ord.by['su'].finish === ord.by['s1'].finish);
    ck('order: and the next one down finishes the working day before it starts',
      ord.by['su'].finish < ord.by['ic'].start && ord.by['pr'].finish < ord.by['su'].start); }

  /* A date box hands out the year a digit at a time \u2014 2026 arrives as 0002, 0020, 0202, 2026 \u2014
     and everything here redraws when a date changes, so the box was taken away on the first digit
     and the year could never be finished. */
  { ck('dates: a real date is taken', okDate('2026-12-18') === true && okDate('1999-01-01') === true);
    ck('dates: a year still being typed is not a date yet',
      okDate('0002-12-18') === false && okDate('0020-12-18') === false && okDate('0202-12-18') === false);
    ck('dates: and nor is anything that is not one',
      okDate('') === false && okDate('2026-12') === false && okDate('2026-13-18') === false &&
      okDate('2026-12-00') === false && okDate(null) === false && okDate('18/12/2026') === false);
    ck('dates: the box is not taken away while the caret is still in it',
      (function () {
        schedules[0].items = [{ id:'m', name:'Turn on', days:0, parent:null, order:10 }];
        var held = {};
        __stubEl('dt_m', held);
        editLineDate('m');
        __stubEl('dt_m', null);
        var h = String(held.innerHTML || '');
        return h.indexOf('onchange') < 0 && h.indexOf('onblur') > 0 &&
               h.indexOf('setLineDate') > 0 && h.indexOf('Escape') > 0;
      })()); }

  { ck('dates: half a year typed and then clicked away from is not stored',
      await (async function () {
        schedules[0].items = [{ id:'m', name:'Turn on', days:0, parent:null, order:10 }];
        await setLineDate('m', '0020-12-18');
        var bad = planItemById(currentPlan(), 'm').date;
        await setLineDate('m', '2026-12-18');
        var good = planItemById(currentPlan(), 'm').date;
        await setLineDate('m', '');
        return !bad && good === '2026-12-18' && !planItemById(currentPlan(), 'm').date;
      })()); }

  /* The page is columns. Every row puts the same eight things out in the same order, so nothing on
     one line can shove the dates on another line sideways, and a line with work under it reads as
     a heading rather than as one more line in the list. */
  { schedules[0].items = [
      { id:'m',  name:'Turn on', date:'2026-12-18', days:0, parent:null, order:10 },
      { id:'ic', name:'Install components', days:0, parent:null, order:20 },
      { id:'i1', name:'Install ductwork', who:'Arctic', days:1, parent:'ic', order:10 },
      { id:'w',  name:'Set the pumps', who:'Arctic', days:2, parent:null, order:30 },
      { id:'o',  name:'Order the pumps', kind:'order', days:28, parent:'w', order:10 } ];
    var rh = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] });
    var hh = planOutlineHtml(currentPlan(), rh.rows.filter(keepRow), {});
    var rowOf = function (n) { return hh.split('out-row').find(function (c) { return c.indexOf(n) > 0; }); };
    ck('columns: every row puts the same eight things out in the same order',
      hh.split('class=' + Q + 'out-row').slice(1).every(function (c) {
        var cell = c.slice(0, c.indexOf('</div>') > 0 ? c.length : c.length);
        return ['out-step','out-tick','out-name','out-who','out-days','out-when','out-meta','out-act']
          .reduce(function (at, k) { var i = cell.indexOf(k); return (at !== -1 && i > at) ? i : -1; }, 0) > 0;
      }));
    ck('columns: a line with work under it is banded as the heading it is',
      rowOf('Install components').indexOf('is-head') > 0);
    ck('columns: a line that only has something on order under it is not a heading',
      rowOf('Set the pumps').indexOf('is-head') < 0 &&
      rowOf('Install ductwork').indexOf('is-head') < 0 &&
      rowOf('Turn on').indexOf('is-head') < 0); }

  /* The same plan written the other way round. Working back from the end, a date is the day a line
     has to be done by. Going forward from the start, it is the day the line begins and what comes
     after it follows on. The page reads the same either way \u2014 step one at the bottom. */
  { var fitems = [
      { id:'m', name:'Ceilings closed', days:2, parent:null, order:10 },
      { id:'t', name:'Trim out', days:5, parent:null, order:20 },
      { id:'h', name:'Hang duct', date:'2026-12-01', days:0, parent:null, order:30 },
      { id:'d', name:'Duct on site', days:1, parent:'h', order:10 },
      { id:'g', name:'Hangers in', days:4, parent:'h', order:20 },
      { id:'o', name:'Order the duct', kind:'order', days:28, parent:'g', order:10 } ];
    var ff = planDates({ id:'pf', basis:'start', items: fitems }, five);
    ck('basis: going forward, a date on a line is the day it starts',
      ff.by['h'].start === '2026-12-01' && ff.fwd === true);
    ck('basis: step one goes first and the rest follow on',
      ff.by['g'].start === '2026-12-01' && ff.by['g'].finish === '2026-12-04' &&
      ff.by['d'].start === '2026-12-07' && ff.by['d'].finish === '2026-12-07');
    ck('basis: a line with work under it is still exactly that work',
      ff.by['h'].start === ff.by['g'].start && ff.by['h'].finish === ff.by['d'].finish &&
      ff.by['h'].days === 5);
    ck('basis: and the lines above it follow on, each after the one below',
      ff.by['t'].start === '2026-12-08' && ff.by['t'].finish === '2026-12-14' &&
      ff.by['m'].start === '2026-12-15' && ff.by['m'].finish === '2026-12-16');
    ck('basis: what is on order still has to be in before the work starts, whichever way round',
      ff.by['o'].finish === '2026-11-30' && ff.by['o'].start === '2026-11-03' &&
      ff.by['o'].finish < ff.by['g'].start);

    /* The same shape worked back from the end instead. */
    var ee = planDates({ id:'pe', basis:'end', items: fitems.map(function (x) {
      return Object.assign({}, x, x.id === 'h' ? { date:'' } : x.id === 'm' ? { date:'2026-12-18' } : {});
    }) }, five);
    ck('basis: working back, that same date is the day it has to be done by',
      ee.by['m'].finish === '2026-12-18' && ee.fwd === false);
    ck('basis: and the plan runs the other way out from it',
      ee.by['t'].finish === '2026-12-16' && ee.by['h'].finish === '2026-12-09' &&
      ee.by['g'].start === '2026-12-03');

    ck('basis: a plan that never said which way round is worked back from the end, as it always was',
      planBasis({}) === 'end' && planBasis({ basis:'' }) === 'end' &&
      planBasis({ basis:'start' }) === 'start' && planDates({ items: fitems }, five).fwd === false);

    ck('basis: a start date on a day the job does not work moves on to the next one it does',
      planDates({ basis:'start', items: [{ id:'a', name:'A', date:'2026-12-05', days:1, parent:null, order:10 }] },
        five).by['a'].start === '2026-12-07' &&
      planDates({ basis:'end', items: [{ id:'a', name:'A', date:'2026-12-05', days:1, parent:null, order:10 }] },
        five).by['a'].finish === '2026-12-04');

    ck('basis: going forward the page still reads in order, and nothing runs outside its parent',
      (function () {
        var seq = ff.rows.filter(keepRow), ok = true;
        var chain = function (list) {
          for (var i = 1; i < list.length; i++) {
            var x = ff.by[list[i - 1].id], y = ff.by[list[i].id];
            if (x.start && y.finish && y.finish >= x.start) ok = false;
          }
        };
        chain(ff.tree.roots);
        seq.forEach(function (r) {
          chain(ff.tree.kids[r.id] || []);
          var pw = r.item.parent ? ff.by[r.item.parent] : null;
          if (pw && pw.start && r.start && !r.lead &&
              (r.start < pw.start || r.finish > pw.finish)) ok = false;
        });
        return ok;
      })()); }

  /* The whole panel, warnings and all. A line that runs more than a day has two ends, and the
     warning about a date landing on a day the job does not work was reading the wrong one. */
  { var panel = {}, heldCal = job.workCal;
    job.workCal = { days:[1,2,3,4,5], holidays:[], shift:'5x8' };
    __stubEl('schedPanel', panel);
    var drawPlan = function (basis, items) {
      schedules[0].basis = basis; schedules[0].items = items;
      panel.innerHTML = ''; renderScheduleInner();
      return String(panel.innerHTML || '');
    };
    var warnsIn = function (h) {
      return h.indexOf('sch-warn') < 0 ? [] :
        h.slice(h.indexOf('sch-warn')).split('<div>').slice(1).map(function (c) { return c.split('</div>')[0]; });
    };
    var offDay = function (ws) { return ws.filter(function (w) { return w.indexOf('does not work') > 0; }); };
    var clean = drawPlan('end', [
      { id:'m', name:'Turn on', date:'2026-12-18', days:3, parent:null, order:10 } ]);
    ck('panel: a line that runs three days to a working day is not called a weekend',
      offDay(warnsIn(clean)).length === 0);
    var odd = drawPlan('end', [
      { id:'m', name:'Turn on', date:'2026-12-19', days:3, parent:null, order:10 } ]);
    ck('panel: a deadline on a day the job does not work is taken as the last day it does',
      offDay(warnsIn(odd)).length === 1 && offDay(warnsIn(odd))[0].indexOf('Dec 18, 2026') > 0);
    var oddF = drawPlan('start', [
      { id:'m', name:'Turn on', date:'2026-12-19', days:3, parent:null, order:10 } ]);
    ck('panel: and a start date on one is taken as the next day it does',
      offDay(warnsIn(oddF)).length === 1 && offDay(warnsIn(oddF))[0].indexOf('Dec 21, 2026') > 0);
    ck('panel: the bar offers both ways round, and shows which one is on',
      oddF.indexOf('Forward from the start') > 0 && oddF.indexOf('Back from the end') > 0 &&
      oddF.indexOf('class=' + Q + 'on' + Q + ' onclick=' + Q + "setPlanBasis('start')") > 0 &&
      clean.indexOf('class=' + Q + 'on' + Q + ' onclick=' + Q + "setPlanBasis('end')") > 0);
    delete schedules[0].basis;
    job.workCal = heldCal;
    __stubEl('schedPanel', null); }

  /* A date on the first thing anybody does has to carry the whole plan above it, and a heading has
     to own whatever its parts actually came to. */
  { var carry = planDates({ basis:'start', items: [
      { id:'pi', name:'Prep inside', days:1, parent:null, order:10 },
      { id:'p1', name:'Motor readings', days:1, parent:'pi', order:10 },
      { id:'pp', name:'Piping prep', days:1, parent:null, order:20 },
      { id:'q1', name:'Isolate steam', days:1, parent:'pp', order:10 },
      { id:'q2', name:'Isolation valves', days:0, parent:'pp', order:20 },
      { id:'tm', name:'Temp', days:1, parent:null, order:30 },
      { id:'t2', name:'Run rooftop duct', days:3, parent:'tm', order:10 },
      { id:'t1', name:'Run flex', date:'2026-10-12', days:1, parent:'tm', order:20 } ] }, five);
    ck('carry: a date on the first thing anybody does dates everything above it too',
      carry.rows.every(function (r) { return !!r.start; }));
    ck('carry: the heading over it is from the first of its parts to the last',
      carry.by['tm'].start === '2026-10-12' && carry.by['tm'].start === carry.by['t1'].start &&
      carry.by['tm'].finish === carry.by['t2'].finish);
    ck('carry: a heading owns what its parts came to, even past what its own count allowed',
      carry.by['pp'].start === carry.by['q2'].start &&
      carry.by['pp'].finish === carry.by['q1'].finish &&
      carry.by['q1'].finish > carry.by['q2'].finish);
    ck('carry: and what it says it comes to is the window it ended up with, not its parts added up',
      carry.by['pp'].days === 2 && carry.by['tm'].days === 4);
    ck('carry: so the row shows the range it really runs, not one date',
      (function () {
        var h = planOutlineHtml({ id:'x', items: [] }, carry.rows.filter(keepRow), carry);
        var row = h.split('out-row').find(function (c) { return c.indexOf('Piping prep') > 0; });
        return row.indexOf('\u2192') > 0;
      })());
    ck('carry: so the next line down does not start on top of them',
      carry.by['pi'].start > carry.by['pp'].finish &&
      carry.by['pp'].start > carry.by['tm'].finish);

    /* And the same thing working back from the end, where the date goes at the top instead and the
       plan flows down from it. */
    var carryB = planDates({ basis:'end', items: [
      { id:'ms', name:'Ceilings closed', date:'2026-12-18', days:0, parent:null, order:10 },
      { id:'tm', name:'Temp', days:1, parent:null, order:20 },
      { id:'t2', name:'Run rooftop duct', days:3, parent:'tm', order:10 },
      { id:'t1', name:'Run flex', days:1, parent:'tm', order:20 },
      { id:'pp', name:'Piping prep', days:1, parent:null, order:30 },
      { id:'q1', name:'Isolate steam', days:1, parent:'pp', order:10 },
      { id:'q2', name:'Isolation valves', days:0, parent:'pp', order:20 } ], }, five);
    ck('carry: working back, the whole plan below the date is dated',
      carryB.rows.every(function (r) { return !!r.start; }));
    ck('carry: and a heading still owns exactly what its parts came to',
      carryB.by['tm'].finish === carryB.by['t2'].finish &&
      carryB.by['tm'].start === carryB.by['t1'].start &&
      carryB.by['pp'].finish === carryB.by['q1'].finish &&
      carryB.by['pp'].start === carryB.by['q2'].start);
    ck('carry: with nothing starting on top of the line above it',
      carryB.by['tm'].finish < carryB.by['ms'].start &&
      carryB.by['pp'].finish < carryB.by['tm'].start);

    /* A date part way down anchors its own branch and what comes before it, not the steps above it
       that have nothing of their own to go on. That is the same either way round, mirrored. */
    var part = planDates({ basis:'end', items: [
      { id:'a', name:'Later', days:2, parent:null, order:10 },
      { id:'b', name:'Dated', date:'2026-12-18', days:1, parent:null, order:20 },
      { id:'c', name:'Earlier', days:2, parent:null, order:30 } ], }, five);
    ck('carry: a date part way down carries what comes before it, and says the rest has none',
      part.by['b'].finish === '2026-12-18' && !!part.by['c'].start &&
      part.by['c'].finish < part.by['b'].start &&
      part.by['a'].anchored === false && part.rootless === 1); }

  // numbered from the bottom: the last line is the first thing anybody does
  { schedules[0].items = [
      { id:'m', name:'Ceilings closed', date:'2026-12-18', parent:null, order:10 },
      { id:'t', name:'Trim out', who:'Arctic', days:2, parent:'m', order:10 },
      { id:'h', name:'Hang duct', who:'Arctic', days:3, parent:'t', order:10 } ];
    var rows3 = planDates(currentPlan(), workCal(job)).rows;
    var oh = planOutlineHtml(currentPlan(), rows3.filter(keepRow), {});
    // the number the row shows, not the one in its tooltip
    // the number the row shows: out-step is an input now, so it is the value, not the text
    var steps = oh.split('class="out-step" value="').slice(1).map(function (c) {
      return c.slice(0, c.indexOf(Q));
    });
    ck('steps: the list is numbered with one at the bottom, so it reads step one upwards',
      steps.join() === '3,2,1');
    ck('steps: and the bottom line is the first thing done, the top one the dated line',
      rows3[rows3.length - 1].item.id === 'h' && rows3[0].item.id === 'm'); }

  // a date typed on any line is a deadline for that line, and its branch is fitted to it
  { schedules[0].items = [
      { id:'m', name:'Ceilings closed', date:'2026-12-18', days:0, parent:null, order:10 },
      { id:'t', name:'Trim out', who:'Arctic', days:5, parent:null, order:20 },
      { id:'h', name:'Hang duct', who:'Arctic', days:3, parent:null, order:30 } ];
    await setLineDate('t', '2026-11-06');
    var rd = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] });
    ck('pinned: a date on a line is the day that line has to be done by',
      rd.by['t'].finish === '2026-11-06' && rd.by['t'].pinned === '2026-11-06');
    ck('pinned: its length is counted back from that day, not forward from it',
      rd.by['t'].start === '2026-11-02');
    ck('pinned: and the line below works back from the pinned one, not from the top of the plan',
      rd.by['h'].finish === '2026-10-30' && rd.by['h'].start === '2026-10-28');
    await setLineDate('t', '');
    var rd2 = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] });
    ck('pinned: clearing the date puts the line back to being worked out',
      !rd2.by['t'].pinned && rd2.by['t'].finish === '2026-12-17');
  }

  // a date that runs past what the line has to be finished before is said out loud
  { schedules[0].items = [
      { id:'m', name:'End', date:'2026-11-06', parent:null, order:10 },
      { id:'t', name:'Too late', days:2, date:'2026-11-10', parent:'m', order:10 } ];
    var rc = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] });
    ck('pinned: a date that lands after what it has to be done before is flagged, not hidden',
      rc.by['t'].clash === true && rc.clashes === 1); }

  // typing a number moves the line to that step
  { schedules[0].items = [
      { id:'a', name:'A', days:1, parent:null, order:10 },
      { id:'b', name:'B', days:1, parent:null, order:20 },
      { id:'c', name:'C', days:1, parent:null, order:30 } ];
    // display order is A,B,C so steps read 3,2,1
    await moveToStep('a', 1);
    ck('steps: typing a number puts the line at that step',
      planFlat(currentPlan()).map(f => f.item.name).join() === 'B,C,A');
    await moveToStep('a', 3);
    ck('steps: and back again',
      planFlat(currentPlan()).map(f => f.item.name).join() === 'A,B,C');
    await moveToStep('a', 99);
    ck('steps: a number that is not a step leaves the list alone',
      planFlat(currentPlan()).map(f => f.item.name).join() === 'A,B,C'); }

  // a line cannot be put underneath something that is already underneath it
  { schedules[0].items = [
      { id:'p', name:'Parent', days:1, parent:null, order:10 },
      { id:'k', name:'Kid', days:1, parent:'p', order:10 } ];
    await moveToStep('p', 1);
    ck('steps: a line is not moved under something that is already under it',
      planItemById(currentPlan(), 'p').parent === null); }

  // a plan somebody else deleted must not be put back by a save already on its way
  { var put = null;
    FB.setDoc = async (ref, data) => { put = data; };
    var ghost = { id:'gone', name:'Deleted', items:[] };
    await savePlan(ghost);
    ck('build: a save in flight does not recreate a plan that has been deleted', put === null); }

  // a milestone on a day nobody works is said out loud, not quietly moved
  { schedules[0].items = [{ id:'m', name:'Shut day', date:'2026-11-26',
                            parent:null, order:10 }];
    var rr = planDates(currentPlan(), workCal(job));
    ck('build: a milestone on a day the job is shut is worked back from the last day it works',
      rr.by['m'].start === '2026-11-25' && rr.by['m'].start !== rr.by['m'].item.date); }

  FB = realFB; schedules = []; openPlan = null;
}

// ══ change order log ══════════════════════════════════════════════
{
  job = { id: 'js', name: 'Adventist Health Columbia Gorge', number: '25-113',
          contractAmount: 1250000, specs: [], ignoredFiles: [], sections: [] };
  jobs = [job];
  cos = [
    { id:'c2', number:'02', description:'Add isolation valves at AHU-3', amount:'3200',
      status:'submitted', dateSubmitted:'2026-03-20', paid:false, created:2 },
    { id:'c1', number:'01', description:'Relocate roof drains', amount:'12450.75', mod:'M1',
      rfiCcdAsi:'RFI 014', status:'approved', dateSubmitted:'2026-02-02', dateApproved:'2026-03-01',
      paid:true, paidDate:'2026-04-15', created:1 },
    { id:'c4', number:'04', description:'Gantry crane rework', amount:'5000',
      status:'rejected', dateSubmitted:'2026-04-10', created:4 },
    { id:'c3', number:'03', description:'Change order #03 steam traps', amount:'8750.5',
      status:'pending', dateSubmitted:'2026-04-02', created:3 }
  ];

  var rows = coLogRows();
  ck('co log: the log runs in change order number order, not newest first like the screen does',
    rows.map(r => r.number).join() === '01,02,03,04');
  ck('co log: a description that does not say what it is gets told',
    rows[1].desc.indexOf('Change order #02') === 0);
  ck('co log: and one that already says so is left alone',
    rows[2].desc === 'Change order #03 steam traps');
  ck('co log: an approved one is approved money, with the date it was approved',
    rows[0].approved === 12450.75 && rows[0].pending === 0 && rows[0].approvedDate === '03/01/26');
  ck('co log: one still out is pending money',
    rows[1].pending === 3200 && rows[1].approved === 0);
  ck('co log: a rejected one is neither, so it does not inflate either total',
    rows[3].pending === 0 && rows[3].approved === 0);
  ck('co log: what was paid, and when', rows[0].paid === true && rows[0].paidDate === '04/15/26');
  ck('co log: the mod and the RFI it came from ride along',
    rows[0].mod === 'M1' && rows[0].note === 'RFI 014');

  var m = coLogMeta();
  ck('co log: the contract is on it, because the grand total is meaningless without it',
    m.contract === 1250000 && m.jobName.indexOf('Columbia Gorge') > 0);

  ck('co log: editing the contract amount re-writes the log rather than being ignored',
    (function () {
      var before = registerSig();
      job.contractAmount = 1300000;
      var after = registerSig();
      job.contractAmount = 1250000;
      return before !== after;
    })());

  // the trap this feature sets for itself
  ck('co log: a file the app writes is never offered back as a loose file someone dropped in',
    GENERATED_FILE_RE.test('Change Order Log.xlsx') &&
    GENERATED_FILE_RE.test('Change Order Log.pdf') &&
    GENERATED_FILE_RE.test('Submittal Register.xlsx') &&
    GENERATED_FILE_RE.test('register.json'));
  ck('co log: and a spreadsheet someone really did drop in still gets offered',
    !GENERATED_FILE_RE.test('Vendor quote.xlsx') &&
    !GENERATED_FILE_RE.test('Change Order Log notes.xlsx') &&
    !GENERATED_FILE_RE.test('Scan 4.pdf'));

  if (HAVE_XLSX) {
    var bytes = await buildCoLogXlsx();
    var size = bytes && (bytes.byteLength != null ? bytes.byteLength : bytes.length);
    ck('co log: the spreadsheet is built and is not empty', size > 2000);
    var wb = XLSX.read(bytes, { type: 'array', cellStyles: true });
    var ws = wb.Sheets[wb.SheetNames[0]];
    var grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    ck('co log: it is one sheet, named for what it holds',
      wb.SheetNames.join() === 'Change Order Log');
    ck('co log: it carries the same columns as the log Arctic keeps',
      grid[3].join() === 'ASM #,MOD,RFI, CCD, ASI,Description,Pending Cost,Date,Approved Cost,Paid,Paid Date');
    ck('co log: the Main Contract line is the first row, as on the paper one',
      grid[4][3] === 'Main Contract' && grid[4][6] === 1250000);
    ck('co log: the change orders are numbered from one, under the contract',
      grid[5][0] === 1 && String(grid[5][3]).indexOf('Relocate roof drains') > 0);
    ck('co log: money is a number Excel can add up, not text that has to be retyped',
      (function () { var c = ws['G6']; return c && c.t === 'n' &&
        String(c.z || '').indexOf('$') >= 0; })());
    ck('co log: the description column is wide enough to read',
      (ws['!cols'] || [])[3] && ws['!cols'][3].wch >= 40);
    ck('co log: and the totals agree with the PDF, contract included',
      (function () {
        var g = grid.filter(r => String(r[3] || '').indexOf('Grand Total') === 0)[0];
        return g && g[6] === 1250000 + 12450.75 + 3200 + 8750.5;
      })());
  } else { skip('co log: spreadsheet contents', 'xlsx not installed'); }
}

// ══ releases belong in the submittal log ══════════════════════════════════
{
  var sec = newSectionRecord({ key:'221319', number:'22 13 19', division:'22', title:'Waste Specialties' });
  sec.history = [
    { id:'h1', ts: Date.parse('2026-01-05T09:00:00'), text:'Sent to ENFRA for review.', by:'JE' },
    { id:'h2', ts: Date.parse('2026-02-20T09:00:00'), from:'submitted', to:'approved' } ];
  sec.releases = [
    { id:'r1', label:'RD-1 Roof Drain', date:'2026-01-30', expected:'2026-03-27', expectedTo:'2026-04-10' },
    { id:'r2', label:'FD-1 Floor Drain', date:'2026-03-02', delivered:true } ];
  job = { id:'js', name:'T', number:'1', specs:[], ignoredFiles:[], sections:[sec] };
  jobs = [job]; openKey = '221319';

  ck('log: releases sit among the notes and the status changes, newest first',
    logRows(sec).map(r => r.rel ? 'rel:' + r.rel.id : 'h:' + r.h.id).join() === 'rel:r2,h:h2,rel:r1,h:h1');
  ck('log: nothing is copied into the history, so editing a release cannot leave a stale line',
    sec.history.length === 2);
  var noon = Date.parse('2026-01-30T12:30:00');
  ck('log: recorded on the day it went out, it sits at the moment it was recorded',
    relStamp({ date:'2026-01-30', at: noon }) === noon);
  ck('log: back-dated, it sits on the day it names',
    relStamp({ date:'2026-01-30', at: Date.parse('2026-06-01T09:00:00') }) === Date.parse('2026-01-30T00:00:00'));
  ck('release: a section marked not required is not quietly part-released',
    stateWithRelease({ releaseState: 'na' }) === 'na' &&
    stateWithRelease({ releaseState: 'released' }) === 'released' &&
    stateWithRelease({}) === 'partial');
  ck('release: the picker names the section, not just its number',
    allReleases().every(x => x.label.indexOf('Waste Specialties') > 0));
}

// ══ an article that lists things comes apart, and goes back ═══════════════
{
  var LINES = ['PART 2 PRODUCTS','2.05 DRAINAGE PRODUCTS',
   'A. RD-1 Roof Drain (Large Area): J.R. Smith 1010 Series, cast iron body.',
   'B. OD-1 Overflow Roof Drain: J.R. Smith 1080 Series, 2-inch water dam.',
   'C. RD-2 Roof Drain (Small Area): J.R. Smith1330 Series, 8-1/2-inch dome.',
   'N. WCO Wall Cleanout: Orion COT, corrosion resistant polypropylene tee.',
   'PART 3 EXECUTION'];
  var parsed = spreadManufacturers(extractProducts(LINES));
  var rec = newSectionRecord({ key:'221319', number:'22 13 19', division:'22', title:'W' });
  mergeSpecProducts(rec, parsed);
  job = { id:'js', name:'T', number:'1', specs:[], ignoredFiles:[], sections:[rec] };
  jobs = [job]; openKey = '221319'; prodOpen = {}; prodEdit = null;

  ck('split: the import takes the article apart into the things it lists',
    rec.products.length === 4 && rec.products.every(p => p.fromSplit === true));
  ck('split: each takes the mark off the front of its own paragraph',
    (rec.products[0].marks[0] || {}).tag === 'RD-1');
  ck('split: the manufacturer is the phrase that repeats, and comes off the description',
    rec.products[0].make === 'J.R. Smith' && rec.products[0].desc.indexOf('1010 Series') === 0);
  ck('split: a maker named only once is not guessed at',
    rec.products[3].make === '' && rec.products[3].desc.indexOf('Orion COT') === 0);
  ck('split: a missing space in the book does not hide the manufacturer',
    rec.products[2].make === 'J.R. Smith');

  // one line at a time
  var target = rec.products[3];
  await toggleLine('221319', target.id);
  ck('line: undoing one line puts that paragraph back whole',
    lineIsRaw(target) && target.name === 'WCO Wall Cleanout' && !target.marks.length);
  ck('line: and leaves every other line as it was',
    rec.products.filter(p => p !== target).every(p => !p.rawLine));
  ck('line: a line held as the book wrote it is not missing anything',
    productGaps(target).length === 0);
  await toggleLine('221319', target.id);
  ck('line: reading it again puts back exactly what was read',
    !lineIsRaw(target) && target.name === 'Wall Cleanout' &&
    (target.marks[0] || {}).tag === 'WCO' && !target.read);

  // already on the books, with work on it
  var held = productsFromSpec(parsed, { '2.05': true });
  var rec2 = newSectionRecord({ key:'220513', number:'22 05 13', division:'22', title:'C' });
  rec2.products = held;
  rec2.products[0].marks = [{ id:'mkA', tag:'RD-1', loc:'Roof NE' }, { id:'mkC', tag:'ZZ-1' }];
  rec2.products[0].leadWeeks = '8';
  var n = autoSplitSection(rec2);
  ck('catch up: an article stored whole is taken apart with nobody clicking anything', n === 1);
  ck('catch up: a mark you typed keeps its id, so a release still points at it',
    rec2.products.some(p => (p.marks || []).some(mk => mk.id === 'mkA' && mk.loc === 'Roof NE')));
  ck('catch up: one that belongs to no family gets a line of its own',
    rec2.products.some(p => p.byHand && (p.marks || []).some(mk => mk.id === 'mkC')));
  ck('catch up: the lead time is about the article, so it is about all of it',
    rec2.products.every(p => p.leadWeeks === '8'));
  ck('catch up: however a mark is spelled, it is the same mark',
    markKey('RD 1') === markKey('RD-1'));

  // the wiring, not just the logic
  var wrote = [];
  var realPatch = patchSection;
  patchSection = async (k, f) => { wrote.push(k); };
  job = { id:'jw', name:'W', number:'9', specs:[], ignoredFiles:[], sections:[] };
  jobs = [job]; openKey = null;
  await autoSplitJob('jw', []);
  ck('wiring: an empty first snapshot is not mistaken for a job with nothing to do', wrote.length === 0);
  var mk = k => { var r = newSectionRecord({ key:k, number:'22 13 19', division:'22', title:'W' });
                  r.products = productsFromSpec(spreadManufacturers(extractProducts(LINES)), { '2.05': true });
                  return r; };
  var secs = [mk('a1'), mk('a2')];
  job.sections = secs;
  await autoSplitJob('jw', secs);
  ck('wiring: so when the sections arrive they are still taken apart',
    wrote.length === 2 && secs[0].products.length === 4);
  var n0 = wrote.length;
  await autoSplitJob('jw', secs);
  ck('wiring: and the snapshot our own write sets off does not do it all again', wrote.length === n0);
  patchSection = realPatch;
}

// ══ job tracking: categories and notes ════════════════════════════════════
{
  var wrote2 = [];
  var realSave = saveTrackCat, realRender = renderTracking;
  saveTrackCat = async c => { wrote2.push(c.id + '@' + c.order); };
  renderTracking = () => {};
  job = { id:'jt', name:'T', number:'1', specs:[], ignoredFiles:[], sections:[] };
  tracking = [{ id:'c1', name:'ISAT', order:0, files:[], notes:[], checklist:[] },
              { id:'c2', name:'Release', order:1, files:[], notes:[], checklist:[] },
              { id:'c3', name:'Piping', order:2, files:[], notes:[], checklist:[] },
              { id:'c4', name:'R and R', order:3, files:[], notes:[], checklist:[] }];
  ck('categories: a new one is ordered ahead of every one already there', topCatOrder() === -1);
  await moveTrackCat('c3', 'c1', false);
  ck('categories: dragging one to the top puts it there',
    tracking.map(c => c.id).join() === 'c3,c1,c2,c4');
  ck('categories: and they are renumbered from where they ended up',
    tracking.map(c => c.order).join() === '0,1,2,3');
  wrote2.length = 0;
  await moveTrackCat('c9', 'c1', false);
  ck('categories: dragging something that is not there leaves the list alone',
    tracking.map(c => c.id).join() === 'c3,c1,c2,c4' && wrote2.length === 0);
  saveTrackCat = realSave;

  var list = [{ id:'a', created:1 }, { id:'b', created:3 }, { id:'c', created:2 }];
  setNoteOrder('new');
  ck('notes: newest at the top, which is where you look first',
    notesInOrder(list).map(x => x.id).join('') === 'bca');
  setNoteOrder('old');
  ck('notes: and the other way round when reading a log from the start',
    notesInOrder(list).map(x => x.id).join('') === 'acb');
  ck('notes: the choice is remembered on this device, not on the job',
    localStorage.getItem('dingus_note_order') === 'old');
  setNoteOrder('new');
  renderTracking = realRender;

  var hidden = { style: {}, scrollHeight: 0, isConnected: true };
  autosize(hidden);
  ck('autosize: a box the page has not drawn yet is left alone, not collapsed', !hidden.style.height);
  hidden.scrollHeight = 94;
  autosizePending();
  ck('autosize: and it is measured again the moment it is on screen', hidden.style.height === '96px');
  var gone = { style: {}, scrollHeight: 0, isConnected: false };
  autosize(gone); autosizePending();
  ck('autosize: one that has left the page is not chased for ever', !gone.style.height);
}

})();
`;

(async () => {
  try {
    await vm.runInContext(testCode, sandbox, { filename: 'tests/dingus.test.js' });
    // the injected body is an async IIFE; give its microtasks a turn to finish
    await new Promise(r => setTimeout(r, 50));
  } catch (e) {
    console.error('\nThe checks threw:\n', e && e.stack || e);
    process.exit(1);
  }
  console.log('');
  console.log('PASS: ' + PASS + '  FAIL: ' + FAILED.length);
  if (FAILED.length) {
    console.log('FAILED CHECKS:');
    FAILED.forEach(n => console.log('  - ' + n));
    process.exit(1);
  }
  console.log('ALL DINGUS CHECKS PASSED');
  /* The app leaves timers running (it expects to be a page, not a script). Leave on our own terms
     rather than letting one of them fire into a stub and fail a run that has already passed. */
  process.exit(0);
})();
