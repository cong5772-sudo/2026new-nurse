/**
 * 신규간호사 사직자 명단 (관리자 전용 페이지)
 *
 * 공개 대시보드에는 이름을 싣지 않고, 사직자 이름·부서·발령일·사직일은 이 페이지에서만 보여준다.
 * 열람 권한: 원본 시트의 '명단열람 허용' 탭에 이메일이 적힌 계정(과 시트 소유자)만 명단을 볼 수 있다.
 *   허용된 사람에게 원본 시트를 공유할 필요는 없다.
 *
 * 배포 2개 (같은 프로젝트, 같은 코드):
 *   1) 명단 화면 — 실행: "웹 앱에 액세스하는 사용자", 액세스: "Google 계정이 있는 모든 사용자"
 *      → 접속한 사람의 이메일을 확인한 뒤, 2)에 명단을 요청한다.
 *   2) 데이터 통로 — 실행: "나(소유자)", 액세스: "모든 사용자"
 *      → 접근 키(스크립트 속성 ADMIN_API_KEY)가 맞고 허용 명단에 있는 이메일일 때만 명단 JSON을 돌려준다.
 * 스크립트 속성: ADMIN_API_KEY(임의의 긴 문자열), ADMIN_API_URL(2)의 /exec 주소)
 *
 * 대시보드와 별도의 Apps Script 프로젝트에 이 파일만 넣어 사용한다.
 */

const ADMIN = {
  SHEET_ID: '1wmsLCPfP7NafHpgl7XwuE87kc42hLq3zFLgUAkKTdPA',
  ROSTER_SHEET: '26신규명단',   // 연도별 탭('NN신규명단')을 못 찾을 때만 쓰는 기본 탭
  TZ: 'Asia/Seoul',
  TITLE: '신규간호사 사직자 명단',
  PLACED_TITLE: '신규간호사 발령 명단',
  ALLOW_SHEET: '명단열람 허용',   // 명단을 볼 수 있는 이메일 목록 탭
  SELF_URL: 'https://script.google.com/macros/s/AKfycbxcWbV3KAnq5ivlE_AuhsmF8bMcci980Qk1rNUwtN49pQUdnZjpAY-FaXAmD9fyFTQygA/exec', // 1) 명단 화면 주소
  // 발령 명단에 함께 보여줄 열 (시트에 있는 것만 표시, 나머지 열은 뒤에 자동으로 붙음)
  PLACED_COLS: ['사원번호', '생년월일', '출신학교', '석차백분율', 'AI역량검사평가'],
  DASHBOARD_URL: 'https://haeundae-newnurse.vercel.app/#p2',
  GROUPS: [
    ['일반병동', ['12A', '12B', '11B', '10A', '10B', '8A', '8B', '7B', '6A']],
    ['통합병동', ['14A', '14B', '13A', '13B', '11A', '9A', '9B', '7A']],
    ['중환자', ['MICU', 'SICU', 'EICU', 'NICU', 'MFICU']],
    ['수술회복', ['수술실', '회복실']],
    ['응급', ['응급실']],
  ],
};

function doGet(e) {
  const prm = (e && e.parameter) || {};
  if (prm.api) return adminApi_(prm); // 2) 데이터 통로 (소유자 권한 배포에서만 쓰임)
  // 1) 명단 화면: 접속한 사람의 이메일 확인과 데이터 통로 호출에 필요한 권한만 요청
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/script.external_request']);
  const view = prm.view === 'placed' ? 'placed' : prm.view === 'survey' ? 'survey' : 'resign';
  let who = '';
  try { who = Session.getActiveUser().getEmail(); } catch (x) {}
  let data = null, err = '';
  try {
    data = fetchAdminData_(view, who);
  } catch (x) {
    err = String(x && x.message || x);
  }
  const self = ADMIN.SELF_URL;
  const month = (e && e.parameter && e.parameter.m) || '';
  const html = view === 'placed' ? placedPage_(data, err, who, self) : view === 'survey' ? surveyPage_(data, err, who, self) : page_(data, err, month, who, self);
  return HtmlService.createHtmlOutput(html)
    .setTitle(view === 'placed' ? ADMIN.PLACED_TITLE : view === 'survey' ? '교육과정 만족도 · 설문 결과 등록' : ADMIN.TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 1) 명단 화면 → 2) 데이터 통로에 명단 요청 (접속자 이메일과 접근 키를 함께 보냄)
function fetchAdminData_(view, who) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('ADMIN_API_URL'), key = props.getProperty('ADMIN_API_KEY');
  if (!url || !key) throw new Error('관리자 데이터 연결 설정(스크립트 속성 ADMIN_API_URL·ADMIN_API_KEY)이 없습니다.');
  if (!who) throw new Error('구글 계정 이메일을 확인할 수 없습니다. 구글에 로그인한 뒤 다시 열어 주세요.');
  const res = UrlFetchApp.fetch(url + '?api=1&view=' + encodeURIComponent(view) + '&email=' + encodeURIComponent(who) + '&key=' + encodeURIComponent(key), { muteHttpExceptions: true, followRedirects: true });
  let out;
  try { out = JSON.parse(res.getContentText()); } catch (x) { throw new Error('관리자 데이터를 불러오지 못했습니다. (응답 ' + res.getResponseCode() + ')'); }
  if (out.error) throw new Error(out.error);
  return out.data;
}

// 2) 데이터 통로: 접근 키와 허용 명단을 확인한 뒤 소유자 권한으로 시트를 읽어 돌려준다
function adminApi_(prm) {
  const json = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  const key = PropertiesService.getScriptProperties().getProperty('ADMIN_API_KEY');
  if (!key || prm.key !== key) return json({ error: '접근 키가 맞지 않습니다.' });
  try {
    if (!isAllowed_(String(prm.email || ''))) return json({ error: 'NOT_ALLOWED' });
    return json({ data: prm.view === 'placed' ? readPlaced_() : prm.view === 'survey' ? listSurvey_() : readResigned_() });
  } catch (x) {
    return json({ error: String(x && x.message || x) });
  }
}

// 허용 여부: 시트 소유자이거나 '명단열람 허용' 탭에 이메일이 있으면 허용 (대소문자 무시)
function isAllowed_(email) {
  email = email.trim().toLowerCase();
  if (!email) return false;
  let owner = '';
  try { owner = Session.getEffectiveUser().getEmail().toLowerCase(); } catch (x) {}
  if (email === owner) return true;
  const sh = SpreadsheetApp.openById(ADMIN.SHEET_ID).getSheetByName(ADMIN.ALLOW_SHEET);
  if (!sh) return false;
  return sh.getDataRange().getDisplayValues().some(r => r.some(v => String(v).trim().toLowerCase() === email));
}

// 연도별 명단 탭('26신규명단', '27신규명단' …)을 모두 읽는다. 없으면 기본 탭(ROSTER_SHEET)
function roster_() {
  const ss = SpreadsheetApp.openById(ADMIN.SHEET_ID);
  let sheets = ss.getSheets().filter(sh => /^\d{2}신규명단$/.test(sh.getName().replace(/\s+/g, '')))
    .sort((a, b) => a.getName().localeCompare(b.getName()));
  if (!sheets.length) { const sh = ss.getSheetByName(ADMIN.ROSTER_SHEET); if (sh) sheets = [sh]; }
  if (!sheets.length) throw new Error("'NN신규명단' 이름의 명단 탭을 찾을 수 없습니다.");
  const tabs = [];
  sheets.forEach(sh => {
    const range = sh.getDataRange();
    const rows = range.getValues(), shown = range.getDisplayValues();
    const hi = rows.findIndex(r => r.some(v => String(v).trim() === '부서') && r.some(v => String(v).trim() === '발령일자'));
    if (hi < 0) return; // 머리글이 없는 탭은 건너뜀
    tabs.push({ name: sh.getName(), rows: rows, shown: shown, hi: hi, head: rows[hi].map(v => String(v).trim()) });
  });
  if (!tabs.length) throw new Error('명단 머리글(부서·발령일자)을 찾을 수 없습니다.');
  return tabs;
}

function ymd_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, ADMIN.TZ, 'yyyy-MM-dd');
  const m = String(v || '').trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  return m ? `${m[1]}-${('0' + m[2]).slice(-2)}-${('0' + m[3]).slice(-2)}` : '';
}

// 회차 번호는 연도마다 1차부터 (예: 2027-01-01 → 2027년 1차)
function cohortNo_(starts) {
  const no = {};
  Object.keys(starts).sort().forEach(s => { const y = s.slice(0, 4); no[y] = (no[y] || 0) + 1; starts[s] = no[y] + '차'; });
  return starts;
}

// 신규 발령 명단: 발령자 전원과 발령 정보, 재직·사직 상태
function readPlaced_() {
  const tabs = roster_();
  const groupOf = {};
  ADMIN.GROUPS.forEach(g => g[1].forEach(d => { groupOf[d] = g[0]; }));
  const used = ['성명', '성별', '부서', '발령일자', '사직일', '사직발생기간', '사직사유', '업데이트일시', ''];
  // 함께 보여줄 열: 정해 둔 순서 먼저, 나머지 열은 탭에 나온 순서대로 (여러 탭의 열을 합침)
  const all = [];
  tabs.forEach(T => T.head.forEach(k => { if (all.indexOf(k) < 0) all.push(k); }));
  const pref = ADMIN.PLACED_COLS.filter(k => all.indexOf(k) >= 0);
  let cols = pref.concat(all.filter(k => used.indexOf(k) < 0 && pref.indexOf(k) < 0 && !/^(no\.?|순번|번호|연번)$/i.test(k)));
  const today = Utilities.formatDate(new Date(), ADMIN.TZ, 'yyyy-MM-dd');
  const starts = {}, list = [];
  tabs.forEach(T => {
    const col = k => T.head.indexOf(k);
    const C = { name: col('성명'), gender: col('성별'), dept: col('부서'), start: col('발령일자'), end: col('사직일'), reason: col('사직사유') };
    const ci = cols.map(k => col(k));
    for (let i = T.hi + 1; i < T.rows.length; i++) {
      const r = T.rows[i];
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
        x: ci.map(j => j >= 0 ? String(T.shown[i][j] || '').trim() : ''),
      });
    }
  });
  // 값이 하나도 없는 열은 빼기
  const keep = cols.map((c, j) => list.some(x => x.x[j]));
  cols = cols.filter((c, j) => keep[j]);
  list.forEach(x => { x.x = x.x.filter((v, j) => keep[j]); });
  const no = cohortNo_(Object.assign({}, starts));
  list.forEach(x => { x.cohort = no[x.start]; });
  const gi = {};
  ADMIN.GROUPS.forEach((g, n) => g[1].forEach((d, m) => { gi[d] = n * 100 + m; }));
  const ord = d => (d in gi ? gi[d] : 9999);
  list.sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : (ord(a.dept) - ord(b.dept)) || a.name.localeCompare(b.name)));
  return { rows: list, cols: cols, cohorts: Object.keys(starts).sort(), cohortNo: no, generated: Utilities.formatDate(new Date(), ADMIN.TZ, 'yyyy-MM-dd HH:mm'), groups: ADMIN.GROUPS };
}

function readResigned_() {
  const tabs = roster_();
  const groupOf = {};
  ADMIN.GROUPS.forEach(g => g[1].forEach(d => { groupOf[d] = g[0]; }));
  const starts = {}, list = [];
  tabs.forEach(T => {
    const head = T.head;
    const C = { name: head.indexOf('성명'), gender: head.indexOf('성별'), dept: head.indexOf('부서'), start: head.indexOf('발령일자'),
      end: head.indexOf('사직일'), period: head.indexOf('사직발생기간'), reason: head.indexOf('사직사유') };
    for (let i = T.hi + 1; i < T.rows.length; i++) {
      const r = T.rows[i];
      const dept = String(r[C.dept] || '').trim(), start = ymd_(r[C.start]);
      if (!dept || !start) continue;
      starts[start] = true;
      const end = C.end >= 0 ? ymd_(r[C.end]) : '';
      if (!end) continue;
      list.push({
        name: String(C.name >= 0 ? r[C.name] : '').trim(),
        gender: String(C.gender >= 0 ? r[C.gender] : '').trim().replace('자', ''),
        dept: dept, group: groupOf[dept] || '기타', start: start, end: end,
        days: Math.round((Date.parse(end) - Date.parse(start)) / 864e5),
        period: String(C.period >= 0 ? r[C.period] : '').trim(),
        reason: String(C.reason >= 0 ? r[C.reason] : '').trim() || '미기재',
      });
    }
  });
  const no = cohortNo_(starts);
  list.forEach(x => { x.cohort = no[x.start]; });
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
  renderErr();
} else {
  document.getElementById('gen').textContent = '조회 ' + P.data.generated;
  const rows = P.data.rows;
  const months = [...new Set(rows.map(r => r.end.slice(0, 7)))].sort().reverse();
  const years = [...new Set(rows.map(r => r.start.slice(0, 4)))].sort();
  const S = { y: 'all', m: months.includes(P.month) ? P.month : 'all', g: 'all', d: 'all', q: '' };
  const yc = r => (years.length > 1 ? r.start.slice(2, 4) + '년 ' : '') + r.cohort;
  const G = groupsOf(rows);
  const ml = m => m.slice(0, 4) + '년 ' + (+m.slice(5)) + '월';
  const C = [
    { h: '사직일', v: r => dot(r.end) },
    { h: '부서', v: r => r.dept, l: 1, b: 1 },
    { h: '부서군', v: r => r.group },
    { h: '성명', v: r => r.name, l: 1, b: 1 },
    { h: '성별', v: r => r.gender },
    { h: '발령 회차', v: yc },
    { h: '발령일', v: r => dot(r.start) },
    { h: '근속(일)', v: r => String(r.days), x: r => r.days },
    { h: '사직 시기', v: r => r.period },
    { h: '사직 사유', v: r => r.reason, l: 1 },
  ];
  KIT.title = '신규간호사_사직자명단';
  KIT.draw = function () {
    const q = S.q.trim().toLowerCase();
    const hit = r => !q || (r.name + r.dept + r.reason).toLowerCase().includes(q);
    const pre = rows.filter(r => (S.y === 'all' || r.start.startsWith(S.y)) && (S.m === 'all' || r.end.slice(0, 7) === S.m) && (S.g === 'all' || r.group === S.g) && (S.d === 'all' || r.dept === S.d) && hit(r));
    const list = KIT.prep(C, pre);
    const cnt = {}; rows.filter(r => (S.y === 'all' || r.start.startsWith(S.y)) && (S.m === 'all' || r.end.slice(0, 7) === S.m) && hit(r)).forEach(r => { cnt[r.dept] = (cnt[r.dept] || 0) + 1; });
    const by = {}; list.forEach(r => { (by[r.end.slice(0, 7)] = by[r.end.slice(0, 7)] || []).push(r); });
    const avg = list.length ? Math.round(list.reduce((s, r) => s + r.days, 0) / list.length) : 0;
    const early = list.filter(r => r.days <= 92).length;
    KIT.cond = (S.y === 'all' ? '' : S.y + '년 발령 · ') + (S.m === 'all' ? '전체 기간' : ml(S.m)) + (S.g === 'all' ? '' : ' · ' + S.g) + (S.d === 'all' ? '' : ' · ' + S.d) + KIT.cfLabel(C);
    app.innerHTML = '<div class="card filters">'
      + '<div><span class="fl">발령 연도</span>' + chips(S, 'y', years.slice().reverse(), v => v + '년') + '</div>'
      + '<div><span class="fl">사직월</span>' + chips(S, 'm', months, ml) + '</div>'
      + '<div><span class="fl">부서군</span>' + chips(S, 'g', G.names, v => v) + '</div>'
      + '<div><span class="fl">세부부서</span>' + deptSelect(S, G, cnt) + '</div>'
      + '<div><span class="fl">검색</span><input id="q" placeholder="이름·부서·사유" value="' + esc(S.q) + '"></div></div>'
      + '<div class="card sum"><span>사직자 <b>' + list.length + '</b>명</span><span>입사 3개월 이내 <b>' + early + '</b>명</span><span>평균 근속 <b>' + avg + '</b>일</span><span class="muted">' + esc(KIT.cond) + '</span></div>'
      + '<div class="card tw">' + KIT.toolbar(list.length)
      + KIT.table(C, list, Object.keys(by).sort().reverse().map(m => ({ label: ml(m) + ' · ' + by[m].length + '명', rows: by[m] })), '조건에 맞는 사직자가 없습니다.') + '</div>';
    KIT.list = list; KIT.cols = C;
  };
  KIT.onChip = (k, v) => { S[k] = v; if (k === 'y' && 'c' in S) S.c = 'all'; if (k === 'g' && S.d !== 'all' && !G.deptsOf(S.g).includes(S.d)) S.d = 'all'; };
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
:root{--ink:#111827;--ink2:#4b5563;--muted:#6b7280;--line:#e7e7ea;--line2:#d4d4d8;--bg:#fafafa;--hd:#e4e8ee;--hd-ink:#334155;--gh:#f3ece0;--gh-ink:#7a541a;--gh-bar:#c9974a;--accent:#2563eb;--soft:#e8efff;--navy:#1f3a68;--crit:#c81e1e}
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
th{background:var(--hd);color:var(--hd-ink);font-weight:700;font-size:12px;border-bottom:1px solid #cbd2dc}td.l,th.l{text-align:left}
tr.mh td{background:var(--gh);color:var(--gh-ink);font-weight:700;text-align:left;box-shadow:inset 3px 0 0 var(--gh-bar)}
td b{font-weight:700}.muted{color:var(--muted)}.tw{overflow-x:auto}
.empty{padding:24px;text-align:center;color:var(--muted)}
.err{border-left:4px solid var(--crit)}
.vt{display:flex;gap:4px;background:#f0f1f3;border-radius:10px;padding:3px}.vt a{padding:6px 14px;border-radius:8px;color:var(--ink2);text-decoration:none;font-weight:600;font-size:13px}.vt a.on{background:#fff;color:var(--accent);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.tb{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;font-size:12.5px}
.tbb{display:flex;gap:6px;flex-wrap:wrap}
a.btn.sm,button.btn.sm{height:30px;padding:0 12px;font-size:12.5px}
.hb{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:2px 4px;border-radius:6px}.hb:hover{background:#d5dce6}
.hb .ar{font-size:10px;color:var(--muted);display:inline-flex;align-items:center;gap:2px}
th.fon .hb{color:var(--accent)}th.fon .ar{color:var(--accent)}
.fdot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent)}
.pop{position:absolute;z-index:20;width:240px;background:#fff;border:1px solid var(--line2);border-radius:10px;box-shadow:0 10px 28px rgba(15,23,42,.18);padding:6px;font-size:13px}
.pop .pi{all:unset;display:block;width:100%;box-sizing:border-box;padding:7px 10px;border-radius:6px;cursor:pointer}.pop .pi:hover{background:var(--soft);color:var(--accent)}
.pop .psep{height:1px;background:var(--line);margin:6px 0}
.pop .ph{font-size:12px;font-weight:600;color:var(--ink2);padding:2px 6px 6px}
.pop .ps{width:100%;height:30px;font-size:12.5px;margin-bottom:6px}
.pop .pa{display:block;padding:4px 6px;font-weight:600;border-bottom:1px solid var(--line)}
.pop .pl{max-height:220px;overflow:auto;padding:4px 0}.pop .pl label{display:block;padding:3px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}.pop .pl label:hover{background:#f4f4f5}
.pop input[type=checkbox]{width:14px;height:14px;margin:0 6px 0 0;vertical-align:-2px}
.pop .pf{display:flex;gap:6px;justify-content:flex-end;padding-top:6px;border-top:1px solid var(--line);margin-top:4px}
button.btn.ghost{border-color:var(--line2);color:var(--ink2)}
@media print{.hb .ar{display:none}.pop{display:none}}
.ptitle{display:none}
#notice{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;opacity:0;pointer-events:none;transition:opacity .2s;z-index:9}#notice.show{opacity:1}
@media print{.ptitle{display:block;margin:0 0 6px;font-size:10pt;font-weight:600}.tw{overflow:visible!important}#notice{display:none}}
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
  renderErr();
} else {
  document.getElementById('gen').textContent = '조회 ' + P.data.generated;
  const rows = P.data.rows, cols = P.data.cols, coh = P.data.cohorts;
  const G = groupsOf(rows);
  const years = [...new Set(coh.map(c => c.slice(0, 4)))].sort();
  const S = { y: years.length > 1 ? years[years.length - 1] : 'all', c: 'all', g: 'all', d: 'all', s: 'all', q: '' };
  const cl = c => (years.length > 1 ? c.slice(0, 4) + '년 ' : '') + P.data.cohortNo[c] + ' (' + dot(c) + ')';
  const C = (years.length > 1 ? [{ h: '발령연도', v: r => r.start.slice(0, 4) + '년' }] : []).concat([
    { h: '회차', v: r => r.cohort },
    { h: '발령일', v: r => dot(r.start) },
    { h: '부서', v: r => r.dept, l: 1, b: 1 },
    { h: '부서군', v: r => r.group },
    { h: '성명', v: r => r.name, l: 1, b: 1 },
    { h: '성별', v: r => r.gender },
  ]).concat(cols.map((k, j) => ({ h: k, v: r => r.x[j] }))).concat([
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
    const pre = rows.filter(r => (S.y === 'all' || r.start.startsWith(S.y)) && (S.c === 'all' || r.start === S.c) && (S.g === 'all' || r.group === S.g) && (S.d === 'all' || r.dept === S.d) && (S.s === 'all' || (S.s === 'on' ? !r.end : !!r.end)) && hit(r));
    const list = KIT.prep(C, pre);
    const cnt = {}; rows.filter(r => (S.y === 'all' || r.start.startsWith(S.y)) && (S.c === 'all' || r.start === S.c) && hit(r)).forEach(r => { cnt[r.dept] = (cnt[r.dept] || 0) + 1; });
    const out = list.filter(r => r.end).length;
    const by = {}; list.forEach(r => { (by[r.start] = by[r.start] || []).push(r); });
    KIT.cond = (S.y === 'all' ? '' : S.y + '년 · ') + (S.c === 'all' ? '전체 회차' : cl(S.c)) + (S.g === 'all' ? '' : ' · ' + S.g) + (S.d === 'all' ? '' : ' · ' + S.d) + (S.s === 'all' ? '' : ' · ' + (S.s === 'on' ? '재직자' : '사직자')) + KIT.cfLabel(C);
    app.innerHTML = '<div class="card filters">'
      + '<div><span class="fl">발령 연도</span>' + chips(S, 'y', years.slice().reverse(), v => v + '년') + '</div>'
      + '<div><span class="fl">발령 회차</span>' + chips(S, 'c', coh.filter(c => S.y === 'all' || c.startsWith(S.y)).reverse(), cl) + '</div>'
      + '<div><span class="fl">부서군</span>' + chips(S, 'g', G.names, v => v) + '</div>'
      + '<div><span class="fl">세부부서</span>' + deptSelect(S, G, cnt) + '</div>'
      + '<div><span class="fl">상태</span>' + chips(S, 's', ['on', 'off'], v => v === 'on' ? '재직' : '사직') + '</div>'
      + '<div><span class="fl">검색</span><input id="q" placeholder="이름·부서·학교 등" value="' + esc(S.q) + '"></div></div>'
      + '<div class="card sum"><span>발령 <b>' + list.length + '</b>명</span><span>재직 <b>' + (list.length - out) + '</b>명</span><span>사직 <b>' + out + '</b>명</span><span>사직율 <b>' + (list.length ? (out / list.length * 100).toFixed(1) : '0.0') + '</b>%</span><span class="muted">' + esc(KIT.cond) + '</span></div>'
      + '<div class="card tw">' + KIT.toolbar(list.length)
      + KIT.table(C, list, Object.keys(by).sort().reverse().map(s => ({ label: cl(s) + ' · ' + by[s].length + '명', rows: by[s] })), '조건에 맞는 발령자가 없습니다.') + '</div>';
    KIT.list = list; KIT.cols = C;
  };
  KIT.onChip = (k, v) => { S[k] = v; if (k === 'y' && 'c' in S) S.c = 'all'; if (k === 'g' && S.d !== 'all' && !G.deptsOf(S.g).includes(S.d)) S.d = 'all'; };
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
function renderErr() {
  const no = P.err === 'NOT_ALLOWED';
  app.innerHTML = '<div class="card err"><b>' + (no ? '열람이 허용되지 않은 계정입니다.' : '명단을 볼 수 없습니다.') + '</b><p>이 페이지는 열람이 허용된 관리자 계정만 볼 수 있습니다.' + (P.who ? ' 현재 계정: <b>' + esc(P.who) + '</b>' : '') + '</p>'
    + (no ? '<p class="muted">열람이 필요하면 간호교육팀에 위 계정 이메일을 알려 주세요.</p>' : '<p class="muted">' + esc(P.err) + '</p>') + '</div>';
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
const BLANK = '(빈칸)';
const KIT = {
  cf: {},        // 열 번호 → 보이게 둘 값 목록 (없으면 전체)
  sort: null,    // { i: 열 번호, dir: 1 오름차순 / -1 내림차순 }
  cmp(c, a, b) {
    const x = c.x ? c.x(a) : c.v(a), y = c.x ? c.x(b) : c.v(b);
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    if (x === '' && y !== '') return 1; if (y === '' && x !== '') return -1;   // 빈칸은 항상 맨 뒤
    return String(x).localeCompare(String(y), 'ko', { numeric: true });
  },
  // 열마다 고를 값 목록을 만들고(열 필터 적용 전 기준), 열 필터를 적용한 목록을 돌려준다
  prep(C, pre) {
    C.forEach(c => {
      const vs = [...new Set(pre.map(r => c.v(r)))];
      c.vals = vs.sort((a, b) => a === '' ? 1 : b === '' ? -1 : (c.x ? 0 : a.localeCompare(b, 'ko', { numeric: true })));
      if (c.x) c.vals = vs.sort((a, b) => a === '' ? 1 : b === '' ? -1 : (+a) - (+b));
    });
    return pre.filter(r => C.every((c, i) => !KIT.cf[i] || KIT.cf[i].includes(c.v(r))));
  },
  cfLabel(C) {
    const n = Object.keys(KIT.cf).length;
    return (n ? ' · 열 필터 ' + n + '개' : '') + (KIT.sort ? ' · ' + C[KIT.sort.i].h + (KIT.sort.dir > 0 ? ' 오름차순' : ' 내림차순') : '');
  },
  toolbar(n) {
    const on = Object.keys(KIT.cf).length || KIT.sort;
    return '<div class="tb noprint"><span class="muted">열 제목을 누르면 엑셀처럼 정렬·필터를 할 수 있습니다 · ' + n + '명</span><span class="tbb">'
      + (on ? '<button class="btn sm" data-act="reset">정렬·필터 해제</button>' : '')
      + '<button class="btn sm" data-act="xlsx">엑셀 다운로드</button><button class="btn sm" data-act="print">인쇄</button><button class="btn sm" data-act="pdf">PDF 저장</button></span></div>'
      + '<p class="ptitle">' + esc(document.title) + ' · ' + esc(KIT.cond) + ' · ' + n + '명 · 출력 ' + new Date().toLocaleDateString('ko-KR') + '</p>';
  },
  table(C, list, groups, empty) {
    // 정렬 중이면 묶음 없이 한 목록으로
    if (KIT.sort) {
      const c = C[KIT.sort.i], d = KIT.sort.dir;
      groups = [{ label: '', rows: list.slice().sort((a, b) => { const x = c.v(a), y = c.v(b); if (x === '' || y === '') return x === y ? 0 : x === '' ? 1 : -1; return d * KIT.cmp(c, a, b); }) }];
    }
    KIT.shown = groups.reduce((a, g) => a.concat(g.rows), []);
    const head = '<tr>' + C.map((c, i) => {
      const s = KIT.sort && KIT.sort.i === i ? (KIT.sort.dir > 0 ? '▲' : '▼') : '';
      return '<th class="' + (c.l ? 'l' : '') + (KIT.cf[i] || s ? ' fon' : '') + '"><button class="hb" data-col="' + i + '" title="정렬·필터">' + esc(c.h)
        + '<span class="ar">' + (s || '▾') + (KIT.cf[i] ? '<i class="fdot"></i>' : '') + '</span></button></th>';
    }).join('') + '</tr>';
    const cell = (c, r) => { const v = c.html ? c.html(r) : (c.b ? '<b>' + esc(c.v(r)) + '</b>' : esc(c.v(r))); return '<td' + (c.l ? ' class="l"' : '') + '>' + v + '</td>'; };
    const body = list.length ? groups.map(g => (g.label ? '<tr class="mh"><td colspan="' + C.length + '">' + esc(g.label) + '</td></tr>' : '')
      + g.rows.map(r => '<tr' + (KIT.rowClass && KIT.rowClass(r) ? ' class="' + KIT.rowClass(r) + '"' : '') + '>' + C.map(c => cell(c, r)).join('') + '</tr>').join('')).join('')
      : '<tr><td colspan="' + C.length + '" class="empty">' + empty + '</td></tr>';
    return '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  },
  // 열 제목을 눌렀을 때 뜨는 메뉴: 정렬 + 값 체크 필터
  openPop(i, btn) {
    KIT.closePop();
    const c = KIT.cols[i], sel = KIT.cf[i];
    const pop = document.createElement('div');
    pop.id = 'pop'; pop.className = 'pop'; pop.dataset.col = i;
    pop.innerHTML = '<button class="pi" data-p="asc">↑ 오름차순 정렬</button><button class="pi" data-p="desc">↓ 내림차순 정렬</button>'
      + (KIT.sort && KIT.sort.i === i ? '<button class="pi" data-p="nosort">정렬 해제</button>' : '')
      + '<div class="psep"></div><div class="ph">' + esc(c.h) + ' 필터</div><input class="ps" placeholder="값 검색">'
      + '<label class="pa"><input type="checkbox" class="pall"' + (sel ? '' : ' checked') + '> (모두 선택)</label>'
      + '<div class="pl">' + c.vals.map(v => '<label><input type="checkbox" value="' + esc(v) + '"' + (!sel || sel.includes(v) ? ' checked' : '') + '> ' + esc(v === '' ? BLANK : v) + '</label>').join('') + '</div>'
      + '<div class="pf"><button class="btn sm" data-p="ok">확인</button><button class="btn sm ghost" data-p="cancel">취소</button></div>';
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.top = (r.bottom + window.scrollY + 4) + 'px';
    pop.style.left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - w - 8)) + 'px';
    pop.addEventListener('click', e => {
      const b = e.target.closest('[data-p]'); if (!b) return;
      const p = b.dataset.p;
      if (p === 'asc' || p === 'desc') KIT.sort = { i: i, dir: p === 'asc' ? 1 : -1 };
      else if (p === 'nosort') KIT.sort = null;
      else if (p === 'ok') {
        const boxes = [...pop.querySelectorAll('.pl input')], on = boxes.filter(x => x.checked).map(x => x.value);
        if (on.length === boxes.length) delete KIT.cf[i]; else KIT.cf[i] = on;
      }
      KIT.closePop(); if (p !== 'cancel') KIT.draw();
    });
    pop.addEventListener('input', e => {
      if (e.target.classList.contains('ps')) {
        const q = e.target.value.trim().toLowerCase();
        pop.querySelectorAll('.pl label').forEach(l => { l.style.display = !q || l.textContent.toLowerCase().includes(q) ? '' : 'none'; });
      }
    });
    pop.addEventListener('change', e => {
      if (e.target.classList.contains('pall')) pop.querySelectorAll('.pl label').forEach(l => { if (l.style.display !== 'none') l.querySelector('input').checked = e.target.checked; });
      else if (e.target.closest('.pl')) { const all = [...pop.querySelectorAll('.pl input')]; pop.querySelector('.pall').checked = all.every(x => x.checked); }
    });
    pop.querySelector('.ps').focus();
  },
  closePop() { const p = document.getElementById('pop'); if (p) p.remove(); },
  // 지금 표에 보이는 순서·행·열 그대로 엑셀(.xlsx)로 저장
  xlsx() {
    const C = KIT.cols, list = KIT.shown || KIT.list;
    const aoa = [C.map(c => c.h)].concat(list.map(r => C.map(c => c.x ? c.x(r) : c.v(r))));
    const day = new Date(), ymd = day.getFullYear() + String(day.getMonth() + 1).padStart(2, '0') + String(day.getDate()).padStart(2, '0');
    const name = KIT.title + '_' + ymd;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(makeXlsx(aoa, '명단'));
    a.download = name + '.xlsx'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  notice(msg) {
    let t = document.getElementById('notice');
    if (!t) { t = document.createElement('div'); t.id = 'notice'; document.body.appendChild(t); }
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
      const hb = e.target.closest('[data-col]');
      if (hb) { const i = +hb.dataset.col, open = document.getElementById('pop'); if (open && +open.dataset.col === i) KIT.closePop(); else KIT.openPop(i, hb); return; }
      const ch = e.target.closest('[data-k]');
      if (ch) { KIT.onChip(ch.dataset.k, ch.dataset.v); KIT.cf = {}; KIT.draw(); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'reset') { KIT.cf = {}; KIT.sort = null; KIT.draw(); }
      else if (act === 'xlsx') KIT.xlsx();
      else if (act === 'print') window.print();
      else if (act === 'pdf') { KIT.notice('인쇄 창의 "대상(프린터)"에서 "PDF로 저장"을 고른 뒤 저장을 누르세요.'); setTimeout(() => window.print(), 600); }
    });
    document.addEventListener('mousedown', e => { const p = document.getElementById('pop'); if (p && !p.contains(e.target) && !e.target.closest('[data-col]')) KIT.closePop(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') KIT.closePop(); });
    app.addEventListener('change', e => { if (e.target.id === 'd') { KIT.onDept(e.target.value); KIT.cf = {}; KIT.draw(); } });
    app.addEventListener('input', e => { if (e.target.id === 'q') { KIT.onSearch(e.target.value); KIT.redraw('#q'); } });
    KIT.draw();
  },
};
`;
}

/* ---------- 교육과정 만족도: 설문 결과 파일 업로드 (관리자) ---------- */
const SURVEY_SHEETS = {
  RESP: '교육만족도_응답',
  COH: '교육만족도_회차',
  RESP_HEAD: ['발령일', '번호'].concat(Array.from({ length: 25 }, (_, i) => 'Q' + (i + 1))).concat(['Q26 도움된 교육', 'Q27 의견', 'Q28 근무부서', '등록일시']),
  COH_HEAD: ['발령일', '발령인원', '설문대상', '응답자', '설문시기', '총평1', '총평2', '총평3', '총평4', '파일명', '등록일시', '등록자'],
};

// 명단 화면(접속자 권한)에서 google.script.run으로 부르는 함수: 데이터 통로에 저장을 요청
function saveSurvey(survey) {
  let who = '';
  try { who = Session.getActiveUser().getEmail(); } catch (x) {}
  if (!who) throw new Error('구글 계정 이메일을 확인할 수 없습니다.');
  const props = PropertiesService.getScriptProperties();
  const res = UrlFetchApp.fetch(props.getProperty('ADMIN_API_URL'), {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: true,
    payload: JSON.stringify({ key: props.getProperty('ADMIN_API_KEY'), email: who, action: 'saveSurvey', survey: survey }),
  });
  let out;
  try { out = JSON.parse(res.getContentText()); } catch (x) { throw new Error('저장 응답을 읽지 못했습니다. (응답 ' + res.getResponseCode() + ')'); }
  if (out.error) throw new Error(out.error === 'NOT_ALLOWED' ? '업로드가 허용되지 않은 계정입니다.' : out.error);
  return out.ok;
}

// 데이터 통로(소유자 권한) POST: 저장 요청 처리
function doPost(e) {
  const json = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (x) { return json({ error: '잘못된 요청입니다.' }); }
  const key = PropertiesService.getScriptProperties().getProperty('ADMIN_API_KEY');
  if (!key || body.key !== key) return json({ error: '접근 키가 맞지 않습니다.' });
  try {
    if (!isAllowed_(String(body.email || ''))) return json({ error: 'NOT_ALLOWED' });
    if (body.action === 'saveSurvey') return json({ ok: saveSurveyRows_(body.survey, body.email) });
    return json({ error: '알 수 없는 요청입니다.' });
  } catch (x) {
    return json({ error: String(x && x.message || x) });
  }
}

function surveySheet_(ss, name, head) {
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}

// 같은 발령일 회차가 이미 있으면 교체, 없으면 추가
function saveSurveyRows_(s, email) {
  if (!s || !s.meta || !/^\d{4}-\d{2}-\d{2}$/.test(String(s.meta.date || ''))) throw new Error('발령일을 확인할 수 없습니다.');
  if (!Array.isArray(s.resp) || !s.resp.length) throw new Error('응답 자료가 없습니다.');
  const date = s.meta.date;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.openById(ADMIN.SHEET_ID);
    const now = Utilities.formatDate(new Date(), ADMIN.TZ, 'yyyy-MM-dd HH:mm');
    const shR = surveySheet_(ss, SURVEY_SHEETS.RESP, SURVEY_SHEETS.RESP_HEAD);
    const shC = surveySheet_(ss, SURVEY_SHEETS.COH, SURVEY_SHEETS.COH_HEAD);
    const keep = (sh, w) => { const v = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, w).getValues() : []; return v.filter(r => ymd_(r[0]) !== date); };
    const clean = v => (v == null ? '' : v);
    const rows = keep(shR, SURVEY_SHEETS.RESP_HEAD.length).concat(s.resp.map(r => [date, clean(r.no)]
      .concat(Array.from({ length: 25 }, (_, i) => clean(r.q[i]))).concat([String(r.q26 || ''), String(r.q27 || ''), clean(r.q28), now])));
    const cohs = keep(shC, SURVEY_SHEETS.COH_HEAD.length);
    const n = (s.meta.notes || []).concat(['', '', '', '']).slice(0, 4);
    cohs.push([date, clean(s.meta.placed), clean(s.meta.target), clean(s.meta.resp || s.resp.length), String(s.meta.period || '')].concat(n).concat([String(s.meta.file || ''), now, email]));
    const sortByDate = (a, b) => (ymd_(a[0]) < ymd_(b[0]) ? -1 : ymd_(a[0]) > ymd_(b[0]) ? 1 : 0);
    rows.sort(sortByDate); cohs.sort(sortByDate);
    const write = (sh, v, w) => {
      if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, w).clearContent();
      if (v.length) { sh.getRange(2, 1, v.length, 1).setNumberFormat('@'); sh.getRange(2, 1, v.length, w).setValues(v.map(r => [ymd_(r[0])].concat(r.slice(1)))); }
    };
    write(shR, rows, SURVEY_SHEETS.RESP_HEAD.length);
    write(shC, cohs, SURVEY_SHEETS.COH_HEAD.length);
    return { date: date, n: s.resp.length, cohorts: cohs.length };
  } finally {
    lock.releaseLock();
  }
}

// 등록된 회차 목록 (업로드 화면 표시용)
function listSurvey_() {
  const sh = SpreadsheetApp.openById(ADMIN.SHEET_ID).getSheetByName(SURVEY_SHEETS.COH);
  if (!sh || sh.getLastRow() < 2) return { cohorts: [] };
  return { cohorts: sh.getRange(2, 1, sh.getLastRow() - 1, SURVEY_SHEETS.COH_HEAD.length).getDisplayValues()
    .filter(r => r[0]).map(r => ({ date: ymd_(r[0]), placed: r[1], target: r[2], resp: r[3], period: r[4], file: r[9], at: r[10], by: r[11] })) };
}

function surveyPage_(data, err, who, self) {
  const json = JSON.stringify({ data: data, err: err, who: who, dash: ADMIN.DASHBOARD_URL.replace('#p2', '#p4') }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>교육과정 만족도 · 설문 결과 등록</title>
<style>
${adminCss_()}
.drop{border:2px dashed var(--line2);border-radius:14px;padding:26px;text-align:center;color:var(--ink2);background:#fafbfd;cursor:pointer}
.drop.on{border-color:var(--accent);background:var(--soft)}
.drop b{color:var(--accent)}
.pv td,.pv th{font-size:13px}
.okmsg{color:#15803d;font-weight:600}.bad{color:var(--crit);font-weight:600}
.steps{margin:0;padding-left:18px;color:var(--ink2);font-size:13px;line-height:1.8}
</style></head><body>
<header><h1><i>+</i>교육과정 만족도 · 설문 결과 등록 <span class="tag">관리자 전용</span></h1>${viewTabs_(self, '')}
<div class="hr"><a class="btn home" id="dash" target="_top">← 메인 대시보드</a><span id="who"></span></div></header>
<main id="app"></main>
<script>
const P = ${json};
${tableKit_()}
${xlsxReader_()}
if (P.err || !P.data) { renderErr(); } else {
  let parsed = [];
  const draw = (msg) => {
    const have = P.data.cohorts.map(c => c.date);
    app.innerHTML = '<div class="card"><ol class="steps"><li>간호관리실 양식의 <b>신규간호사 설문조사 결과 엑셀 파일</b>(.xlsx)을 고릅니다. 여러 개를 한 번에 골라도 됩니다.</li><li>아래 미리보기에서 발령일·응답자 수를 확인합니다.</li><li><b>저장</b>을 누르면 대시보드의 교육과정 만족도에 반영됩니다. 같은 발령일 회차가 있으면 새 파일로 바뀝니다.</li></ol></div>'
      + '<label class="drop card" id="drop"><input type="file" id="f" accept=".xlsx" multiple hidden><b>파일 선택</b> 또는 여기에 끌어다 놓기</label>'
      + (parsed.length ? '<div class="card tw"><table class="pv"><thead><tr><th>파일</th><th>발령일</th><th>발령인원</th><th>응답자</th><th>평균 만족도</th><th>임상수행도</th><th>상태</th></tr></thead><tbody>'
        + parsed.map((p, i) => p.error ? '<tr><td class="l">' + esc(p.file) + '</td><td colspan="6" class="bad">' + esc(p.error) + '</td></tr>'
          : '<tr><td class="l">' + esc(p.meta.file) + '</td><td>' + dot(p.meta.date) + '</td><td>' + (p.meta.placed || '–') + '명</td><td>' + p.resp.length + '명</td><td>' + p.avg.toFixed(2) + '</td><td>' + p.perf.toFixed(1) + '</td><td>' + (p.saved ? '<span class="okmsg">저장됨</span>' : have.includes(p.meta.date) ? '기존 회차 교체' : '새 회차') + '</td></tr>').join('')
        + '</tbody></table><div class="tb" style="margin-top:12px"><span class="muted">' + (msg || '') + '</span><span class="tbb"><button class="btn" id="save"' + (parsed.some(p => !p.error && !p.saved) ? '' : ' disabled') + '>저장</button></span></div></div>' : '')
      + '<div class="card tw"><b>등록된 회차</b><table style="margin-top:8px"><thead><tr><th>발령일</th><th>발령인원</th><th>응답자</th><th>설문시기</th><th class="l">파일</th><th>등록</th></tr></thead><tbody>'
      + (P.data.cohorts.length ? P.data.cohorts.map(c => '<tr><td>' + dot(c.date) + '</td><td>' + esc(c.placed) + '</td><td>' + esc(c.resp) + '</td><td>' + esc(c.period) + '</td><td class="l">' + esc(c.file) + '</td><td class="muted">' + esc(c.at) + ' · ' + esc(c.by) + '</td></tr>').join('') : '<tr><td colspan="6" class="empty">아직 없습니다.</td></tr>')
      + '</tbody></table></div>';
  };
  const take = async files => {
    parsed = [];
    for (const f of files) {
      try { const r = await parseSurveyFile(f); parsed.push(r); } catch (e) { parsed.push({ file: f.name, error: String(e.message || e) }); }
    }
    draw();
  };
  app.addEventListener('change', e => { if (e.target.id === 'f') take([...e.target.files]); });
  app.addEventListener('dragover', e => { const d = e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.add('on'); } });
  app.addEventListener('dragleave', e => { const d = e.target.closest('#drop'); if (d) d.classList.remove('on'); });
  app.addEventListener('drop', e => { const d = e.target.closest('#drop'); if (d) { e.preventDefault(); take([...e.dataTransfer.files].filter(f => /\\.xlsx$/i.test(f.name))); } });
  app.addEventListener('click', e => {
    if (e.target.id !== 'save') return;
    e.target.disabled = true;
    const todo = parsed.filter(p => !p.error && !p.saved);
    const next = () => {
      const p = todo.shift();
      if (!p) { draw('저장을 마쳤습니다. 대시보드에는 최대 5분 안에 반영됩니다.'); return; }
      draw(dot(p.meta.date) + ' 회차 저장 중…');
      google.script.run.withSuccessHandler(() => {
        p.saved = true;
        if (!P.data.cohorts.some(c => c.date === p.meta.date)) P.data.cohorts.push({ date: p.meta.date, placed: p.meta.placed, resp: p.resp.length, period: p.meta.period, file: p.meta.file, at: '방금', by: P.who });
        P.data.cohorts.sort((a, b) => a.date < b.date ? -1 : 1);
        next();
      }).withFailureHandler(err => { p.error = '저장 실패: ' + (err && err.message || err); draw(); }).saveSurvey({ meta: p.meta, resp: p.resp });
    };
    next();
  });
  draw();
}
</script></body></html>`;
}

// 브라우저에서 xlsx를 읽는 코드 (외부 라이브러리 없이 압축 해제 → 시트 XML 읽기)
function xlsxReader_() {
  return String.raw`
async function readXlsx(file) {
  const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer);
  let e = buf.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('엑셀(.xlsx) 파일이 아닙니다.');
  const cnt = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const ent = {}, td = new TextDecoder();
  for (let i = 0; i < cnt; i++) {
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    ent[td.decode(buf.subarray(p + 46, p + 46 + nl))] = { m: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
    p += 46 + nl + el + cl;
  }
  const get = async name => {
    const f = ent[name]; if (!f) return null;
    const s = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true), data = buf.subarray(s, s + f.size);
    if (f.m === 0) return td.decode(data);
    const out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    return td.decode(out);
  };
  const X = s => new DOMParser().parseFromString(s, 'application/xml');
  const wb = X(await get('xl/workbook.xml')), rels = X(await get('xl/_rels/workbook.xml.rels'));
  const target = {}; [...rels.getElementsByTagName('Relationship')].forEach(r => { target[r.getAttribute('Id')] = r.getAttribute('Target'); });
  const ssx = await get('xl/sharedStrings.xml');
  const strs = ssx ? [...X(ssx).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  const sheets = {};
  for (const sh of wb.getElementsByTagName('sheet')) {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let t = target[rid] || ''; t = t.startsWith('/') ? t.slice(1) : 'xl/' + t;
    sheets[sh.getAttribute('name')] = t;
  }
  const col = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const readSheet = async name => {
    const doc = X(await get(sheets[name])), rows = [];
    for (const c of doc.getElementsByTagName('c')) {
      const ref = c.getAttribute('r'), r = parseInt(ref.replace(/[A-Z]+/g, ''), 10) - 1, k = col(ref), t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0];
      let val = null;
      if (t === 's') val = v ? strs[+v.textContent] : null;
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
      else if (t === 'str' || t === 'b' || t === 'e') val = v ? v.textContent : null;
      else if (v) { const n = Number(v.textContent); val = isNaN(n) ? v.textContent : n; }
      (rows[r] = rows[r] || [])[k] = val;
    }
    return rows;
  };
  return { names: Object.keys(sheets), readSheet: readSheet };
}

// 간호관리실 양식의 신규간호사 설문 결과 파일 → { meta, resp, avg, perf }
async function parseSurveyFile(file) {
  const book = await readXlsx(file);
  const rawName = book.names.find(n => /rawdata/i.test(n));
  if (!rawName) throw new Error("'설문조사 결과(rawdata …)' 시트를 찾을 수 없습니다.");
  const rows = await book.readSheet(rawName);
  let hi = -1, c1 = -1;
  for (let i = 0; i < Math.min(rows.length, 15) && hi < 0; i++) {
    const s = (rows[i] || []).map(v => v == null ? '' : String(v).trim());
    for (let j = 0; j < s.length - 2; j++) if (s[j] === '1' && s[j + 1] === '2' && s[j + 2] === '3') { hi = i; c1 = j; break; }
  }
  if (hi < 0) throw new Error('문항 번호(1, 2, 3 …) 머리글 행을 찾을 수 없습니다.');
  const num = v => typeof v === 'number' ? v : (v != null && String(v).trim() !== '' && !isNaN(Number(v)) ? Number(v) : null);
  const resp = [];
  for (const r of rows.slice(hi + 1)) {
    if (!r) continue;
    const seq = r[c1 - 1];
    if (typeof seq !== 'number' || !Number.isInteger(seq)) continue;
    const q = Array.from({ length: 25 }, (_, k) => num(r[c1 + k]));
    if (q.slice(0, 24).some((v, i) => i !== 2 && v == null)) continue;
    resp.push({ no: seq, q, q26: String(r[c1 + 25] ?? '').trim(), q27: String(r[c1 + 26] ?? '').trim(), q28: num(r[c1 + 27]) });
  }
  if (!resp.length) throw new Error('응답 행을 찾을 수 없습니다.');
  const meta = { date: '', placed: null, target: null, resp: resp.length, period: '', notes: [], file: file.name };
  const sumName = book.names.find(n => /총평/.test(n));
  if (sumName) {
    const texts = Array.from(await book.readSheet(sumName), r => (r && r[0] != null) ? String(r[0]) : '');
    for (const t of texts) {
      let m = t.match(/발령일자.*?:\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\S*\s*\/\s*(\d+)\s*명/);
      if (m) { meta.date = m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0'); meta.placed = +m[4]; }
      m = t.match(/설문시기\s*:\s*(.+)/); if (m) meta.period = m[1].trim();
      m = t.match(/설문인원.*?:\s*(\d+)\s*명\s*중\s*(\d+)\s*명/); if (m) { meta.target = +m[1]; meta.resp = +m[2]; }
    }
    const st = texts.findIndex((t, i) => i > 5 && t.includes('총평 및 개선'));
    if (st >= 0) meta.notes = texts.slice(st + 1).map(t => t.trim()).filter(t => t && !t.startsWith('#')).slice(0, 4);
  }
  if (!meta.date) {
    const m = String(rows[0] && rows[0][0] || file.name).match(/(\d{4})\D+(\d{1,2})\s*월?\s*발령/);
    if (m) meta.date = m[1] + '-' + String(m[2]).padStart(2, '0') + '-01';
  }
  if (!meta.date) throw new Error('발령일을 찾을 수 없습니다 (총평 시트의 발령일자 줄 확인).');
  const items = [0, 1].concat(Array.from({ length: 21 }, (_, i) => i + 3));
  const avg = resp.reduce((s, x) => s + items.reduce((a, i) => a + x.q[i], 0) / items.length, 0) / resp.length;
  const pv = resp.map(x => x.q[24]).filter(v => v != null);
  return { meta, resp, avg, perf: pv.length ? pv.reduce((a, b) => a + b, 0) / pv.length : 0 };
}
`;
}
