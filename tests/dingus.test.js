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
sandbox.HAVE_XLSX = !!XLSXLib;
sandbox.HAVE_PDF = !!jsPDFLib;

const testCode = `
(async () => {

// ══ the pull plan: working week, backward pass ════════════════════════════
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
  ck('week: on four tens it is the Thursday',
    prevWorkDay('2026-10-05', four) === '2026-10-01');
  ck('week: a holiday is stepped over rather than landed on',
    prevWorkDay('2026-10-05', { days:[1,2,3,4,5], holidays:['2026-10-02'] }) === '2026-10-01');
  ck('week: counting days between two dates counts both ends and skips the rest',
    workDaysBetween('2026-10-05', '2026-10-09', five) === 5 &&
    workDaysBetween('2026-10-05', '2026-10-09', four) === 4);
  ck('week: a calendar with no working days on it does not spin for ever',
    nearestWorkDay('2026-10-05', { days: [], holidays: [] }, -1) === '2026-10-05');

  // one chain: install pulls material, material pulls the order
  var plan = { id:'p1', name:'Level 3', items: [
    { id:'m',  name:'Level 3 ceilings closed', milestone:true, date:'2026-12-18' },
    { id:'a',  name:'Install ductwork', who:'Arctic', days:10, after:['b'] },
    { id:'b',  name:'Material on site',  who:'Arctic', days:1,  after:['c'] },
    { id:'c',  name:'Release to vendor', who:'Arctic', days:2,  after:[] }
  ]};
  plan.items[1].after = ['b']; plan.items.find(x => x.id==='a').after = ['b'];
  // a feeds the milestone
  plan.items.find(x => x.id==='m').after = [];
  plan.items.find(x => x.id==='a').after = ['b'];
  // wire it the way the app does: the thing that comes AFTER lists what it waits on
  plan.items = [
    { id:'m', name:'Level 3 ceilings closed', milestone:true, date:'2026-12-18', after:['a'] },
    { id:'a', name:'Install ductwork', who:'Arctic', days:10, after:['b'] },
    { id:'b', name:'Material on site',  who:'Vendor', days:1,  after:['c'] },
    { id:'c', name:'Release to vendor', who:'Arctic', days:2,  after:[] }
  ];
  var r = planDates(plan, five);
  ck('pull: the milestone keeps the date you typed',
    r.by['m'].start === '2026-12-18' && r.by['m'].finish === '2026-12-18');
  ck('pull: the line feeding it finishes the working day before, not the same day',
    r.by['a'].finish === '2026-12-17');
  ck('pull: and starts its own duration before that, in working days',
    r.by['a'].start === '2026-12-04');
  ck('pull: the chain keeps going back, each one finishing before the next starts',
    r.by['b'].finish === '2026-12-03' && r.by['b'].start === '2026-12-03' &&
    r.by['c'].finish === '2026-12-02' && r.by['c'].start === '2026-12-01');
  ck('pull: and nothing is behind when the milestone is a year out', r.behind === 0);

  var r4 = planDates(plan, four);
  ck('pull: a milestone landing on a day the job does not work is pulled to the last day it does',
    r4.by['m'].start === '2026-12-17');          // Friday the 18th, on a Mon-Thu job
  ck('pull: the same plan on four tens starts earlier, because there are fewer days in a week',
    r4.by['a'].start < r.by['a'].start && r4.by['a'].finish === '2026-12-16');

  // a line that feeds two things is pulled by whichever needs it first
  var two = { items: [
    { id:'m1', name:'Early', milestone:true, date:'2026-11-06', after:['x'] },
    { id:'m2', name:'Late',  milestone:true, date:'2026-12-18', after:['x'] },
    { id:'x',  name:'Shared hoisting', who:'Arctic', days:2, after:[] }
  ]};
  var rt = planDates(two, five);
  ck('pull: a line feeding two dates is pulled to the earlier one',
    rt.by['x'].finish === '2026-11-05' && rt.by['x'].start === '2026-11-04');

  // things it refuses to guess at
  var odd = { items: [
    { id:'m', name:'End', milestone:true, date:'2026-12-18', after:[] },
    { id:'loose', name:'Nothing pulls this', who:'Arctic', days:3, after:[] },
    { id:'p', name:'Round one', days:2, after:['q'] },
    { id:'q', name:'Round two', days:2, after:['p'] }
  ]};
  var ro = planDates(odd, five);
  ck('pull: a line nothing pulls gets no date, and is counted so you can be told',
    ro.by['loose'].anchored === false && ro.by['loose'].start === '' && ro.orphans === 1);
  ck('pull: two lines waiting on each other are named rather than hung on',
    ro.by['p'].loop === true && ro.by['q'].loop === true && ro.loops === 2);
  ck('pull: a milestone with no date on it yet is counted too', 
    planDates({ items: [{ id:'m', name:'TBD', milestone:true, date:'' }] }, five).undated === 1);

  // what you are meant to act on
  var past = { items: [
    { id:'m', name:'End', milestone:true, date: dShift(today(), 3), after:['a'] },
    { id:'a', name:'Twenty days of work', who:'Arctic', days:20, after:[] }
  ]};
  var rp = planDates(past, five);
  ck('pull: a line whose latest start has already gone by is called behind',
    rp.by['a'].late === true && rp.behind === 1 && rp.by['a'].runway < 0);
  ck('pull: and the chain that moves the date is marked',
    rp.by['a'].critical === true && rp.by['m'].critical === false);

  ck('pull: a job with nothing on it yet is not an error', planDates({ items: [] }, five).rows.length === 0);
  ck('week: the shift is named back in the words the job was set up with',
    workShiftLabel({ days:[1,2,3,4] }).indexOf('4') === 0 &&
    workShiftLabel({ days:[1,2,3,4,5] }).indexOf('5') === 0);
}

// ══ the plan: lines, plans, and the week that has to survive a save ═══════════
{
  var wrote = null;
  var realFB = FB;
  FB = { db: {}, doc: () => ({}), collection: () => ({}),
         setDoc: async (ref, data) => { wrote = data; },
         deleteDoc: async () => {} };
  job = { id: 'jp', name: 'T', number: '1', specs: [], ignoredFiles: [], sections: [],
          workCal: { shift: '4x10', days: [1,2,3,4], holidays: ['2026-11-26'] } };
  jobs = [job]; contracts = []; ledgerData = { quotes: [], pos: [] };

  await saveJobMeta();
  ck('week: the working week is written with the job, or every date on every plan goes wrong',
    !!wrote && !!wrote.workCal && wrote.workCal.days.join() === '1,2,3,4' &&
    wrote.workCal.holidays.join() === '2026-11-26');
  FB = realFB;

  schedules = [{ id:'p1', name:'Level 3', created:1, items: [
    { id:'m', name:'Ceilings closed', milestone:true, date:'2026-12-18', who:'GC', after:['b'] },
    { id:'b', name:'Hang duct', who:'Arctic', days:5, after:['a'] },
    { id:'a', name:'Deliver duct', who:'Supply Co', days:2, after:[], hold:'ship date not confirmed' }
  ]}];
  openPlan = 'p1'; planWho = ''; planHot = false; planEdit = null;

  ck('plan: the plan you are looking at is the one that is open', (currentPlan() || {}).id === 'p1');
  ck('plan: the people on it are the ones named on its lines, once each and in order',
    planPeople(currentPlan()).join() === 'Arctic,GC,Supply Co');

  // taking a line off must not leave anything waiting on a ghost
  var realConfirm = confirm;
  await removePlanLine('a');
  ck('plan: a line that is taken off stops being waited on by anything else',
    planItems(currentPlan()).length === 2 &&
    !planItems(currentPlan()).some(x => (x.after || []).indexOf('a') >= 0));
  ck('plan: and the backward pass still works afterwards, rather than waiting on a ghost',
    planDates(currentPlan(), workCal(job)).by['b'].anchored === true);

  // filters
  schedules[0].items.push({ id:'c', name:'Paint', who:'Painter', days:3, after:['b'] });
  var rows = planDates(currentPlan(), workCal(job)).rows;
  planWho = 'Arctic';
  ck('plan: filtering to one contractor keeps only their lines',
    rows.filter(keepRow).map(r => r.item.name).join() === 'Hang duct');
  planWho = '';
  planHot = true;
  ck('plan: needs-attention keeps what is late, blocked, in a ring or unpulled — and nothing else',
    rows.filter(keepRow).every(r => r.late || r.loop || !r.anchored || r.item.hold));
  planHot = false;

  // a name that is also a property of every object must not break the lanes
  schedules[0].items.push({ id:'d', name:'Odd one', who:'constructor', days:1, after:[] });
  schedules[0].items.push({ id:'e', name:'Odder',   who:'__proto__',   days:1, after:[] });
  planItemById(currentPlan(), 'm').after = ['b', 'd', 'e'];   // so they are pulled and get dates
  var rows2 = planDates(currentPlan(), workCal(job)).rows;
  var wallHtml = planWallHtml(currentPlan(), rows2.filter(keepRow), workCal(job));
  ck('plan: a contractor called constructor or __proto__ gets a lane like anyone else',
    wallHtml.indexOf('Odd one') > 0 && wallHtml.indexOf('Odder') > 0);
  ck('plan: and the same text is not run as part of the page',
    wallHtml.indexOf('<script') < 0);

  // text that would break out of the HTML
  schedules[0].items.push({ id:'x', name: 'Say ' + Q + 'hi' + Q + ' & go', who: "O'Brien Mechanical",
    days: 1, after: [], hold: '<b>not</b> ok' });
  planItemById(currentPlan(), 'm').after = ['b', 'd', 'e', 'x'];
  var rows3 = planDates(currentPlan(), workCal(job)).rows;
  var listHtml = planListHtml(currentPlan(), rows3.filter(keepRow), { rows: rows3 });
  ck('plan: a name with quotes and an ampersand in it comes out as text, not as markup',
    listHtml.indexOf('&amp;') > 0 && listHtml.indexOf('&lt;b&gt;not&lt;/b&gt;') > 0 &&
    listHtml.indexOf('<b>not</b>') < 0);
  ck('plan: and an apostrophe in a name does not break the button beside it',
    listHtml.indexOf('O&#39;Brien') > 0 || listHtml.indexOf('O&apos;Brien') > 0);

  var calHtml = planCalendarHtml(currentPlan(), rows3.filter(keepRow), workCal(job));
  ck('plan: the calendar draws the months the work runs through',
    calHtml.indexOf('cal-month') > 0 && calHtml.indexOf('December') > 0);
  ck('plan: a day the job is shut is drawn as a day off',
    calHtml.indexOf('is-off') > 0);

  schedules = []; openPlan = null;
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
