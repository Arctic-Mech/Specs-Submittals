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

// ══ the pull plan: one list, cut into sections by stars ════════════════════
{
  var five = { days: [1,2,3,4,5], holidays: [] };
  var four = { days: [1,2,3,4],   holidays: [] };
  /* A plan is one list read bottom to top \u2014 the line at the foot is the first thing anybody does.
     A starred line is a section and owns every line below it until the next starred line. */
  var mk = function (basis, items) { return { id:'p', name:'P', basis: basis, items: items }; };
  var L = function (id, name, days, order, extra) {
    return Object.assign({ id:id, name:name, who:'Arctic', days:days, order:order }, extra || {});
  };
  var plan = mk('start', [
    L('demo', 'Demo', 0, 10, { main:true }),
    L('d1', 'Demo piping', 2, 20),
    L('d2', 'Demo duct', 3, 30),
    L('prep', 'Prep inside', 0, 40, { main:true }),
    L('s3', 'Motor readings', 1, 50),
    L('s2', 'Open CMU wall', 4, 60),
    L('s1', 'Set steel', 2, 70, { date:'2026-10-12' })
  ]);

  var r = planDates(plan, five);
  ck('flat: the page reads as sections with their work under them, and nothing deeper',
    planFlat(plan).map(function (f) { return f.item.id + '@' + f.depth; }).join() ===
      'demo@0,d1@1,d2@1,prep@0,s3@1,s2@1,s1@1');
  ck('flat: a section is not a step \u2014 the numbers count the work, bottom first',
    [r.by['s1'], r.by['s2'], r.by['s3'], r.by['d2'], r.by['d1']].map(function (x) { return x.step; })
      .join() === '1,2,3,4,5' && r.by['demo'].step === '' && r.by['prep'].step === '');
  ck('flat: the run goes up the page from the line that carries the date',
    r.by['s1'].start === '2026-10-12' && r.by['s2'].start > r.by['s1'].finish &&
    r.by['s3'].start > r.by['s2'].finish && r.by['d2'].start > r.by['s3'].finish &&
    r.by['d1'].start > r.by['d2'].finish);

  /* The complaint this was built for: a section tallied everything under it and did not stop. */
  ck('sections: a section tallies its own lines and stops at the next star',
    r.by['prep'].days === 7 && r.by['demo'].days === 5);
  ck('sections: and spans them, first of them to last',
    r.by['prep'].start === r.by['s1'].start && r.by['prep'].finish === r.by['s3'].finish &&
    r.by['demo'].start === r.by['d2'].start && r.by['demo'].finish === r.by['d1'].finish);
  ck('sections: it owns exactly the lines between it and the next star',
    r.by['prep'].kids === 3 && r.by['demo'].kids === 2);

  /* Starring a line part way down cuts the section there. */
  { var cut = mk('start', plan.items.map(function (x) {
      return x.id === 's2' ? Object.assign({}, x, { main:true, days:0 }) : Object.assign({}, x); }));
    var rc = planDates(cut, five);
    ck('sections: starring a line part way down ends the section above it there',
      rc.by['prep'].kids === 1 && rc.by['prep'].days === 1 &&
      rc.by['s2'].kids === 1 && rc.by['s2'].days === 2); }

  /* And it comes off again, which it would not before. */
  { var off = mk('start', plan.items.map(function (x) { return Object.assign({}, x); }));
    schedules = [off]; openPlan = 'p';
    await toggleMain('prep');
    ck('sections: a star comes off, and the lines fall to the section above',
      !planItemById(currentPlan(), 'prep').main &&
      planDates(currentPlan(), five).by['demo'].kids === 6);
    await toggleMain('prep');
    ck('sections: and goes back on',
      planItemById(currentPlan(), 'prep').main === true &&
      planDates(currentPlan(), five).by['demo'].kids === 2); }

  /* An older plan was a tree. It is flattened once, in the order it was already read in. */
  { var old = { id:'old', name:'O', basis:'start', items: [
      { id:'h', name:'Demo', days:0, parent:null, order:10 },
      { id:'x', name:'Demo piping', days:2, parent:'h', order:10 },
      { id:'y', name:'Demo duct', days:3, parent:'h', order:20 },
      { id:'z', name:'On its own', days:1, parent:null, order:20 } ] };
    var ro = planDates(old, five);
    ck('flatten: what had work under it becomes a section, and the order is the one it was read in',
      old.items.map(function (i) { return i.id; }).join() === 'h,x,y,z' &&
      planItemById(old, 'h').main === true && !planItemById(old, 'x').parent &&
      ro.by['h'].kids === 3);        // a top line with no star above it falls into the section
    ck('flatten: it only happens once', flattenPlan(old) === false && old.flat === 1); }

  /* Doing several things at once: tick as many as you like, then Done. */
  { schedules = [mk('start', [
      L('sec', 'Prep', 0, 10, { main:true }),
      L('a', 'Set steel', 2, 20, { date:'2026-10-12' }),
      L('b', 'Open wall', 4, 30),
      L('c', 'Motor readings', 1, 40),
      L('d', 'Balance', 3, 50) ])];
    openPlan = 'p'; planSel = [];
    tapPair('b'); tapPair('c'); tapPair('d');
    ck('together: ticking is only ticking \u2014 nothing is grouped until Done',
      planSel.length === 3 && !planItemById(currentPlan(), 'b').alongside);
    await doneSel();
    var g = planDates(currentPlan(), five);
    ck('together: Done puts all of them in one step, however many there are',
      [g.by['b'].step, g.by['c'].step, g.by['d'].step].sort().join() === '1,1a,1b' &&
      planSel.length === 0);
    ck('together: they are the same days and the one length they share',
      g.by['b'].start === g.by['d'].start && g.by['b'].finish === g.by['d'].finish &&
      g.by['b'].days === g.by['c'].days);
    ck('together: and the step above them follows the slot, not each of them',
      g.by['a'].step === '2' && g.by['a'].start > g.by['d'].finish);

    /* Adding a fourth to a group that is already there. */
    planSel = [];
    tapPair('a'); tapPair('b');
    await doneSel();
    var g2 = planDates(currentPlan(), five);
    ck('together: ticking a new line and any one of a group puts the lot together',
      ['a','b','c','d'].map(function (k) { return g2.by[k].step; }).sort().join() === '1,1a,1b,1c');

    /* And out again. */
    await clearMate('c');
    var g3 = planDates(currentPlan(), five);
    ck('together: taking one back out leaves the rest of the group alone',
      !planItemById(currentPlan(), 'c').alongside &&
      ['a','b','d'].every(function (k) { return String(g3.by[k].step).charAt(0) === String(g3.by['a'].step).charAt(0); })); }

  /* They have to be in one section. */
  { schedules = [mk('start', [
      L('s1x', 'Demo', 0, 10, { main:true }), L('m1', 'Demo piping', 2, 20),
      L('s2x', 'Prep', 0, 30, { main:true }), L('m2', 'Set steel', 2, 40) ])];
    openPlan = 'p'; planSel = [];
    tapPair('m1'); tapPair('m2');
    await doneSel();
    ck('together: two lines in different sections are refused, and nothing is changed',
      !planItemById(currentPlan(), 'm1').alongside && !planItemById(currentPlan(), 'm2').alongside);
    planSel = []; }

  /* Dragging: onto a section puts it in that section. */
  { schedules = [mk('start', [
      L('aa', 'Demo', 0, 10, { main:true }), L('bb', 'Demo piping', 2, 20),
      L('cc', 'Prep', 0, 30, { main:true }), L('dd', 'Set steel', 2, 40) ])];
    openPlan = 'p';
    await moveLineTo('dd', 'aa', 'into');
    var rd = planDates(currentPlan(), five);
    ck('drag: dropped on a section it goes into that section',
      rd.by['aa'].kids === 2 && rd.by['cc'].kids === 0 &&
      planTree(currentPlan()).sectionOf['dd'] === 'aa');
    await moveLineTo('dd', 'cc', 'below');
    ck('drag: dropped below a section header it is back in that one',
      planTree(currentPlan()).sectionOf['dd'] === 'cc'); }

  /* The row: a star, a tick that does the grouping, and a check mark of its own for done. */
  { schedules = [mk('start', [
      L('sx', 'Demo', 0, 10, { main:true }), L('lx', 'Demo piping', 2, 20, { date:'2026-10-12' }) ])];
    openPlan = 'p'; planSel = [];
    var rr2 = planDates(currentPlan(), five);
    var hh = planOutlineHtml(currentPlan(), rr2.rows.filter(keepRow), rr2);
    var rowOf = function (nm) {
      return hh.split('out-row').filter(function (c) { return c.indexOf(nm) > 0; })[0] || '';
    };
    ck('row: a section carries a lit star and a star in place of a step number',
      rowOf('"Demo"').indexOf('star on') > 0 && rowOf('"Demo"').indexOf('out-step is-sec') > 0);
    ck('row: and is banded as a heading, with no whose on it',
      rowOf('"Demo"').indexOf('is-head') > 0 &&
      rowOf('"Demo"').indexOf('out-who is-none') > 0);
    ck('row: the tick makes the groups and the check mark crosses off, and they are not the same',
      rowOf('Demo piping').indexOf("tapPair('lx')") > 0 &&
      rowOf('Demo piping').indexOf("togglePlanDone('lx')") > 0 &&
      rowOf('Demo piping').indexOf('out-done') > 0);
    ck('row: nothing offers to indent, because there is nothing to indent',
      hh.indexOf('indentLine') < 0 && hh.indexOf('Shift+Tab') < 0);
    planSel = ['lx'];
    var hh2 = planOutlineHtml(currentPlan(), rr2.rows.filter(keepRow), rr2);
    ck('row: ticked lines say how many are ticked and offer Done',
      hh2.indexOf('1 line ticked') > 0 && hh2.indexOf('doneSel()') > 0);
    planSel = []; }

  /* Lead time still has to land before the work it holds up. */
  { schedules = [mk('start', [
      L('ls', 'Temp', 0, 10, { main:true }),
      L('lw', 'Hang units', 2, 15, { date:'2026-11-02' }),
      L('lo', 'Order units', 28, 20, { kind:'order', who:'' }) ])];
    openPlan = 'p';
    var rl = planDates(currentPlan(), five);
    ck('order: something on order takes no step and is not counted into the section',
      rl.by['lo'].step === '' && rl.by['lo'].lead === true && rl.by['ls'].days === 2);
    ck('order: it lands its lead time before the line above it, counted in plain days',
      rl.by['lo~by'].start === dShift(rl.by['lw'].start, -28) &&
      rl.by['lo~by'].start === rl.by['lo~by'].finish); }

  /* A length typed on a section is the length of that block, and what follows it moves. */
  /* The page reads bottom to top, so the section that comes after Temp is the one above it. */
  { var blk = function (secDays) { return mk('start', [
      L('demo', 'Demo', 0, 5, { main:true }), L('d1', 'Demo piping', 3, 8),
      L('temp', 'Temp', secDays, 10, { main:true, date:'2026-10-12' }),
      L('t2', 'Run rooftop duct', 8, 20), L('t1', 'Open OSA shaft', 1, 30) ]); };
    var loose = planDates(blk(0), five);
    ck('section length: with nothing typed, the block is as long as its lines come to',
      loose.by['temp'].days === 9 && loose.by['temp'].start === '2026-10-12' &&
      loose.by['temp'].slack === null);
    var set12 = planDates(blk(12), five);
    ck('section length: typing a length makes the block that long, off its own date',
      set12.by['temp'].days === 12 && set12.by['temp'].start === '2026-10-12' &&
      set12.by['temp'].finish === addWorkDays('2026-10-12', 11, five));
    ck('section length: and everything after it is based on that, not on its last line',
      set12.by['demo'].start > set12.by['temp'].finish &&
      set12.by['demo'].start > loose.by['demo'].start);
    ck('section length: the row says how it compares with what the lines come to',
      set12.by['temp'].slack === 3 &&
      planDates(blk(4), five).by['temp'].slack === -5);
    ck('section length: a block shorter than its lines still moves what follows by what you typed',
      planDates(blk(4), five).by['demo'].start < set12.by['demo'].start); }

  /* A slot whose lead carries no length takes the longest of the lines in it. */
  { var grp = mk('start', [
      L('gs', 'Temp', 0, 10, { main:true, date:'2026-10-12' }),
      L('g3', 'Insulate', 4, 20, { alongside:'g1' }),
      L('g2', 'Run duct', 8, 30, { alongside:'g1' }),
      L('g1', 'Open shaft', 0, 40) ]);
    var rg = planDates(grp, five);
    ck('together: a group whose lead carries nothing is as long as the longest in it',
      rg.by['g1'].days === 8 && rg.by['g2'].days === 8 && rg.by['g3'].days === 8 &&
      rg.by['gs'].days === 8);
    /* And putting a group together carries the longest across, so nothing shortens quietly. */
    schedules = [mk('start', [
      L('ps', 'Temp', 0, 10, { main:true, date:'2026-10-12' }),
      L('p3', 'Insulate', 4, 20), L('p2', 'Run duct', 8, 30), L('p1', 'Open shaft', 1, 40) ])];
    openPlan = 'p'; planSel = [];
    tapPair('p1'); tapPair('p2'); tapPair('p3');
    await doneSel();
    ck('together: Done carries the longest of them onto the line holding the number',
      planItemById(currentPlan(), 'p1').days === 8 &&
      planDates(currentPlan(), five).by['p3'].days === 8);
    planSel = []; }

  /* Up and down a line at a time, instead of dragging. */
  { schedules = [mk('start', [
      L('ns', 'Temp', 0, 10, { main:true }), L('n1', 'Set units', 1, 20),
      L('n2', 'Run duct', 8, 30), L('n3', 'Open shaft', 1, 40, { date:'2026-10-12' }) ])];
    openPlan = 'p';
    var ids = function () { return planTree(currentPlan()).items.map(function (x) { return x.id; }).join(); };
    await nudgeLine('n1', 1);
    ck('arrows: down swaps it with the line below', ids() === 'ns,n2,n1,n3');
    await nudgeLine('n1', -1);
    ck('arrows: and up puts it back', ids() === 'ns,n1,n2,n3');
    ck('arrows: the top line will not go further up',
      await (async function () { var h = ids(); await nudgeLine('ns', -1); return ids() === h; })());
    ck('arrows: and the bottom line will not go further down',
      await (async function () { var h = ids(); await nudgeLine('n3', 1); return ids() === h; })());
    /* Numbered again from the top every time, so the gaps never run out and no two lines can end
       up on the same number \u2014 which is what left a line sitting where it was. */
    ck('arrows: pressing it over and over does not wear the numbers out',
      await (async function () {
        for (var k = 0; k < 40; k++) { await nudgeLine('n2', -1); await nudgeLine('n2', 1); }
        var os = planItems(currentPlan()).map(function (x) { return Number(x.order) || 0; });
        var uniq = os.filter(function (v, i) { return os.indexOf(v) === i; }).length;
        var gaps = os.slice().sort(function (a, b) { return a - b; });
        var tight = 1e9;
        for (var i = 1; i < gaps.length; i++) tight = Math.min(tight, gaps[i] - gaps[i - 1]);
        var moved = ids();
        await nudgeLine('n2', -1);
        return uniq === os.length && tight >= 1 && ids() !== moved;
      })());
    schedules = [mk('start', [
      L('ns', 'Temp', 0, 10, { main:true }), L('n1', 'Set units', 1, 20),
      L('n2', 'Run duct', 8, 30), L('n3', 'Open shaft', 1, 40, { date:'2026-10-12' }) ])];
    /* A section is a block: the lines it owns go with it, or it has not moved at all. */
    { schedules = [mk('start', [
        L('s1', 'Demo', 0, 10, { main:true }), L('w1', 'Demo piping', 2, 20),
        L('w2', 'Demo duct', 3, 30),
        L('s2', 'Mech room', 0, 40, { main:true }), L('w3', 'Set pumps', 4, 50) ])];
      openPlan = 'p';
      var tr0 = planTree(currentPlan());
      ck('arrows: a section starts out owning its own lines',
        tr0.sectionOf['w1'] === 's1' && tr0.sectionOf['w3'] === 's2');
      await nudgeLine('s2', -1);
      var tr1 = planTree(currentPlan());
      ck('arrows: moving a section takes the lines under it with it',
        ids() === 's2,w3,s1,w1,w2' &&
        tr1.sectionOf['w3'] === 's2' && tr1.sectionOf['w1'] === 's1' && tr1.sectionOf['w2'] === 's1');
      await nudgeLine('s2', 1);
      ck('arrows: and back down again, whole', ids() === 's1,w1,w2,s2,w3');
      ck('arrows: a section at the top will not climb past itself',
        await (async function () { var h = ids(); await nudgeLine('s1', -1); return ids() === h; })());
      /* An ordinary line still walks a step at a time, in and out of sections. */
      await nudgeLine('w3', -1);
      ck('arrows: an ordinary line still steps over a section heading, one at a time',
        ids() === 's1,w1,w2,w3,s2' && planTree(currentPlan()).sectionOf['w3'] === 's1'); }

    schedules = [mk('start', [
      L('ns', 'Temp', 0, 10, { main:true }), L('n1', 'Set units', 1, 20),
      L('n2', 'Run duct', 8, 30), L('n3', 'Open shaft', 1, 40, { date:'2026-10-12' }) ])];
    openPlan = 'p';
    /* A group steps as one. */
    planSel = []; tapPair('n1'); tapPair('n2'); await doneSel();
    var held = ids();
    await nudgeLine('n2', 1);
    ck('arrows: whatever runs alongside a line moves with it',
      planTree(currentPlan()).sectionOf['n1'] === planTree(currentPlan()).sectionOf['n2'] &&
      ids() !== held);
    planSel = []; }

  /* A section is not work, so it cannot also be running alongside something. */
  { schedules = [mk('start', [
      L('ms', 'Temp', 0, 10, { main:true }), L('ma', 'One', 2, 20), L('mb', 'Two', 3, 30) ])];
    openPlan = 'p'; planSel = []; tapPair('ma'); tapPair('mb'); await doneSel();
    ck('star: they are a group to start with',
      planTree(currentPlan()).leadOf['ma'] !== 'ma' || planTree(currentPlan()).leadOf['mb'] !== 'mb');
    var grouped = planItems(currentPlan()).filter(function (x) { return x.alongside; })[0];
    await toggleMain(grouped.id);
    ck('star: starring one takes it out of the group it was in',
      !grouped.alongside && grouped.main === true);
    planSel = []; }

  /* Typing a number in the step box. */
  { schedules = [mk('start', [
      L('ts', 'Temp', 0, 10, { main:true }), L('t1', 'One', 1, 20),
      L('t2', 'Two', 1, 30), L('t3', 'Three', 1, 40), L('t4', 'Four', 1, 50) ])];
    openPlan = 'p';
    var tids = function () { return planTree(currentPlan()).items.map(function (x) { return x.id; }).join(); };
    var stepOf = function (id) { return planDates(currentPlan(), five).by[id].step; };
    ck('step box: it is numbered from the foot of the page up',
      stepOf('t4') === '1' && stepOf('t1') === '4');
    await moveToStep('t1', '1');
    ck('step box: typing 1 makes it the first thing done', stepOf('t1') === '1' &&
      tids() === 'ts,t2,t3,t4,t1');
    await moveToStep('t1', '4');
    ck('step box: and typing 4 puts it back last', stepOf('t1') === '4' &&
      tids() === 'ts,t1,t2,t3,t4');
    await moveToStep('t1', '99');
    ck('step box: a number past the end goes to the end, it does not just sit there',
      stepOf('t1') === '4');
    await moveToStep('t4', '99');
    ck('step box: from the other end too', stepOf('t4') === '4' && tids() === 'ts,t4,t1,t2,t3');
    var held2 = tids();
    await moveToStep('t4', 'nonsense');
    ck('step box: something that is not a number leaves it where it is', tids() === held2); }

  /* A submittal is a date to hit, not a job with a length: a notice, counted back from the work. */
  /* A date typed on a line partway up a block used to leave everything under it blank, because the
     run had nowhere to start from until it reached the pin. It counts back from the pin instead. */
  { var bk = mk('start', [
      L('bs', 'Mech room', 0, 10, { main:true }),
      L('ba', 'Top line', 2, 20),
      L('bb', 'Middle line', 3, 30, { date:'2026-12-07' }),
      L('bc', 'Foot line', 5, 40) ]);
    var rb = planDates(bk, five);
    ck('pin: work under a date typed partway up lands before it, not nowhere',
      rb.by['bc'].start === '2026-11-30' && rb.by['bc'].finish === '2026-12-04' &&
      rb.by['bb'].start === '2026-12-07' && rb.by['ba'].start === '2026-12-10');
    ck('pin: the section stretches over the lot', rb.by['bs'].start === '2026-11-30' &&
      rb.by['bs'].finish === '2026-12-11' && rb.by['bs'].days === 10);
    ck('pin: and the typed date is hit, not shoved', rb.by['bb'].clash === false); }

  /* Put it directly under the line it has to be in for. The page reads bottom to top, so the line
     above it is the one that comes after it \u2014 six weeks before that line's date is the day. */
  { var nt = mk('start', [
      L('xs', 'Temp', 0, 10, { main:true }),
      L('x1', 'Set HWPs, HX and ADS', 1, 20, { date:'2026-12-07' }),
      L('xsub', 'Pump submittal approval', 42, 25, { kind:'submittal', who:'ENFRA' }),
      L('x2', 'Run duct', 8, 30) ]);
    var rn = planDates(nt, five);
    /* The submittal line keeps its lead time. The day it comes to is put in underneath, on a line
       of its own that nobody typed. */
    ck('notice: the submittal line carries a lead time and no start date',
      rn.by['xsub'].lead === true && rn.by['xsub'].weeks === 6 &&
      rn.by['xsub'].start === '' && rn.by['xsub'].anchored === false);
    ck('notice: a line is put in at the lead time before the line above it',
      rn.by['x1'].start === '2026-12-07' && !!rn.by['xsub~by'] &&
      rn.by['xsub~by'].start === '2026-10-26' && rn.by['xsub~by'].notice === true &&
      rn.by['xsub~by'].holds === 'x1' && rn.by['xsub~by'].by === '2026-12-07');
    ck('notice: it is one day, not a stretch of days, and it sits under its own line',
      rn.by['xsub~by'].start === rn.by['xsub~by'].finish && rn.by['xsub~by'].days === 0 &&
      rn.rows.map(function (r) { return r.id; }).join().indexOf('xsub,xsub~by') >= 0);
    ck('notice: it takes no step and adds no time to the section',
      rn.by['xsub'].step === '' && rn.by['xs'].days === 9);
    ck('notice: and it is not nagged about for having no date of its own', rn.rootless === 0);

    /* The usual shape: the submittal goes in under the section it has to be in for, and there is
       nothing else in that section yet. Plans made before the flat list stamped a star on any line
       that had a submittal under it, so this is most real plans. */
    { var st = mk('start', [
        L('ha', 'Demo', 0, 10, { main:true }), L('hb', 'Demo piping', 2, 20),
        L('hc', "Set HWP's, HX And ADS", 0, 30, { main:true, date:'2026-12-07' }),
        L('hd', 'Pump submittal approval', 42, 40, { kind:'submittal', who:'ENFRA' }) ]);
      var rs = planDates(st, five);
      ck('notice: a section heading can be the thing it is for',
        rs.by['hd'].holds === 'hc' && rs.by['hd'].by === '2026-12-07' &&
        rs.by['hd~by'].start === '2026-10-26');
      /* and it must not reach past the heading into work that has nothing to do with it */
      ck('notice: it does not reach into the block above for a date',
        rs.by['hd'].holds !== 'hb'); }

    { var sx = mk('start', [
        L('xa', 'Demo', 0, 10, { main:true }), L('xb', 'Demo piping', 2, 20, { date:'2027-03-01' }),
        L('xc', 'Mech room', 0, 30, { main:true }),
        L('xd', 'Pump submittal', 42, 40, { kind:'submittal' }) ]);
      var rx = planDates(sx, five);
      ck('notice: with nothing above it in its own section but an undated heading, it says so',
        rx.by['xd'].holds === 'xc' && !rx.by['xd~by']); }

    /* A date left on the record from when it was ordinary work must not fight the worked-out one. */
    { var pd = mk('start', [
        L('pa', 'Mech room', 0, 10, { main:true }),
        L('pb', 'Set pumps', 2, 20, { date:'2026-12-07' }),
        L('pc', 'Pump submittal', 14, 30, { kind:'submittal', date:'2025-01-01' }) ]);
      var rp = planDates(pd, five);
      ck('notice: an old date on the line does not override what it works out to',
        rp.by['pc~by'].start === '2026-11-23'); }
    ck('notice: the submittal row shows the weeks where the days go, and no start date',
      (function () {
        var h = planOutlineHtml(nt, rn.rows.filter(keepRow), rn);
        var row = h.split('class=' + Q + 'out-row').filter(function (c) {
          return c.indexOf('Pump submittal') > 0 && c.indexOf('is-made') < 0; })[0] || '';
        return row.indexOf('is-lead') > 0 && row.indexOf('out-days is-lead') > 0 &&
               row.indexOf('>6w<') > 0 && row.indexOf('lead time') > 0 &&
               row.indexOf('set a date') < 0 && row.indexOf('Submittal') > 0;
      })());
    ck('notice: and the line it puts in says the day and what it keeps on track',
      (function () {
        var h = planOutlineHtml(nt, rn.rows.filter(keepRow), rn);
        var row = h.split('class=' + Q + 'out-row').filter(function (c) {
          return c.indexOf('is-made') > 0; })[0] || '';
        return row.indexOf('has to be in') > 0 && row.indexOf('Oct 26, 2026') > 0 &&
               row.indexOf('to keep Set HWPs') > 0 &&
               row.indexOf('nudgeLine') < 0 && row.indexOf('moveToStep') < 0 &&
               row.indexOf('removeLine') < 0 && row.indexOf('\u2192') < 0;
      })());
    ck('notice: and the card asks how long the lead time is, in weeks',
      (function () {
        var f = lineForm(nt, 'xsub', rn.rows);
        return f.indexOf('How long is the lead time') > 0 && f.indexOf('liWeeks') > 0 &&
               f.indexOf('value="6"') > 0;
      })());
    ck('notice: a line that is not one of those is not asked',
      lineForm(nt, 'x2', rn.rows).indexOf('liLeadWrap" hidden') > 0); }

  /* Typing a number into the step box moves the line to that step. */
  { schedules = [mk('start', [
      L('ms', 'Prep', 0, 10, { main:true }),
      L('m1', 'Set steel', 1, 20), L('m2', 'Open wall', 1, 30), L('m3', 'Readings', 1, 40, { date:'2026-10-12' }) ])];
    openPlan = 'p';
    var before = planDates(currentPlan(), five);
    ck('step: the numbers count the work from the foot of the page',
      [before.by['m3'].step, before.by['m2'].step, before.by['m1'].step].join() === '1,2,3');
    await moveToStep('m1', '1');
    var after = planDates(currentPlan(), five);
    ck('step: typing a number puts the line at that step',
      after.by['m1'].step === '1' && planTree(currentPlan()).items[3].id === 'm1');
    ck('step: and a section is not a step you can move something to',
      await (async function () {
        var held = planTree(currentPlan()).items.map(function (x) { return x.id; }).join();
        await moveToStep('m2', '');
        return planTree(currentPlan()).items.map(function (x) { return x.id; }).join() === held;
      })()); }

  /* The calendar says a thing once, on the day it has to be set going. */
  { schedules = [mk('start', [
      L('cs', 'Temp', 0, 10, { main:true }),
      L('c1', 'Run rooftop duct', 15, 20, { date:'2026-10-12' }) ])];
    openPlan = 'p';
    var rcal = planDates(currentPlan(), five);
    var cal2 = planCalendarHtml(currentPlan(), rcal.rows.filter(keepRow), five);
    ck('calendar: a line fifteen days long is drawn once, not on every one of the fifteen',
      (cal2.match(/cd-item/g) || []).length === 1 && cal2.indexOf('15d') > 0);
    ck('calendar: and a section is not drawn at all, because it is its lines',
      cal2.indexOf('Temp') < 0); }

  /* The whole panel, warnings and all. */
  { var panel = {}, heldJob = job;
    job = { id:'jx', name:'T', number:'1', specs:[], ignoredFiles:[], sections:[],
      workCal:{ days:[1,2,3,4,5], holidays:[], shift:'5x8' }, crews:[] };
    __stubEl('schedPanel', panel);
    schedules = [mk('end', [
      L('ws', 'Demo', 0, 10, { main:true }),
      L('w1', 'Turn on', 3, 20, { date:'2026-12-19' }) ])];
    openPlan = 'p'; planEdit = null; planWho = ''; planHot = false; planSel = [];
    panel.innerHTML = ''; renderScheduleInner();
    var h = String(panel.innerHTML || '');
    ck('panel: a deadline on a day the job does not work is taken as the last day it does',
      h.indexOf('does not work') > 0 && h.indexOf('Dec 18') > 0);
    ck('panel: the bar offers both ways round and the Excel button',
      h.indexOf('Back from the end') > 0 && h.indexOf('Forward from the start') > 0 &&
      h.indexOf('exportSchedule()') > 0);
    __stubEl('schedPanel', null);
    job = heldJob; }

  /* Which end the dates are built from. */
  { var back = mk('end', [
      L('bs', 'Demo', 0, 10, { main:true }),
      L('b1', 'Ceilings closed', 2, 20, { date:'2026-12-18' }),
      L('b2', 'Trim out', 5, 30) ]);
    var rb = planDates(back, five);
    ck('basis: working back, a date is the day that line has to be done by',
      rb.by['b1'].finish === '2026-12-18' && rb.fwd === false &&
      rb.by['b2'].finish < rb.by['b1'].start);
    var fwd2 = mk('start', back.items.map(function (x) { return Object.assign({}, x); }));
    var rf2 = planDates(fwd2, five);
    ck('basis: going forward, the same date is the day it starts',
      rf2.by['b1'].start === '2026-12-18' && rf2.fwd === true); }
}

/* Released and partly released are a thing people want to look at together, so the chips hold a
     list rather than one answer. */
  { var heldJob = job, heldSt = statusFilter, heldRel = releaseFilter, heldQ = query, heldDiv = divFilter;
    var S = function (k, st, rel) { return { key:k, number:k, title:k, division:'23', status:st,
      releaseState:rel, specId:'sp1', products:[], releases:[], notes:[] }; };
    job = { id:'jf', name:'T', number:'1', specs:[{ id:'sp1', name:'Spec' }], ignoredFiles:[], sections: [
      S('a', 'approved', 'released'), S('b', 'approved', 'partial'), S('c', 'approved', 'released'),
      S('d', 'submitted_gc', 'ready'), S('e', 'approved', 'partial'), S('f', 'not_started', 'not_ready') ] };
    statusFilter = []; releaseFilter = []; query = ''; divFilter = 'all';
    var keys = function () { return visibleSections().map(function (x) { return x.key; }).join(); };
    ck('chips: nothing picked shows everything', keys() === 'a,b,c,d,e,f');
    releaseFilter = toggleFilter(releaseFilter, 'released');
    ck('chips: one picked shows that one', keys() === 'a,c');
    releaseFilter = toggleFilter(releaseFilter, 'partial');
    ck('chips: a second one is added to it rather than replacing it',
      keys() === 'a,b,c,e' && releaseFilter.length === 2);
    releaseFilter = toggleFilter(releaseFilter, 'released');
    ck('chips: picking one that is already on takes it back off', keys() === 'b,e');
    releaseFilter = toggleFilter(releaseFilter, null);
    ck('chips: and Clear takes them all off', keys() === 'a,b,c,d,e,f' && releaseFilter.length === 0);

    statusFilter = toggleFilter(toggleFilter(statusFilter, 'approved'), 'submitted_gc');
    ck('chips: the status chips do the same, because they are the same control',
      keys() === 'a,b,c,d,e');
    releaseFilter = toggleFilter(releaseFilter, 'partial');
    ck('chips: and the two rows still narrow each other', keys() === 'b,e');
    job = heldJob; statusFilter = heldSt; releaseFilter = heldRel; query = heldQ; divFilter = heldDiv; }

  /* Where the releases stand, out to Excel. For a section that is only part released the thing you
     need is which of its items are out, which is a line each rather than a cell. */
  { var heldJ = job, heldS = statusFilter, heldR = releaseFilter, heldQ2 = query, heldD = divFilter;
    var prod = function (id, tag, nm) { return { id:id, name:nm, marks:[{ id:id+'#0', tag:tag }] }; };
    job = { id:'jr', name:'T', number:'1', specs:[{ id:'sp1' }], ignoredFiles:[], sections: [
      { key:'23 05 00', number:'23 05 00', title:'Common work', division:'23', specId:'sp1',
        status:'approved', releaseState:'released', vendor:'ENFRA', manufacturer:'Greenheck',
        leadWeeks:6, products:[prod('p1','HC-1','Hangers')], submittals:[{}],
        releases:[{ id:'r1', mark:'p1#0', date:'2026-09-01', delivered:true }], notes:[] },
      { key:'23 36 00', number:'23 36 00', title:'Terminal units', division:'23', specId:'sp1',
        status:'approved', releaseState:'partial', vendor:'ENFRA', manufacturer:'Titus',
        leadWeeks:12, submittals:[{}],
        products:[prod('p2','TU-1','Units'), prod('p3','TU-2','Units'), prod('p4','TU-3','Units')],
        releases:[{ id:'r2', mark:'p2#0', date:'2026-09-15', note:'First batch' }], notes:[] },
      { key:'23 37 00', number:'23 37 00', title:'Air outlets', division:'23', specId:'sp1',
        status:'not_started', releaseState:'not_ready', products:[prod('p5','AO-1','Diffusers')],
        submittals:[], releases:[], notes:[] } ] };
    statusFilter = []; releaseFilter = []; query = ''; divFilter = 'all';
    releaseFilter = toggleFilter(toggleFilter(releaseFilter, 'released'), 'partial');
    var rsecs = visibleSections();
    ck('releases: it exports what the chips left on screen, and nothing else',
      rsecs.map(function (x) { return x.key; }).join() === '23 05 00,23 36 00');
    ck('releases: a section says which release it is at and how much of it is out',
      relSectionRow(rsecs[0])[2] === 'Released' && relSectionRow(rsecs[0])[3] === '1 of 1' &&
      relSectionRow(rsecs[1])[2] === 'Partially Released' && relSectionRow(rsecs[1])[3] === '1 of 3');
    ck('releases: and carries whose it is, the maker, the lead and where the submittal stands',
      relSectionRow(rsecs[1])[4] === 'ENFRA' && relSectionRow(rsecs[1])[5] === 'Titus' &&
      relSectionRow(rsecs[1])[6] === 'Approved' && relSectionRow(rsecs[1])[10] === '12 weeks');
    var items = relItemRows(rsecs[1]);
    ck('releases: the part released one gives a line per item, saying which are out and which are not',
      items.length === 3 && items.map(function (r) { return r[3]; }).join() === 'Yes,No,No' &&
      items[0][2].indexOf('TU-1') === 0 && items[1][2].indexOf('TU-2') === 0);
    ck('releases: the one that is out carries its date and its note, and the others carry nothing',
      items[0][4] instanceof Date && dISO(items[0][4]) === '2026-09-15' &&
      items[0][7] === 'First batch' && items[1][4] === '' && items[1][7] === '');
    ck('releases: every row has a cell for every heading',
      rsecs.every(function (x) { return relSectionRow(x).length === REL_HEADS.length; }) &&
      items.every(function (r) { return r.length === ITEM_HEADS.length; }) &&
      REL_HEADS.length === REL_WIDTHS.length && ITEM_HEADS.length === ITEM_WIDTHS.length);
    if (!HAVE_XLSX) skip('releases: the workbook itself', 'xlsx engine not installed');
    else {
      var rb = await buildReleaseXlsx(rsecs);
      var rwb = XLSX.read(rb, { type: 'array', cellDates: true });
      ck('releases: two sheets \u2014 a line per section, and a line per item',
        rwb.SheetNames.join() === 'Sections,Items');
      var sx = XLSX.utils.sheet_to_json(rwb.Sheets['Sections'], { header: 1, raw: true });
      ck('releases: it says which kinds of release it was asked for',
        String(sx[1][4]) === 'Released, Partially Released');
      ck('releases: headings, then a line per section on screen',
        sx[4].join() === REL_HEADS.join() && sx.length === 5 + rsecs.length);
      var ix = XLSX.utils.sheet_to_json(rwb.Sheets['Items'], { header: 1, raw: true });
      ck('releases: and every item of every one of them on the second sheet',
        ix.length === 5 + 4 && ix[6][3] === 'Yes' && ix[7][3] === 'No');
    }
    job = heldJ; statusFilter = heldS; releaseFilter = heldR; query = heldQ2; divFilter = heldD; }

  // the plan, out to Excel and back again
  { schedules[0].basis = 'start';
    delete schedules[0].flat;
    schedules[0].items = [
      { id:'tmp', name:'Temp', days:0, order:10, main:true },
      { id:'t5', name:'Connect OSA flex', who:'Arctic', days:1, order:20 },
      { id:'t3', name:'Insulate rooftop duct', who:'Arctic', days:4, order:40, alongside:'t2' },
      { id:'t2', name:'Run rooftop duct', who:'Arctic', days:8, order:50 },
      { id:'t1', name:'Run flex', who:'Arctic', days:1, order:60, date:'2026-10-12', note:'Night work' },
      { id:'o', name:'Order pumps', kind:'order', days:28, order:65 } ];
    var xr = planDates(currentPlan(), five);
    ck('excel: each line says what kind of thing it is, in words',
      schKindOut(xr.by['tmp']) === 'Section' && schKindOut(xr.by['t2']) === 'Work' &&
      schKindOut(xr.by['o']) === 'Order / release' && schKindOut(xr.by['o~by']) === 'Needed by');
    ck('excel: and a line that is behind says so',
      schFlag(xr.by['o~by']).indexOf('behind') > 0 && schFlag(xr.by['t2']) === '');

    /* The working days the dates are counted on are listed out, in the order the run reaches them,
       so the sheet never has to work out what a working day is. */
    var cdays = schedCalDays(xr, five, true);
    ck('excel: the working days go out as a list, in order, with room either side',
      cdays.length > 800 && cdays[0] < cdays[cdays.length - 1] &&
      cdays.every(function (d, i) { return i === 0 || d > cdays[i - 1]; }) &&
      cdays.every(function (d) { return isWorkDay(d, five); }));
    ck('excel: and back from the end they are listed the other way round',
      (function () { var b = schedCalDays(xr, five, false);
        return b[0] > b[b.length - 1]; })());

    /* The dates in the sheet are worked out by the sheet, not printed into it. */
    var hf = schHelpFormulas(7, 40, true, "Calendar!$A$2:$A$9");
    var df = schDateFormulas(7, 40, "Calendar!$A$2:$A$9");
    ck('excel: every line gets the whole of the working out',
      hf(9).length === SCH_HELP.length && hf(9).every(function (x) { return x.charAt(0) === '='; }));
    ck('excel: the dates are formulas off that list, not typed-in answers',
      df(9).start.indexOf('INDEX(Calendar!') > 0 && df(9).fin.indexOf('INDEX(Calendar!') > 0);
    ck('excel: a lead time counts back in plain days from the line it is for',
      df(9).start.indexOf('-$E9*7') > 0);
    ck('excel: nothing reaches past the last row of the sheet',
      hf(40).join(' ').indexOf('$41') < 0 && hf(7).join(' ').indexOf('$6:') < 0);
    ck('excel: going back from the end the run reads the other neighbour',
      (function () { var bk = schHelpFormulas(7, 40, false, 'C');
        return bk(9)[10].indexOf('ROW()-1') > 0 && hf(9)[10].indexOf('ROW()+1') > 0; })());

    /* and back the other way */
    var sheetRows = function () {
      return planDates(currentPlan(), five).rows.filter(function (r) { return !r.notice; })
        .map(function (r) {
          return { at: 0, id: r.id, step: r.main ? '★' : (r.step || ''),
            was: r.main ? '★' : (r.step || ''), name: r.item.name,
            who: r.main || r.lead ? '' : (r.item.who || ''),
            days: r.main ? (r.target || 0) : (r.mate ? r.own : r.days) || 0,
            weeks: r.lead ? r.weeks : 0, pin: r.pinned ? r.item.date : '',
            kind: r.main ? 'main' : (r.item.kind || ''),
            note: r.item.note || '', done: !!r.item.done };
        });
    };
    var before = sheetRows();
    ck('excel: a sheet that comes back untouched changes nothing',
      (function () {
        var got = schPlanFrom(currentPlan(), before);
        return got.added.length === 0 && got.gone.length === 0 &&
          got.items.map(function (x) { return x.id; }).join() ===
          before.map(function (x) { return x.id; }).join() &&
          got.items.filter(function (x) { return x.alongside === 't2'; }).length === 1;
      })());
    ck('excel: a row you typed on the end comes in as a new line',
      (function () {
        var rows = before.concat([{ at:0, id:'', step:'', was:'', name:'Flush and fill',
          who:'Arctic', days:3, weeks:0, pin:'', kind:'', note:'', done:false }]);
        var got = schPlanFrom(currentPlan(), rows);
        return got.added.length === 1 && got.added[0].name === 'Flush and fill' &&
          got.added[0].days === 3 && got.gone.length === 0;
      })());
    ck('excel: a line missing from the sheet is reported, never dropped on its own',
      (function () {
        var got = schPlanFrom(currentPlan(), before.filter(function (x) { return x.id !== 't5'; }));
        return got.gone.length === 1 && got.gone[0].id === 't5';
      })());
    ck('excel: a letter on a step ties the line to the one holding that number',
      (function () {
        var rows = before.map(function (x) { return Object.assign({}, x); });
        var t5 = rows.filter(function (x) { return x.id === 't5'; })[0];
        var t2 = rows.filter(function (x) { return x.id === 't2'; })[0];
        t5.step = t2.step + 'c';
        var got = schPlanFrom(currentPlan(), rows);
        return got.items.filter(function (x) { return x.id === 't5'; })[0].alongside === 't2';
      })());
    ck('excel: taking the letter off unties it again',
      (function () {
        var rows = before.map(function (x) { return Object.assign({}, x); });
        rows.filter(function (x) { return x.id === 't3'; })[0].step = '9';
        var got = schPlanFrom(currentPlan(), rows);
        return !got.items.filter(function (x) { return x.id === 't3'; })[0].alongside;
      })());
    ck('excel: changing the type turns a line into a section, or into a lead time',
      (function () {
        var rows = before.map(function (x) { return Object.assign({}, x); });
        rows.filter(function (x) { return x.id === 't5'; })[0].kind = 'main';
        var sub = rows.filter(function (x) { return x.id === 't1'; })[0];
        sub.kind = 'submittal'; sub.weeks = 6; sub.pin = '2020-01-01';
        var got = schPlanFrom(currentPlan(), rows);
        var a2 = got.items.filter(function (x) { return x.id === 't5'; })[0];
        var b2 = got.items.filter(function (x) { return x.id === 't1'; })[0];
        return a2.main === true && !a2.kind && b2.kind === 'submittal' && b2.days === 42 && !b2.date;
      })());
    ck('excel: a date typed in the sheet comes back as the date set on the line',
      (function () {
        var rows = before.map(function (x) { return Object.assign({}, x); });
        rows.filter(function (x) { return x.id === 't2'; })[0].pin = new Date('2026-11-09T12:00:00');
        var got = schPlanFrom(currentPlan(), rows);
        return got.items.filter(function (x) { return x.id === 't2'; })[0].date === '2026-11-09';
      })());
    ck('excel: dates are read however the sheet wrote them',
      schDateIn('2026-11-09') === '2026-11-09' && schDateIn('11/9/2026') === '2026-11-09' &&
      schDateIn(new Date('2026-11-09T12:00:00')) === '2026-11-09' && schDateIn('') === '');

    /* Retyping a step number moves the line, the way typing in the box on the page moves it. */
    ck('excel: a step number you retyped moves the line, one you left alone does not',
      (function () {
        var rows = before.map(function (x) { return Object.assign({}, x); });
        var low = rows.filter(function (x) { return x.id === 't5'; })[0];
        var held = planTree(currentPlan()).items.map(function (x) { return x.id; }).join();
        schApplySteps(currentPlan(), rows);
        var same = planTree(currentPlan()).items.map(function (x) { return x.id; }).join() === held;
        low.step = '1';
        schApplySteps(currentPlan(), rows);
        var moved = planDates(currentPlan(), five).by['t5'].step === '1';
        return same && moved;
      })());
    delete schedules[0].basis; }

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
  { delete schedules[0].flat;
    schedules[0].items = [
      { id:'ic', name:'Install components', days:0, order:10, main:true },
      { id:'i1', name:'Install ductwork', who:'Arctic', days:1, order:20 },
      { id:'o',  name:'Order the pumps', kind:'order', days:28, order:25 },
      { id:'w',  name:'Set the pumps', who:'Arctic', days:2, order:30, date:'2026-12-18' } ];
    var rh = planDates(currentPlan(), { days:[1,2,3,4,5], holidays:[] });
    var hh = planOutlineHtml(currentPlan(), rh.rows.filter(keepRow), {});
    var rowOf = function (n) {
      return hh.split('out-row').filter(function (c) { return c.indexOf(n) > 0; })[0] || '';
    };
    ck('columns: every row puts the same eight things out in the same order',
      hh.split('class=' + Q + 'out-row').slice(1).every(function (c) {
        var cell = c.slice(0, c.indexOf('</div>') > 0 ? c.length : c.length);
        return ['out-step','out-tick','out-name','out-who','out-days','out-when','out-meta','out-act']
          .reduce(function (at, k) { var i = cell.indexOf(k); return (at !== -1 && i > at) ? i : -1; }, 0) > 0;
      }));
    ck('columns: a section is banded as the heading it is',
      rowOf('Install components').indexOf('is-head') > 0);
    ck('columns: an ordinary line is not, whatever is near it',
      rowOf('Set the pumps').indexOf('is-head') < 0 &&
      rowOf('Install ductwork').indexOf('is-head') < 0 &&
      rowOf('Order the pumps').indexOf('is-head') < 0); }

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
