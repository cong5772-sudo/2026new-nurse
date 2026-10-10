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
.vt{display:flex;gap:4px;background:#eef2f8;border-radius:10px;padding:3px}.vt a{padding:6px 14px;border-radius:8px;color:var(--ink2);text-decoration:none;font-weight:600;font-size:13px}.vt a.on{background:#fff;color:var(--accent);box-shadow:0 1px 3px rgba(0,0,0,.08)}
</style></head><body>
<header><h1><i>+</i>${ADMIN.TITLE} <span class="tag">관리자 전용 · 외부 공유 금지</span></h1>${viewTabs_(self, 'resign')}
<div class="hr"><span id="who"></span><span id="gen"></span><button class="btn" onclick="window.print()">인쇄 · PDF</button><a class="btn" id="dash" target="_blank" rel="noopener">대시보드</a></div></header>
<main id="app"></main>
<script>
const P = ${json};
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
document.getElementById('dash').href = P.dash;
document.getElementById('who').textContent = P.who ? '접속 계정: ' + P.who : '';
const app = document.getElementById('app');
if (P.err || !P.data) {
  app.innerHTML = '<div class="card err"><b>명단을 볼 수 없습니다.</b><p>이 페이지는 원본 구글 시트(신규간호사 명단)에 접근 권한이 있는 계정으로만 열 수 있습니다.' + (P.who ? ' 현재 계정: <b>' + esc(P.who) + '</b>' : '') + '</p><p class="muted">' + esc(P.err) + '</p></div>';
} else {
  document.getElementById('gen').textContent = '조회 ' + P.data.generated;
  const rows = P.data.rows;
  const months = [...new Set(rows.map(r => r.end.slice(0, 7)))].sort().reverse();
  const S = { m: months.includes(P.month) ? P.month : 'all', g: 'all', d: 'all', q: '' };
  const GN = P.data.groups.map(g => g[0]);
  const extra = [...new Set(rows.filter(r => r.group === '기타').map(r => r.dept))].sort();
  if (extra.length) { GN.push('기타'); P.data.groups.push(['기타', extra]); }
  const deptsOf = g => g === 'all' ? P.data.groups.reduce((a, x) => a.concat(x[1]), []) : (P.data.groups.find(x => x[0] === g) || ['', []])[1];
  const ml = m => m.slice(0, 4) + '년 ' + (+m.slice(5)) + '월';
  const sl = s => (+s.slice(5, 7)) + '월 ' + (+s.slice(8)) + '일';
  function draw() {
    const q = S.q.trim().toLowerCase();
    const list = rows.filter(r => (S.m === 'all' || r.end.slice(0, 7) === S.m) && (S.g === 'all' || r.group === S.g) && (S.d === 'all' || r.dept === S.d) && (!q || (r.name + r.dept + r.reason).toLowerCase().includes(q)));
    // 세부부서 목록 옆 인원: 사직월·부서군·검색 조건을 적용한 부서별 사직자 수
    const baseCnt = {}; rows.filter(r => (S.m === 'all' || r.end.slice(0, 7) === S.m) && (!q || (r.name + r.dept + r.reason).toLowerCase().includes(q))).forEach(r => { baseCnt[r.dept] = (baseCnt[r.dept] || 0) + 1; });
    const by = {}; list.forEach(r => { (by[r.end.slice(0, 7)] = by[r.end.slice(0, 7)] || []).push(r); });
    const avg = list.length ? Math.round(list.reduce((s, r) => s + r.days, 0) / list.length) : 0;
    const early = list.filter(r => r.days <= 92).length;
    app.innerHTML = '<div class="card filters">'
      + '<div><span class="fl">사직월</span><span class="chips">' + ['all'].concat(months).map(m => '<button class="chip" data-m="' + m + '" aria-pressed="' + (S.m === m) + '">' + (m === 'all' ? '전체' : ml(m)) + '</button>').join('') + '</span></div>'
      + '<div><span class="fl">부서군</span><span class="chips">' + ['all'].concat(GN).map(g => '<button class="chip" data-g="' + g + '" aria-pressed="' + (S.g === g) + '">' + (g === 'all' ? '전체' : g) + '</button>').join('') + '</span></div>'
      + '<div><span class="fl">세부부서</span><select id="d"><option value="all">전체' + (S.g === 'all' ? '' : ' (' + S.g + ')') + '</option>' + deptsOf(S.g).map(d => { const n = baseCnt[d] || 0; return '<option value="' + esc(d) + '"' + (S.d === d ? ' selected' : '') + '>' + esc(d) + ' (' + n + '명)</option>'; }).join('') + '</select></div>'
      + '<div><span class="fl">검색</span><input id="q" placeholder="이름·부서·사유" value="' + esc(S.q) + '"></div></div>'
      + '<div class="card sum"><span>사직자 <b>' + list.length + '</b>명</span><span>입사 3개월 이내 <b>' + early + '</b>명</span><span>평균 근속 <b>' + avg + '</b>일</span><span class="muted">' + (S.m === 'all' ? '전체 기간' : ml(S.m)) + (S.g === 'all' ? '' : ' · ' + S.g) + (S.d === 'all' ? '' : ' · ' + esc(S.d)) + '</span></div>'
      + '<div class="card tw">' + (list.length ? '<table><thead><tr><th>사직일</th><th class="l">부서</th><th>부서군</th><th class="l">성명</th><th>성별</th><th>발령</th><th>근속</th><th>사직 시기</th><th class="l">사직 사유</th></tr></thead><tbody>'
      + Object.keys(by).sort().reverse().map(m => '<tr class="mh"><td colspan="9">' + ml(m) + ' · ' + by[m].length + '명</td></tr>' + by[m].map(r =>
          '<tr><td>' + sl(r.end) + '</td><td class="l"><b>' + esc(r.dept) + '</b></td><td>' + esc(r.group) + '</td><td class="l"><b>' + esc(r.name) + '</b></td><td>' + esc(r.gender) + '</td><td>' + esc(r.cohort) + ' <span class="muted">(' + sl(r.start) + ')</span></td><td>' + r.days + '일</td><td>' + esc(r.period) + '</td><td class="l">' + esc(r.reason) + '</td></tr>').join('')).join('')
      + '</tbody></table>' : '<div class="empty">조건에 맞는 사직자가 없습니다.</div>') + '</div>';
  }
  app.addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (b) { S.m = b.dataset.m; draw(); return; }
    const g = e.target.closest('[data-g]'); if (g) { S.g = g.dataset.g; if (S.d !== 'all' && !deptsOf(S.g).includes(S.d)) S.d = 'all'; draw(); }
  });
  app.addEventListener('change', e => { if (e.target.id === 'd') { S.d = e.target.value; draw(); } });
  app.addEventListener('input', e => { if (e.target.id === 'q') { S.q = e.target.value; const p = e.target.selectionStart; draw(); const i = document.getElementById('q'); i.focus(); i.setSelectionRange(p, p); } });
  draw();
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
.vt{display:flex;gap:4px;background:#eef2f8;border-radius:10px;padding:3px}.vt a{padding:6px 14px;border-radius:8px;color:var(--ink2);text-decoration:none;font-weight:600;font-size:13px}.vt a.on{background:#fff;color:var(--accent);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.st{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap}.st.on{background:#e7f6ec;color:#15803d}.st.off{background:#fdecec;color:var(--crit)}
tr.off td{color:var(--muted)}tr.off td b{color:var(--ink2)}
</style></head><body>
<header><h1><i>+</i>${ADMIN.PLACED_TITLE} <span class="tag">관리자 전용 · 외부 공유 금지</span></h1>${viewTabs_(self, 'placed')}
<div class="hr"><span id="who"></span><span id="gen"></span><button class="btn" onclick="window.print()">인쇄 · PDF</button><a class="btn" id="dash" target="_blank" rel="noopener">대시보드</a></div></header>
<main id="app"></main>
<script>
const P = ${json};
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
document.getElementById('dash').href = P.dash;
document.getElementById('who').textContent = P.who ? '접속 계정: ' + P.who : '';
const app = document.getElementById('app');
if (P.err || !P.data) {
  app.innerHTML = '<div class="card err"><b>명단을 볼 수 없습니다.</b><p>이 페이지는 원본 구글 시트(신규간호사 명단)에 접근 권한이 있는 계정으로만 열 수 있습니다.' + (P.who ? ' 현재 계정: <b>' + esc(P.who) + '</b>' : '') + '</p><p class="muted">' + esc(P.err) + '</p></div>';
} else {
  document.getElementById('gen').textContent = '조회 ' + P.data.generated;
  const rows = P.data.rows, cols = P.data.cols, coh = P.data.cohorts;
  const GN = P.data.groups.map(g => g[0]);
  const extra = [...new Set(rows.filter(r => r.group === '기타').map(r => r.dept))].sort();
  if (extra.length) { GN.push('기타'); P.data.groups.push(['기타', extra]); }
  const deptsOf = g => g === 'all' ? P.data.groups.reduce((a, x) => a.concat(x[1]), []) : (P.data.groups.find(x => x[0] === g) || ['', []])[1];
  const S = { c: 'all', g: 'all', d: 'all', s: 'all', q: '' };
  const md = s => (+s.slice(5, 7)) + '월 ' + (+s.slice(8)) + '일';
  const cl = c => (coh.indexOf(c) + 1) + '차 (' + c.slice(0, 4) + '.' + c.slice(5, 7) + '.' + c.slice(8) + ')';
  const chips = (key, vals, label) => '<span class="chips">' + ['all'].concat(vals).map(v => '<button class="chip" data-' + key + '="' + esc(v) + '" aria-pressed="' + (S[key] === v) + '">' + (v === 'all' ? '전체' : label(v)) + '</button>').join('') + '</span>';
  function draw() {
    const q = S.q.trim().toLowerCase();
    const hit = r => !q || (r.name + r.dept + r.x.join(' ')).toLowerCase().includes(q);
    const base = rows.filter(r => (S.c === 'all' || r.start === S.c) && (S.g === 'all' || r.group === S.g) && (S.d === 'all' || r.dept === S.d) && hit(r));
    const list = base.filter(r => S.s === 'all' || (S.s === 'on' ? !r.end : !!r.end));
    const cnt = {}; rows.filter(r => (S.c === 'all' || r.start === S.c) && hit(r)).forEach(r => { cnt[r.dept] = (cnt[r.dept] || 0) + 1; });
    const out = base.filter(r => r.end).length;
    const by = {}; list.forEach(r => { (by[r.start] = by[r.start] || []).push(r); });
    app.innerHTML = '<div class="card filters">'
      + '<div><span class="fl">발령 회차</span>' + chips('c', coh.slice().reverse(), cl) + '</div>'
      + '<div><span class="fl">부서군</span>' + chips('g', GN, v => v) + '</div>'
      + '<div><span class="fl">세부부서</span><select id="d"><option value="all">전체' + (S.g === 'all' ? '' : ' (' + S.g + ')') + '</option>' + deptsOf(S.g).map(d => '<option value="' + esc(d) + '"' + (S.d === d ? ' selected' : '') + '>' + esc(d) + ' (' + (cnt[d] || 0) + '명)</option>').join('') + '</select></div>'
      + '<div><span class="fl">상태</span>' + chips('s', ['on', 'off'], v => v === 'on' ? '재직' : '사직') + '</div>'
      + '<div><span class="fl">검색</span><input id="q" placeholder="이름·부서·학교 등" value="' + esc(S.q) + '"></div></div>'
      + '<div class="card sum"><span>발령 <b>' + base.length + '</b>명</span><span>재직 <b>' + (base.length - out) + '</b>명</span><span>사직 <b>' + out + '</b>명</span><span>사직율 <b>' + (base.length ? (out / base.length * 100).toFixed(1) : '0.0') + '</b>%</span><span class="muted">' + (S.c === 'all' ? '전체 회차' : cl(S.c)) + (S.g === 'all' ? '' : ' · ' + S.g) + (S.d === 'all' ? '' : ' · ' + esc(S.d)) + (S.s === 'all' ? '' : ' · ' + (S.s === 'on' ? '재직자' : '사직자')) + '</span></div>'
      + '<div class="card tw">' + (list.length ? '<table><thead><tr><th>회차</th><th>발령일</th><th class="l">부서</th><th>부서군</th><th class="l">성명</th><th>성별</th>' + cols.map(k => '<th>' + esc(k) + '</th>').join('') + '<th>상태</th><th>근속</th><th class="l">사직 사유</th></tr></thead><tbody>'
      + Object.keys(by).sort().reverse().map(s => '<tr class="mh"><td colspan="' + (9 + cols.length) + '">' + cl(s) + ' · ' + by[s].length + '명</td></tr>' + by[s].map(r =>
          '<tr' + (r.end ? ' class="off"' : '') + '><td>' + esc(r.cohort) + '</td><td>' + md(r.start) + '</td><td class="l"><b>' + esc(r.dept) + '</b></td><td>' + esc(r.group) + '</td><td class="l"><b>' + esc(r.name) + '</b></td><td>' + esc(r.gender) + '</td>'
          + r.x.map(v => '<td>' + esc(v) + '</td>').join('')
          + '<td>' + (r.end ? '<span class="st off">사직 ' + md(r.end) + '</span>' : '<span class="st on">재직</span>') + '</td><td>' + r.days + '일</td><td class="l">' + esc(r.reason) + '</td></tr>').join('')).join('')
      + '</tbody></table>' : '<div class="empty">조건에 맞는 발령자가 없습니다.</div>') + '</div>';
  }
  app.addEventListener('click', e => {
    const b = e.target.closest('[data-c],[data-g],[data-s]'); if (!b) return;
    if (b.dataset.c) S.c = b.dataset.c;
    if (b.dataset.s) S.s = b.dataset.s;
    if (b.dataset.g) { S.g = b.dataset.g; if (S.d !== 'all' && !deptsOf(S.g).includes(S.d)) S.d = 'all'; }
    draw();
  });
  app.addEventListener('change', e => { if (e.target.id === 'd') { S.d = e.target.value; draw(); } });
  app.addEventListener('input', e => { if (e.target.id === 'q') { S.q = e.target.value; const p = e.target.selectionStart; draw(); const i = document.getElementById('q'); i.focus(); i.setSelectionRange(p, p); } });
  draw();
}
</script></body></html>`;
}
