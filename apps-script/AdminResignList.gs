/**
 * 신규간호사 사직자 명단 (관리자 전용 페이지)
 *
 * 공개 대시보드에는 이름을 싣지 않고, 사직자 이름·부서·발령일·사직일은 이 페이지에서만 보여준다.
 * 배포 설정: [배포 > 새 배포 > 웹 앱]
 *   - 다음 사용자 인증 정보로 실행: "웹 앱에 액세스하는 사용자"
 *   - 액세스 권한이 있는 사용자: "Google 계정이 있는 모든 사용자"
 * → 페이지를 연 사람의 권한으로 원본 시트를 읽으므로, 시트를 볼 수 없는 계정은 명단도 볼 수 없다.
 *
 * 대시보드와 별도의 Apps Script 프로젝트에 이 파일만 넣어 사용한다.
 */

const ADMIN = {
  SHEET_ID: '1wmsLCPfP7NafHpgl7XwuE87kc42hLq3zFLgUAkKTdPA',
  ROSTER_SHEET: '26신규명단',
  TZ: 'Asia/Seoul',
  TITLE: '신규간호사 사직자 명단',
  PLACED_TITLE: '신규간호사 발령 명단',
  // 발령 명단에 함께 보여줄 열 (시트에 있는 것만 표시, 나머지 열은 뒤에 자동으로 붙음)
  PLACED_COLS: ['사원번호', '생년월일', '출신학교', '석차백분율', 'AI역량검사평가'],
  DASHBOARD_URL: 'https://2026new-nurse.vercel.app/#p2',
  GROUPS: [
    ['일반병동', ['12A', '12B', '11B', '10A', '10B', '8A', '8B', '7B', '6A']],
    ['통합병동', ['14A', '14B', '13A', '13B', '11A', '9A', '9B', '7A']],
    ['중환자', ['MICU', 'SICU', 'EICU', 'NICU', 'MFICU']],
    ['수술회복', ['수술실', '회복실']],
    ['응급', ['응급실']],
  ],
};

function doGet(e) {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, ['https://www.googleapis.com/auth/spreadsheets']); // 시트 권한이 없으면 승인 화면 표시
  const view = e && e.parameter && e.parameter.view === 'placed' ? 'placed' : 'resign';
  let data = null, err = '';
  try {
    data = view === 'placed' ? readPlaced_() : readResigned_();
  } catch (x) {
    err = String(x && x.message || x);
  }
  let who = '';
  try { who = Session.getActiveUser().getEmail(); } catch (x) {}
  let self = '';
  try { self = ScriptApp.getService().getUrl(); } catch (x) {}
  const month = (e && e.parameter && e.parameter.m) || '';
  const html = view === 'placed' ? placedPage_(data, err, who, self) : page_(data, err, month, who, self);
  return HtmlService.createHtmlOutput(html)
    .setTitle(view === 'placed' ? ADMIN.PLACED_TITLE : ADMIN.TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function roster_() {
  const sh = SpreadsheetApp.openById(ADMIN.SHEET_ID).getSheetByName(ADMIN.ROSTER_SHEET);
  if (!sh) throw new Error(`'${ADMIN.ROSTER_SHEET}' 탭을 찾을 수 없습니다.`);
  const range = sh.getDataRange();
  const rows = range.getValues(), shown = range.getDisplayValues();
  const hi = rows.findIndex(r => r.some(v => String(v).trim() === '부서') && r.some(v => String(v).trim() === '발령일자'));
  if (hi < 0) throw new Error('명단 머리글(부서·발령일자)을 찾을 수 없습니다.');
  return { rows: rows, shown: shown, hi: hi, head: rows[hi].map(v => String(v).trim()) };
}

function ymd_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, ADMIN.TZ, 'yyyy-MM-dd');
  const m = String(v || '').trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  return m ? `${m[1]}-${('0' + m[2]).slice(-2)}-${('0' + m[3]).slice(-2)}` : '';
}

// 신규 발령 명단: 발령자 전원과 발령 정보, 재직·사직 상태
function readPlaced_() {
  const R = roster_(), rows = R.rows, head = R.head;
  const col = k => head.indexOf(k);
  const C = { name: col('성명'), gender: col('성별'), dept: col('부서'), start: col('발령일자'), end: col('사직일'), reason: col('사직사유') };
  const groupOf = {};
  ADMIN.GROUPS.forEach(g => g[1].forEach(d => { groupOf[d] = g[0]; }));
  const used = ['성명', '성별', '부서', '발령일자', '사직일', '사직발생기간', '사직사유', '업데이트일시', ''];
  const pref = ADMIN.PLACED_COLS.filter(k => head.indexOf(k) >= 0);
  const others = head.filter(k => used.indexOf(k) < 0 && pref.indexOf(k) < 0 && !/^(no\.?|순번|번호|연번)$/i.test(k));
  let cols = pref.concat(others).map(k => ({ k: k, i: head.indexOf(k) }));
  const today = Utilities.formatDate(new Date(), ADMIN.TZ, 'yyyy-MM-dd');
  const starts = {}, list = [];
  for (let i = R.hi + 1; i < rows.length; i++) {
    const r = rows[i];
    const dept = String(r[C.dept] || '').trim(), start = ymd_(r[C.start]);
    if (!dept || !start) continue;
    starts[start] = true;
    const end = C.end >= 0 ? ymd_(r[C.end]) : '';
    list.push({
      name: String(C.name >= 0 ? r[C.name] : '').trim(),
      gender: String(C.gender >= 0 ? r[C.gender] : '').trim().replace('자', ''),
      dept: dept, group: groupOf[dept] || '기타', start: start, end: end,
      days: Math.max(0, Math.round((Date.parse(end || today) - Date.parse(start)) / 864e5)),
      reason: end ? (String(C.reason >= 0 ? r[C.reason] : '').trim() || '미기재') : '',
      x: cols.map(c => String(R.shown[i][c.i] || '').trim()),
    });
  }
  // 값이 하나도 없는 열은 빼기
  const keep = cols.map((c, j) => list.some(x => x.x[j]));
  cols = cols.filter((c, j) => keep[j]);
  list.forEach(x => { x.x = x.x.filter((v, j) => keep[j]); });
  const cohorts = Object.keys(starts).sort();
  list.forEach(x => { x.cohort = (cohorts.indexOf(x.start) + 1) + '차'; });
  const gi = {};
  ADMIN.GROUPS.forEach((g, n) => g[1].forEach((d, m) => { gi[d] = n * 100 + m; }));
  const ord = d => (d in gi ? gi[d] : 9999);
  list.sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : (ord(a.dept) - ord(b.dept)) || a.name.localeCompare(b.name)));
  return { rows: list, cols: cols.map(c => c.k), cohorts: cohorts, generated: Utilities.formatDate(new Date(), ADMIN.TZ, 'yyyy-MM-dd HH:mm'), groups: ADMIN.GROUPS };
}

function readResigned_() {
  const R0 = roster_(), rows = R0.rows, hi = R0.hi, head = R0.head;
  const C = { name: head.indexOf('성명'), gender: head.indexOf('성별'), dept: head.indexOf('부서'), start: head.indexOf('발령일자'),
    end: head.indexOf('사직일'), period: head.indexOf('사직발생기간'), reason: head.indexOf('사직사유') };
  const groupOf = {};
  ADMIN.GROUPS.forEach(g => g[1].forEach(d => { groupOf[d] = g[0]; }));
  const fmt = v => {
    if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, ADMIN.TZ, 'yyyy-MM-dd');
    const m = String(v || '').trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    return m ? `${m[1]}-${('0' + m[2]).slice(-2)}-${('0' + m[3]).slice(-2)}` : '';
  };
  const starts = {};
  const list = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    const dept = String(r[C.dept] || '').trim(), start = fmt(r[C.start]);
    if (!dept || !start) continue;
    starts[start] = true;
    const end = C.end >= 0 ? fmt(r[C.end]) : '';
    if (!end) continue;
    const days = Math.round((Date.parse(end) - Date.parse(start)) / 864e5);
    list.push({
      name: String(C.name >= 0 ? r[C.name] : '').trim(),
      gender: String(C.gender >= 0 ? r[C.gender] : '').trim().replace('자', ''),
      dept: dept, group: groupOf[dept] || '기타', start: start, end: end, days: days,
      period: String(C.period >= 0 ? r[C.period] : '').trim(),
      reason: String(C.reason >= 0 ? r[C.reason] : '').trim() || '미기재',
    });
  }
  const cohorts = Object.keys(starts).sort();
  list.forEach(x => { x.cohort = (cohorts.indexOf(x.start) + 1) + '차'; });
  list.sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : a.dept.localeCompare(b.dept)));
  return { rows: list, generated: Utilities.formatDate(new Date(), ADMIN.TZ, 'yyyy-MM-dd HH:mm'), groups: ADMIN.GROUPS };
}

function page_(data, err, month, who, self) {
  const json = JSON.stringify({ data: data, err: err, month: month, who: who, dash: ADMIN.DASHBOARD_URL }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${ADMIN.TITLE}</title>
<style>
${adminCss_()}
</style>
</head><body>
<header><h1><i>+</i>${ADMIN.TITLE} <span class="tag">관리자 전용 · 외부 공유 금지</span></h1>${viewTabs_(self, 'resign')}
<div class="hr"><a class="btn home" id="dash" target="_top">← 메인 대시보드</a><span id="who"></span><span id="gen"></span></div></header>
<main id="app"></main>
<script>
const P = ${json};
${tableKit_()}
if (P.err || !P.data) {
  showErr();
} else {
  document.getElementById('gen').textContent = '조회 ' + P.data.generated;
  const rows = P.data.rows;
  const months = [...new Set(rows.map(r => r.end.slice(0, 7)))].sort().reverse();
  const S = { m: months.includes(P.month) ? P.month : 'all', g: 'all', d: 'all', q: '' };
  const G = groupsOf(rows);
  const ml = m => m.slice(0, 4) + '년 ' + (+m.slice(5)) + '월';
  const C = [
    { h: '사직일', v: r => dot(r.end) },
    { h: '부서', v: r => r.dept, l: 1, b: 1 },
    { h: '부서군', v: r => r.group },
    { h: '성명', v: r => r.name, l: 1, b: 1 },
    { h: '성별', v: r => r.gender },
    { h: '발령 회차', v: r => r.cohort },
    { h: '발령일', v: r => dot(r.start) },
    { h: '근속(일)', v: r => String(r.days), x: r => r.days },
    { h: '사직 시기', v: r => r.period },
    { h: '사직 사유', v: r => r.reason, l: 1 },
  ];
  KIT.title = '신규간호사_사직자명단';
  KIT.draw = function () {
    const q = S.q.trim().toLowerCase();
    const hit = r => !q || (r.name + r.dept + r.reason).toLowerCase().includes(q);
    const pre = rows.filter(r => (S.m === 'all' || r.end.slice(0, 7) === S.m) && (S.g === 'all' || r.group === S.g) && (S.d === 'all' || r.dept === S.d) && hit(r));
    const list = KIT.prep(C, pre);
    const cnt = {}; rows.filter(r => (S.m === 'all' || r.end.slice(0, 7) === S.m) && hit(r)).forEach(r => { cnt[r.dept] = (cnt[r.dept] || 0) + 1; });
    const by = {}; list.forEach(r => { (by[r.end.slice(0, 7)] = by[r.end.slice(0, 7)] || []).push(r); });
    const avg = list.length ? Math.round(list.reduce((s, r) => s + r.days, 0) / list.length) : 0;
    const early = list.filter(r => r.days <= 92).length;
    KIT.cond = (S.m === 'all' ? '전체 기간' : ml(S.m)) + (S.g === 'all' ? '' : ' · ' + S.g) + (S.d === 'all' ? '' : ' · ' + S.d) + KIT.cfLabel(C);
    app.innerHTML = '<div class="card filters">'
      + '<div><span class="fl">사직월</span>' + chips(S, 'm', months, ml) + '</div>'
      + '<div><span class="fl">부서군</span>' + chips(S, 'g', G.names, v => v) + '</div>'
      + '<div><span class="fl">세부부서</span>' + deptSelect(S, G, cnt) + '</div>'
      + '<div><span class="fl">검색</span><input id="q" placeholder="이름·부서·사유" value="' + esc(S.q) + '"></div></div>'
      + '<div class="card sum"><span>사직자 <b>' + list.length + '</b>명</span><span>입사 3개월 이내 <b>' + early + '</b>명</span><span>평균 근속 <b>' + avg + '</b>일</span><span class="muted">' + esc(KIT.cond) + '</span></div>'
      + '<div class="card tw">' + KIT.toolbar(list.length)
      + KIT.table(C, list, Object.keys(by).sort().reverse().map(m => ({ label: ml(m) + ' · ' + by[m].length + '명', rows: by[m] })), '조건에 맞는 사직자가 없습니다.') + '</div>';
    KIT.list = list; KIT.cols = C;
  };
  KIT.onChip = (k, v) => { S[k] = v; if (k === 'g' && S.d !== 'all' && !G.deptsOf(S.g).includes(S.d)) S.d = 'all'; };
  KIT.onDept = v => { S.d = v; };
  KIT.onSearch = v => { S.q = v; };
  KIT.start();
}
</script></body></html>`;
}

function adminCss_() {
  return `@font-face{font-family:"S-Core Dream";font-weight:400;src:url("https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/S-CoreDream-4Regular.woff") format("woff")}
@font-face{font-family:"S-Core Dream";font-weight:600;src:url("https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/S-CoreDream-6Bold.woff") format("woff")}
@font-face{font-family:"S-Core Dream";font-weight:700;src:url("https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/S-CoreDream-8Heavy.woff") format("woff")}
:root{--ink:#111827;--ink2:#4b5563;--muted:#6b7280;--line:#e6eaf1;--line2:#d5dbe5;--bg:#f3f5f9;--accent:#2563eb;--soft:#e8efff;--navy:#1f3a68;--crit:#c81e1e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 "S-Core Dream","Malgun Gothic",sans-serif}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 22px;background:#fff;border-bottom:1px solid var(--line)}
header h1{margin:0;font-size:18px;display:flex;align-items:center;gap:10px}header h1 i{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:var(--accent);color:#fff;font-style:normal}
.tag{display:inline-block;padding:2px 9px;border-radius:999px;background:#fdecec;color:var(--crit);font-size:11.5px;font-weight:600}
.hr{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:var(--muted)}
a.btn,button.btn{height:34px;padding:0 14px;border-radius:8px;border:1px solid var(--accent);background:#fff;color:var(--accent);font:600 13px "S-Core Dream",sans-serif;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
a.btn.home{background:var(--accent);color:#fff}a.btn.home:hover{filter:brightness(1.08)}
@media print{a.btn.home{display:none}}
main{padding:20px 22px;display:grid;gap:16px;max-width:1400px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.filters{display:flex;flex-wrap:wrap;gap:12px 22px;align-items:center}
.fl{font-size:12.5px;font-weight:600;color:var(--ink2);margin-right:6px}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line2);background:#fff;font:500 13px "S-Core Dream",sans-serif;cursor:pointer}
.chip[aria-pressed="true"]{background:var(--soft);border-color:var(--accent);color:var(--accent);font-weight:700}
select,input{height:34px;border:1px solid var(--line2);border-radius:8px;padding:0 10px;font:13px "S-Core Dream",sans-serif;background:#fff}
.sum{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--ink2)}.sum b{color:var(--ink);font-size:18px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:center;white-space:nowrap}
th{background:#f4f6fa;color:var(--ink2);font-weight:600;font-size:12px}td.l,th.l{text-align:left}
tr.mh td{background:var(--soft);color:var(--navy);font-weight:700;text-align:left}
td b{font-weight:700}.muted{color:var(--muted)}.tw{overflow-x:auto}
.empty{padding:24px;text-align:center;color:var(--muted)}
.err{border-left:4px solid var(--crit)}
.vt{display:flex;gap:4px;background:#eef2f8;border-radius:10px;padding:3px}.vt a{padding:6px 14px;border-radius:8px;color:var(--ink2);text-decoration:none;font-weight:600;font-size:13px}.vt a.on{background:#fff;color:var(--accent);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.tb{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;font-size:12.5px}
.tbb{display:flex;gap:6px;flex-wrap:wrap}
a.btn.sm,button.btn.sm{height:30px;padding:0 12px;font-size:12.5px}
tr.fr th{background:#fff;padding:4px 5px;border-bottom:1px solid var(--line2)}
tr.fr select,tr.fr input{height:28px;width:100%;min-width:64px;font-size:12px;padding:0 6px;border-radius:6px}
tr.fr select.on{border-color:var(--accent);color:var(--accent);font-weight:600}
th.fon{color:var(--accent)}
.ptitle{display:none}
#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;opacity:0;pointer-events:none;transition:opacity .2s;z-index:9}#toast.show{opacity:1}
@media print{.ptitle{display:block;margin:0 0 6px;font-size:10pt;font-weight:600}.tw{overflow:visible!important}#toast{display:none}}
@media print{@page{size:A4 portrait;margin:12mm}body{background:#fff}header .hr,.filters,.noprint{display:none!important}.card{border:0;padding:0}main{padding:0}th,td{padding:4px 6px;font-size:9pt;border:.5pt solid #9aa3b2}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
}

// 관리자 화면 전환 탭 (발령 명단 · 사직자 명단)
function viewTabs_(self, on) {
  if (!self) return '';
  return '<nav class="vt"><a target="_top" href="' + self + '?view=placed"' + (on === 'placed' ? ' class="on"' : '') + '>발령 명단</a>'
    + '<a target="_top" href="' + self + '"' + (on === 'resign' ? ' class="on"' : '') + '>사직자 명단</a></nav>';
}

function placedPage_(data, err, who, self) {
  const json = JSON.stringify({ data: data, err: err, who: who, dash: ADMIN.DASHBOARD_URL.replace('#p2', '#p1') }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${ADMIN.PLACED_TITLE}</title>
<style>
${adminCss_()}
.st{white-space:nowrap}.st.on{color:#3f7d5a}.st.off{color:#b0645f}
tr.off td{color:var(--ink2)}
@media print{@page{size:A4 landscape;margin:10mm}}
</style>
</head><body>
<header><h1><i>+</i>${ADMIN.PLACED_TITLE} <span class="tag">관리자 전용 · 외부 공유 금지</span></h1>${viewTabs_(self, 'placed')}
<div class="hr"><a class="btn home" id="dash" target="_top">← 메인 대시보드</a><span id="who"></span><span id="gen"></span></div></header>
<main id="app"></main>
<script>
const P = ${json};
${tableKit_()}
if (P.err || !P.data) {
  showErr();
} else {
  document.getElementById('gen').textContent = '조회 ' + P.data.generated;
  const rows = P.data.rows, cols = P.data.cols, coh = P.data.cohorts;
  const G = groupsOf(rows);
  const S = { c: 'all', g: 'all', d: 'all', s: 'all', q: '' };
  const cl = c => (coh.indexOf(c) + 1) + '차 (' + dot(c) + ')';
  const C = [
    { h: '회차', v: r => r.cohort },
    { h: '발령일', v: r => dot(r.start) },
    { h: '부서', v: r => r.dept, l: 1, b: 1 },
    { h: '부서군', v: r => r.group },
    { h: '성명', v: r => r.name, l: 1, b: 1 },
    { h: '성별', v: r => r.gender },
  ].concat(cols.map((k, j) => ({ h: k, v: r => r.x[j] }))).concat([
    { h: '상태', v: r => r.end ? '사직' : '재직', html: r => '<span class="st ' + (r.end ? 'off">사직' : 'on">재직') + '</span>' },
    { h: '사직일', v: r => dot(r.end), html: r => r.end ? '<span class="st off">' + dot(r.end) + '</span>' : '' },
    { h: '근속(일)', v: r => String(r.days), x: r => r.days },
    { h: '사직 사유', v: r => r.reason, l: 1 },
  ]);
  KIT.title = '신규간호사_발령명단';
  KIT.rowClass = r => r.end ? 'off' : '';
  KIT.draw = function () {
    const q = S.q.trim().toLowerCase();
    const hit = r => !q || (r.name + r.dept + r.x.join(' ')).toLowerCase().includes(q);
    const pre = rows.filter(r => (S.c === 'all' || r.start === S.c) && (S.g === 'all' || r.group === S.g) && (S.d === 'all' || r.dept === S.d) && (S.s === 'all' || (S.s === 'on' ? !r.end : !!r.end)) && hit(r));
    const list = KIT.prep(C, pre);
    const cnt = {}; rows.filter(r => (S.c === 'all' || r.start === S.c) && hit(r)).forEach(r => { cnt[r.dept] = (cnt[r.dept] || 0) + 1; });
    const out = list.filter(r => r.end).length;
    const by = {}; list.forEach(r => { (by[r.start] = by[r.start] || []).push(r); });
    KIT.cond = (S.c === 'all' ? '전체 회차' : cl(S.c)) + (S.g === 'all' ? '' : ' · ' + S.g) + (S.d === 'all' ? '' : ' · ' + S.d) + (S.s === 'all' ? '' : ' · ' + (S.s === 'on' ? '재직자' : '사직자')) + KIT.cfLabel(C);
    app.innerHTML = '<div class="card filters">'
      + '<div><span class="fl">발령 회차</span>' + chips(S, 'c', coh.slice().reverse(), cl) + '</div>'
      + '<div><span class="fl">부서군</span>' + chips(S, 'g', G.names, v => v) + '</div>'
      + '<div><span class="fl">세부부서</span>' + deptSelect(S, G, cnt) + '</div>'
      + '<div><span class="fl">상태</span>' + chips(S, 's', ['on', 'off'], v => v === 'on' ? '재직' : '사직') + '</div>'
      + '<div><span class="fl">검색</span><input id="q" placeholder="이름·부서·학교 등" value="' + esc(S.q) + '"></div></div>'
      + '<div class="card sum"><span>발령 <b>' + list.length + '</b>명</span><span>재직 <b>' + (list.length - out) + '</b>명</span><span>사직 <b>' + out + '</b>명</span><span>사직율 <b>' + (list.length ? (out / list.length * 100).toFixed(1) : '0.0') + '</b>%</span><span class="muted">' + esc(KIT.cond) + '</span></div>'
      + '<div class="card tw">' + KIT.toolbar(list.length)
      + KIT.table(C, list, Object.keys(by).sort().reverse().map(s => ({ label: cl(s) + ' · ' + by[s].length + '명', rows: by[s] })), '조건에 맞는 발령자가 없습니다.') + '</div>';
    KIT.list = list; KIT.cols = C;
  };
  KIT.onChip = (k, v) => { S[k] = v; if (k === 'g' && S.d !== 'all' && !G.deptsOf(S.g).includes(S.d)) S.d = 'all'; };
  KIT.onDept = v => { S.d = v; };
  KIT.onSearch = v => { S.q = v; };
  KIT.start();
}
</script></body></html>`;
}

// 두 명단 화면이 함께 쓰는 표 기능: 열 필터, 엑셀 다운로드, 인쇄·PDF (브라우저에서 실행되는 코드)
function tableKit_() {
  return String.raw`
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const dot = s => s ? s.replace(/-/g, '.') : '';
const app = document.getElementById('app');
document.getElementById('dash').href = P.dash;
document.getElementById('who').textContent = P.who ? '접속 계정: ' + P.who : '';
function showErr() {
  app.innerHTML = '<div class="card err"><b>명단을 볼 수 없습니다.</b><p>이 페이지는 원본 구글 시트(신규간호사 명단)에 접근 권한이 있는 계정으로만 열 수 있습니다.' + (P.who ? ' 현재 계정: <b>' + esc(P.who) + '</b>' : '') + '</p><p class="muted">' + esc(P.err) + '</p></div>';
}
function groupsOf(rows) {
  const names = P.data.groups.map(g => g[0]);
  const extra = [...new Set(rows.filter(r => r.group === '기타').map(r => r.dept))].sort();
  if (extra.length) { names.push('기타'); P.data.groups.push(['기타', extra]); }
  return { names: names, deptsOf: g => g === 'all' ? P.data.groups.reduce((a, x) => a.concat(x[1]), []) : (P.data.groups.find(x => x[0] === g) || ['', []])[1] };
}
function chips(S, key, vals, label) {
  return '<span class="chips">' + ['all'].concat(vals).map(v => '<button class="chip" data-k="' + key + '" data-v="' + esc(v) + '" aria-pressed="' + (S[key] === v) + '">' + (v === 'all' ? '전체' : esc(label(v))) + '</button>').join('') + '</span>';
}
function deptSelect(S, G, cnt) {
  return '<select id="d"><option value="all">전체' + (S.g === 'all' ? '' : ' (' + esc(S.g) + ')') + '</option>' + G.deptsOf(S.g).map(d => '<option value="' + esc(d) + '"' + (S.d === d ? ' selected' : '') + '>' + esc(d) + ' (' + (cnt[d] || 0) + '명)</option>').join('') + '</select>';
}
// 엑셀(.xlsx) 파일을 외부 라이브러리 없이 만든다 (압축하지 않은 zip + 시트 XML)
function makeXlsx(aoa, sheetName) {
  const enc = new TextEncoder();
  const xe = s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const n = aoa[0].length, last = colName(n - 1) + aoa.length;
  const widths = aoa[0].map((h, i) => Math.min(40, Math.max(6, ...aoa.map(r => String(r[i] == null ? '' : r[i]).length * 1.8 + 2))));
  const rowsXml = aoa.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, ci) => {
    const ref = colName(ci) + (ri + 1), st = ri === 0 ? ' s="1"' : '';
    return typeof v === 'number' && isFinite(v) ? '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>'
      : '<c r="' + ref + '" t="inlineStr"' + st + '><is><t xml:space="preserve">' + xe(v == null ? '' : v) + '</t></is></c>';
  }).join('') + '</row>').join('');
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files = [
    ['[Content_Types].xml', head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + R + '/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', head + '<workbook xmlns="' + NS + '" xmlns:r="' + R + '"><sheets><sheet name="' + xe(sheetName) + '" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'' + xe(sheetName) + '\'!$A$1:$' + colName(n - 1) + '$' + aoa.length + '</definedName></definedNames></workbook>'],
    ['xl/_rels/workbook.xml.rels', head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + R + '/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="' + R + '/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', head + '<styleSheet xmlns="' + NS + '"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EFFF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ['xl/worksheets/sheet1.xml', head + '<worksheet xmlns="' + NS + '"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w.toFixed(1) + '" customWidth="1"/>').join('') + '</cols><sheetData>' + rowsXml + '</sheetData><autoFilter ref="A1:' + last + '"/></worksheet>'],
  ];
  const table = []; for (let k = 0; k < 256; k++) { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[k] = c >>> 0; }
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = table[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const parts = [], cent = []; let off = 0;
  files.forEach(f => {
    const nm = enc.encode(f[0]), d = enc.encode(f[1]), crc = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, d);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    cent.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + d.length;
  });
  const size = cent.reduce((s, a) => s + a.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob(parts.concat(cent, [new Uint8Array(e.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
const BLANK = '∅';
const KIT = {
  cf: {},
  // 열마다 고를 값 목록을 만들고(필터 전 목록 기준), 열 필터를 적용한 목록을 돌려준다
  prep(C, pre) {
    C.forEach(c => {
      c.vals = [...new Set(pre.map(r => c.v(r)))].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
      c.many = c.vals.length > 30;
    });
    return pre.filter(r => C.every((c, i) => {
      const f = KIT.cf[i]; if (!f) return true;
      const v = c.v(r);
      return c.many ? v.toLowerCase().includes(f.toLowerCase()) : f === BLANK ? v === '' : v === f;
    }));
  },
  cfLabel(C) {
    const n = Object.keys(KIT.cf).filter(i => KIT.cf[i]).length;
    return n ? ' · 열 필터 ' + n + '개' : '';
  },
  toolbar(n) {
    const on = Object.keys(KIT.cf).some(i => KIT.cf[i]);
    return '<div class="tb noprint"><span class="muted">각 열 제목 아래 칸에서 값을 고르면 표를 거를 수 있습니다 · ' + n + '명</span><span class="tbb">'
      + (on ? '<button class="btn sm" data-act="reset">열 필터 초기화</button>' : '')
      + '<button class="btn sm" data-act="xlsx">엑셀 다운로드</button><button class="btn sm" data-act="print">인쇄</button><button class="btn sm" data-act="pdf">PDF 저장</button></span></div>'
      + '<p class="ptitle">' + esc(document.title) + ' · ' + esc(KIT.cond) + ' · ' + n + '명 · 출력 ' + new Date().toLocaleDateString('ko-KR') + '</p>';
  },
  table(C, list, groups, empty) {
    const head = '<tr>' + C.map((c, i) => '<th class="' + (c.l ? 'l' : '') + (KIT.cf[i] ? ' fon' : '') + '">' + esc(c.h) + '</th>').join('') + '</tr>'
      + '<tr class="fr noprint">' + C.map((c, i) => {
        const f = KIT.cf[i] || '';
        return '<th>' + (c.many
          ? '<input data-cf="' + i + '" placeholder="포함 검색" value="' + esc(f) + '">'
          : '<select data-cf="' + i + '"' + (f ? ' class="on"' : '') + '><option value="">전체</option>' + c.vals.map(v => { const val = v === '' ? BLANK : v; return '<option value="' + esc(val) + '"' + (val === f ? ' selected' : '') + '>' + esc(v === '' ? '(빈칸)' : v) + '</option>'; }).join('') + '</select>') + '</th>';
      }).join('') + '</tr>';
    const cell = (c, r) => { const v = c.html ? c.html(r) : (c.b ? '<b>' + esc(c.v(r)) + '</b>' : esc(c.v(r))); return '<td' + (c.l ? ' class="l"' : '') + '>' + v + '</td>'; };
    const body = list.length ? groups.map(g => '<tr class="mh"><td colspan="' + C.length + '">' + esc(g.label) + '</td></tr>'
      + g.rows.map(r => '<tr' + (KIT.rowClass && KIT.rowClass(r) ? ' class="' + KIT.rowClass(r) + '"' : '') + '>' + C.map(c => cell(c, r)).join('') + '</tr>').join('')).join('')
      : '<tr><td colspan="' + C.length + '" class="empty">' + empty + '</td></tr>';
    return '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  },
  // 지금 표에 보이는 행·열 그대로 엑셀(.xlsx)로 저장
  xlsx() {
    const C = KIT.cols, list = KIT.list;
    const aoa = [C.map(c => c.h)].concat(list.map(r => C.map(c => c.x ? c.x(r) : c.v(r))));
    const day = new Date(), ymd = day.getFullYear() + String(day.getMonth() + 1).padStart(2, '0') + String(day.getDate()).padStart(2, '0');
    const name = KIT.title + '_' + ymd;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(makeXlsx(aoa, '명단'));
    a.download = name + '.xlsx'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show';
    clearTimeout(KIT.tt); KIT.tt = setTimeout(() => { t.className = ''; }, 4000);
  },
  redraw(focus) {
    const el = focus ? document.querySelector(focus) : null, p = el && el.selectionStart;
    KIT.draw();
    if (focus) { const n = document.querySelector(focus); if (n) { n.focus(); if (p != null && n.setSelectionRange) n.setSelectionRange(p, p); } }
  },
  start() {
    app.addEventListener('click', e => {
      const ch = e.target.closest('[data-k]');
      if (ch) { KIT.onChip(ch.dataset.k, ch.dataset.v); KIT.cf = {}; KIT.draw(); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'reset') { KIT.cf = {}; KIT.draw(); }
      else if (act === 'xlsx') KIT.xlsx();
      else if (act === 'print') window.print();
      else if (act === 'pdf') { KIT.toast('인쇄 창의 "대상(프린터)"에서 "PDF로 저장"을 고른 뒤 저장을 누르세요.'); setTimeout(() => window.print(), 600); }
    });
    app.addEventListener('change', e => {
      if (e.target.id === 'd') { KIT.onDept(e.target.value); KIT.cf = {}; KIT.draw(); }
      else if (e.target.matches('select[data-cf]')) { KIT.cf[e.target.dataset.cf] = e.target.value; KIT.draw(); }
    });
    app.addEventListener('input', e => {
      if (e.target.id === 'q') { KIT.onSearch(e.target.value); KIT.redraw('#q'); }
      else if (e.target.matches('input[data-cf]')) { KIT.cf[e.target.dataset.cf] = e.target.value; KIT.redraw('input[data-cf="' + e.target.dataset.cf + '"]'); }
    });
    KIT.draw();
  },
};
`;
}
