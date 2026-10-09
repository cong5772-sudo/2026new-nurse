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
  DASHBOARD_URL: 'https://cong5772-sudo.github.io/2026new-nurse/#p2',
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
  let data = null, err = '';
  try {
    data = readResigned_();
  } catch (x) {
    err = String(x && x.message || x);
  }
  let who = '';
  try { who = Session.getActiveUser().getEmail(); } catch (x) {}
  const month = (e && e.parameter && e.parameter.m) || '';
  return HtmlService.createHtmlOutput(page_(data, err, month, who))
    .setTitle(ADMIN.TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function readResigned_() {
  const sh = SpreadsheetApp.openById(ADMIN.SHEET_ID).getSheetByName(ADMIN.ROSTER_SHEET);
  if (!sh) throw new Error(`'${ADMIN.ROSTER_SHEET}' 탭을 찾을 수 없습니다.`);
  const rows = sh.getDataRange().getValues();
  const hi = rows.findIndex(r => r.some(v => String(v).trim() === '부서') && r.some(v => String(v).trim() === '발령일자'));
  if (hi < 0) throw new Error('명단 머리글(부서·발령일자)을 찾을 수 없습니다.');
  const head = rows[hi].map(v => String(v).trim());
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
  return { rows: list, generated: Utilities.formatDate(new Date(), ADMIN.TZ, 'yyyy-MM-dd HH:mm'), groups: ADMIN.GROUPS.map(g => g[0]) };
}

function page_(data, err, month, who) {
  const json = JSON.stringify({ data: data, err: err, month: month, who: who, dash: ADMIN.DASHBOARD_URL }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${ADMIN.TITLE}</title>
<style>
@font-face{font-family:"S-Core Dream";font-weight:400;src:url("https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/S-CoreDream-4Regular.woff") format("woff")}
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
</style></head><body>
<header><h1><i>+</i>${ADMIN.TITLE} <span class="tag">관리자 전용 · 외부 공유 금지</span></h1>
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
  const S = { m: months.includes(P.month) ? P.month : 'all', g: 'all', q: '' };
  const ml = m => m.slice(0, 4) + '년 ' + (+m.slice(5)) + '월';
  const sl = s => (+s.slice(5, 7)) + '월 ' + (+s.slice(8)) + '일';
  function draw() {
    const q = S.q.trim().toLowerCase();
    const list = rows.filter(r => (S.m === 'all' || r.end.slice(0, 7) === S.m) && (S.g === 'all' || r.group === S.g) && (!q || (r.name + r.dept + r.reason).toLowerCase().includes(q)));
    const by = {}; list.forEach(r => { (by[r.end.slice(0, 7)] = by[r.end.slice(0, 7)] || []).push(r); });
    const avg = list.length ? Math.round(list.reduce((s, r) => s + r.days, 0) / list.length) : 0;
    const early = list.filter(r => r.days <= 92).length;
    app.innerHTML = '<div class="card filters">'
      + '<div><span class="fl">사직월</span><span class="chips">' + ['all'].concat(months).map(m => '<button class="chip" data-m="' + m + '" aria-pressed="' + (S.m === m) + '">' + (m === 'all' ? '전체' : ml(m)) + '</button>').join('') + '</span></div>'
      + '<div><span class="fl">부서군</span><select id="g"><option value="all">전체</option>' + P.data.groups.map(g => '<option ' + (S.g === g ? 'selected' : '') + '>' + g + '</option>').join('') + '</select></div>'
      + '<div><span class="fl">검색</span><input id="q" placeholder="이름·부서·사유" value="' + esc(S.q) + '"></div></div>'
      + '<div class="card sum"><span>사직자 <b>' + list.length + '</b>명</span><span>입사 3개월 이내 <b>' + early + '</b>명</span><span>평균 근속 <b>' + avg + '</b>일</span><span class="muted">' + (S.m === 'all' ? '전체 기간' : ml(S.m)) + (S.g === 'all' ? '' : ' · ' + S.g) + '</span></div>'
      + '<div class="card tw">' + (list.length ? '<table><thead><tr><th>사직일</th><th class="l">부서</th><th>부서군</th><th class="l">성명</th><th>성별</th><th>발령</th><th>근속</th><th>사직 시기</th><th class="l">사직 사유</th></tr></thead><tbody>'
      + Object.keys(by).sort().reverse().map(m => '<tr class="mh"><td colspan="9">' + ml(m) + ' · ' + by[m].length + '명</td></tr>' + by[m].map(r =>
          '<tr><td>' + sl(r.end) + '</td><td class="l"><b>' + esc(r.dept) + '</b></td><td>' + esc(r.group) + '</td><td class="l"><b>' + esc(r.name) + '</b></td><td>' + esc(r.gender) + '</td><td>' + esc(r.cohort) + ' <span class="muted">(' + sl(r.start) + ')</span></td><td>' + r.days + '일</td><td>' + esc(r.period) + '</td><td class="l">' + esc(r.reason) + '</td></tr>').join('')).join('')
      + '</tbody></table>' : '<div class="empty">조건에 맞는 사직자가 없습니다.</div>') + '</div>';
  }
  app.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { S.m = b.dataset.m; draw(); } });
  app.addEventListener('change', e => { if (e.target.id === 'g') { S.g = e.target.value; draw(); } });
  app.addEventListener('input', e => { if (e.target.id === 'q') { S.q = e.target.value; const p = e.target.selectionStart; draw(); const i = document.getElementById('q'); i.focus(); i.setSelectionRange(p, p); } });
  draw();
}
</script></body></html>`;
}
