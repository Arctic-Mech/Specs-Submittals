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
  /* The tree reads downwards: a line sits under what it has to happen before.
       Ceilings closed            <- milestone
         Trim out
           Hang duct
             Duct on site
             Hangers in           <- two things the duct work waits on   */
  var plan = { id:'p1', name:'L3', items: [
    { id:'m', name:'Ceilings closed', date:'2026-12-18', who:'GC', parent:null, order:10 },
    { id:'t', name:'Trim out',   who:'Arctic', days:5,  parent:'m', order:10 },
    { id:'h', name:'Hang duct',  who:'Arctic', days:10, parent:'t', order:10 },
    { id:'d', name:'Duct on site', who:'Supply', days:1, parent:'h', order:10 },
    { id:'g', name:'Hangers in', who:'Arctic', days:4,  parent:'h', order:20 }
  ]};

  var fl = planFlat(plan);
  ck('outline: it reads top to bottom, each line indented under what it comes before',
    fl.map(f => f.item.id).join() === 'm,t,h,d,g' &&
    fl.map(f => f.depth).join() === '0,1,2,3,3');

  var r = planDates(plan, five);
  ck('pull: the milestone keeps the date you typed', r.by['m'].start === '2026-12-18');
  ck('pull: what sits under it finishes the working day before, and starts its duration before that',
    r.by['t'].finish === '2026-12-17' && r.by['t'].start === '2026-12-11');
  ck('pull: and so on down the tree',
    r.by['h'].finish === '2026-12-10' && r.by['h'].start === '2026-11-27');
  ck('pull: lines under one run one after another, in the order they are numbered',
    r.by['d'].finish === '2026-11-26' && r.by['d'].start === '2026-11-26' &&
    r.by['g'].finish === '2026-11-25');
  ck('pull: so the bottom one is step one and happens first',
    r.by['g'].start === '2026-11-20' && r.by['g'].start < r.by['d'].start);
  ck('pull: nothing is behind when the milestone is a year out', r.behind === 0);

  var r4 = planDates(plan, four);
  ck('pull: a milestone on a day the job does not work pulls back to the last day it does',
    r4.by['m'].start === '2026-12-17');
  ck('pull: and on four tens everything underneath starts earlier',
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

    ck('place: everything else on the plan is offered, and never the line itself',
      needCandidates(currentPlan(), duct.id).length === 4 &&
      !needCandidates(currentPlan(), duct.id).some(x => x.id === duct.id));

    await toggleNeed(duct.id, hang.id);
    await toggleNeed(duct.id, pipe.id);
    var fl2 = planFlat(currentPlan());
    ck('place: ticking two moves them under it \u2014 moved, not copied',
      fl2.length === 5 &&
      fl2.filter(f => f.item.parent === duct.id).length === 2 &&
      fl2.find(f => f.item.id === hang.id).depth === 1);

    ck('place: what is already under it comes up ticked, and a line cannot wait on its own parent',
      !needCandidates(currentPlan(), hang.id).some(x => x.id === duct.id));

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

  // the picker: in the order the work happens, numbered the way the outline numbers it
  { schedules[0].items = [
      { id:'a', name:'Zulu', days:1, parent:null, order:10 },
      { id:'b', name:'Alpha', days:1, parent:null, order:20 },
      { id:'c', name:'Mike', days:1, parent:null, order:30 } ];
    var ph = needsPickerHtml(currentPlan(), 'a');
    var order = ph.split('pick-row').slice(1).map(function (c) {
      var i = c.indexOf('pick-step'); var gt = c.indexOf('>', i); var lt = c.indexOf('<', gt);
      return c.slice(gt + 1, lt).trim();
    });
    ck('picker: the lines are offered in step order, not alphabetically',
      order.join() === '1,2');
    ck('picker: and each carries the step number the outline gives it',
      ph.indexOf('pick-step') > 0);
    ck('picker: it asks what needs to happen first',
      ph.indexOf('What needs to happen first') > 0);
    ck('picker: and the way to name something not on the plan is there without having to type first',
      ph.indexOf('id="pickKind"') > 0 && ph.indexOf('weeks lead') > 0 &&
      ph.indexOf('pick-new" id="pickNew"') > 0); }

  // something not on the list: a submittal or an order with a lead time
  { schedules[0].items = [
      { id:'m', name:'Install TUs', date:'2026-11-02', days:0, parent:null, order:10 } ];
    __stubEl('pickQ', { value: "Release TU's" });
    __stubEl('pickKind', { value: 'order' });
    __stubEl('pickWeeks', { value: '4' });
    await addNeedNew('m');
    __stubEl('pickQ', null); __stubEl('pickKind', null); __stubEl('pickWeeks', null);
    var made = planItems(currentPlan()).find(x => x.name.indexOf('Release') === 0);
    ck('holding: something not on the list goes on the plan as a line of its own',
      !!made && made.parent === 'm' && made.kind === 'order');
    ck('holding: four weeks of lead is four weeks of working days on this job',
      made.days === 4 * workCal(job).days.length);
    var rl = planDates(currentPlan(), workCal(job));
    ck('holding: so it has to be started four calendar weeks before the line it holds up',
      rl.by[made.id].start === '2026-10-05' &&        // the parent starts Nov 2
      rl.by[made.id].finish === '2026-10-29');        // the working day before it
    ck('holding: and it is dated, so it turns up in the calendar and the list with the rest',
      rl.by[made.id].anchored === true); }

  { var cal4 = { days:[1,2,3,4], holidays:[] };
    ck('holding: four weeks is still four weeks on a job running four tens',
      weeksToDays(4, cal4) === 16 && weeksToDays(4, { days:[1,2,3,4,5], holidays:[] }) === 20); }

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

  // a date typed on any line pins it, and what sits under it works back from there
  { schedules[0].items = [
      { id:'m', name:'Ceilings closed', date:'2026-12-18', parent:null, order:10 },
      { id:'t', name:'Trim out', who:'Arctic', days:5, parent:'m', order:10 },
      { id:'h', name:'Hang duct', who:'Arctic', days:3, parent:'t', order:10 } ];
    await setLineDate('t', '2026-11-02');
    var rd = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] });
    ck('pinned: a date typed on a line is where that line goes',
      rd.by['t'].start === '2026-11-02' && rd.by['t'].pinned === '2026-11-02');
    ck('pinned: its duration runs forward from that date, not back from what it feeds',
      rd.by['t'].finish === '2026-11-06');
    ck('pinned: and what sits under it is worked back from the date, not from the line above',
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
