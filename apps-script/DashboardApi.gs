/**
 * 신규간호사 발령 유지관리 시스템 — 집계 데이터 API (Google Apps Script 웹앱)
 *
 * 구글 시트의 연도별 명단 탭([26신규명단], [27신규명단] …)을 모두 읽어 대시보드에 필요한 "집계값"만 JSON으로 내보낸다.
 * 해마다 'NN신규명단' 이름으로 새 탭을 만들면 자동으로 함께 집계된다.
 * 성명·사원번호·출신학교 등 개인 단위 정보는 응답에 포함하지 않는다.
 *
 * 설치: 배포가이드(README.md) 2단계 참고. 새 Apps Script 프로젝트에 이 파일만 넣고
 *       [배포 > 새 배포 > 웹 앱]으로 배포한다 (실행: 나, 액세스: 모든 사용자).
 */

const DASH = {
  // 원본 구글 시트 ID (주소창의 /d/ 와 /edit 사이 문자열)
  SHEET_ID: '1wmsLCPfP7NafHpgl7XwuE87kc42hLq3zFLgUAkKTdPA',
  ROSTER_SHEET: '26신규명단',      // 연도별 탭('NN신규명단')을 못 찾을 때만 쓰는 기본 탭
  PREV_SHEET: '부서별 발령/사직',  // 부서별 전년도 사직율이 있는 탭
  TZ: 'Asia/Seoul',
  CACHE_SECONDS: 300,             // 같은 응답을 5분간 재사용 (속도 향상)
  // 부서 구분과 표시 순서. 여기에 없는 부서는 '기타'로 묶여 마지막에 표시된다.
  GROUPS: [
    ['일반병동', ['12A', '12B', '11B', '10A', '10B', '8A', '8B', '7B', '6A']],
    ['통합병동', ['14A', '14B', '13A', '13B', '11A', '9A', '9B', '7A']],
    ['중환자', ['MICU', 'SICU', 'EICU', 'NICU', 'MFICU']],
    ['수술회복', ['수술실', '회복실']],
    ['응급', ['응급실']],
  ],
  // 내과계·외과계 구분 (여기에 없는 부서는 '미분류')
  TRACKS: {
    '14A': '병동 내과계', '14B': '병동 내과계', '13A': '병동 내과계', '13B': '병동 내과계', '12A': '병동 내과계', '12B': '병동 내과계', '11B': '병동 내과계',
    '11A': '병동 외과계', '10A': '병동 외과계', '10B': '병동 외과계', '9A': '병동 외과계', '9B': '병동 외과계', '8A': '병동 외과계', '8B': '병동 외과계', '7A': '병동 외과계', '7B': '병동 외과계',
    'MICU': '중환자 내과계', 'SICU': '중환자 외과계', 'EICU': '중환자 외과계',
  },
};

function doGet() {
  const cache = CacheService.getScriptCache();
  let json = cache.get('dashboard');
  if (!json) {
    try {
      json = JSON.stringify(buildDashboardData_());
      cache.put('dashboard', json, DASH.CACHE_SECONDS);
    } catch (err) {
      json = JSON.stringify({ error: String(err && err.message || err) });
    }
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/** 시트를 수정한 직후 바로 반영하고 싶을 때 편집기에서 실행 */
function clearDashboardCache() {
  CacheService.getScriptCache().remove('dashboard');
}

/** 배포 전 확인용: 편집기에서 실행하면 집계 결과 요약이 로그에 나온다 */
function testDashboardData() {
  const d = buildDashboardData_();
  let p = 0, r = 0;
  Object.keys(d.dept).forEach(k => { p += d.dept[k][0]; r += d.dept[k][1]; });
  Logger.log('발령 %s명 / 사직 %s명 / 회차 %s / 전년도 비교 부서 %s개',
    p, r, Object.keys(d.dept).map(k => k.split('|')[0]).filter((v, i, a) => a.indexOf(v) === i).join(', '),
    Object.keys(d.prev.dept).length);
}

function buildDashboardData_() {
  const ss = SpreadsheetApp.openById(DASH.SHEET_ID);
  const tabs = rosterSheets_(ss);
  if (!tabs.length) throw new Error("'NN신규명단' 이름의 명단 탭을 찾을 수 없습니다.");
  const groups = DASH.GROUPS.map(g => [g[0], g[1].slice()]);
  const groupOf = {};
  groups.forEach(g => g[1].forEach(d => { groupOf[d] = g[0]; }));
  const extra = [];

  const dept = {}, gender = {}, ai = {}, rank = {}, track = {}, maleDept = {}, res = {};
  let lastUpdate = null;
  const facet = (obj, key, days) => {
    const v = obj[key] || (obj[key] = [0, []]);
    v[0]++;
    if (days != null) v[1].push(days);
  };

  tabs.forEach(tab => {
    const rows = tab.sh.getDataRange().getValues();
    const hi = rows.findIndex(r => r.some(v => String(v).trim() === '부서') && r.some(v => String(v).trim() === '발령일자'));
    if (hi < 0) return; // 머리글이 없는 탭은 건너뜀
    const head = rows[hi].map(v => String(v).trim());
    const col = name => head.indexOf(name);
    const C = {
      dept: col('부서'), date: col('발령일자'), gender: col('성별'), rank: col('석차백분율'),
      ai: col('AI역량검사평가'), rd: col('사직일'), period: col('사직발생기간'), reason: col('사직사유'), upd: col('업데이트일시'),
    };

    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i];
      const d = String(r[C.dept] || '').trim();
      const start = ymd_(r[C.date]);
      if (!d || !start) continue;
      if (!groupOf[d]) { groupOf[d] = '기타'; extra.push(d); }
      const g = groupOf[d];
      const c = start.s;
      const end = C.rd >= 0 ? ymd_(r[C.rd]) : null;
      const days = end ? Math.round((end.t - start.t) / 864e5) : null;

      const dk = c + '|' + d;
      const dv = dept[dk] || (dept[dk] = [0, 0]);
      dv[0]++; if (end) dv[1]++;

      const base = c + '|' + g + '|';
      facet(gender, base + ({ '남자': '남', '남': '남', '여자': '여', '여': '여' }[String(r[C.gender] || '').trim()] || '미기재'), days);
      facet(ai, base + (String(C.ai >= 0 ? r[C.ai] : '').trim() || '미기재'), days);
      facet(rank, base + rankBand_(C.rank >= 0 ? r[C.rank] : ''), days);
      facet(track, base + (DASH.TRACKS[d] || '미분류'), days);
      if ({ '남자': 1, '남': 1 }[String(r[C.gender] || '').trim()]) {
        const mv = maleDept[dk] || (maleDept[dk] = [0, 0]);
        mv[0]++; if (end) mv[1]++;
      }

      if (end) {
        const m = monthIndex_(start, end);
        const per = String(C.period >= 0 ? r[C.period] : '').trim() || periodLabel_(m);
        const why = String(C.reason >= 0 ? r[C.reason] : '').trim() || '미기재';
        const rk = [c, g, per, why, m, days].join('\u0001');
        res[rk] = (res[rk] || 0) + 1;
      }
      if (C.upd >= 0 && r[C.upd]) {
        const u = r[C.upd] instanceof Date ? r[C.upd] : new Date(String(r[C.upd]).replace(' ', 'T'));
        if (!isNaN(u) && (!lastUpdate || u > lastUpdate)) lastUpdate = u;
      }
    }
  });
  if (extra.length) groups.push(['기타', extra]);
  [gender, ai, rank, track].forEach(o => Object.keys(o).forEach(k => o[k][1].sort((a, b) => a - b)));

  const fmt = dt => Utilities.formatDate(dt, DASH.TZ, 'yyyy-MM-dd HH:mm');
  return {
    version: 1,
    sheet: tabs.map(x => x.name).join(', '),
    years: tabs.map(x => x.year),
    generatedAt: fmt(new Date()),
    lastUpdate: lastUpdate ? fmt(lastUpdate) : null,
    groups: groups,
    dept: dept,
    gender: gender,
    ai: ai,
    rank: rank,
    track: track,          // 발령일|부서군|계열 → [발령인원, 사직자별 근속일]
    maleDept: maleDept,    // 발령일|부서 → [남성 발령인원, 남성 사직인원] (누적)
    // [발령일, 부서구분, 사직발생기간, 사직사유, 사직 경과월(1=1개월 이내), 근속일, 인원]
    res: Object.keys(res).map(k => {
      const p = k.split('\u0001');
      return [p[0], p[1], p[2], p[3], Number(p[4]), Number(p[5]), res[k]];
    }),
    prev: readPrevRates_(ss),
    survey: (function () { try { return readSurvey_(ss); } catch (e) { return { error: String(e && e.message || e) }; } })(),
  };
}

/** 'NN신규명단' 이름의 탭을 연도 순으로 찾는다 (예: 26신규명단 → 2026년). 없으면 기본 탭 */
function rosterSheets_(ss) {
  const list = ss.getSheets().map(sh => {
    const m = sh.getName().replace(/\s+/g, '').match(/^(\d{2})신규명단$/);
    return m ? { sh: sh, name: sh.getName(), year: 2000 + Number(m[1]) } : null;
  }).filter(Boolean).sort((a, b) => a.year - b.year);
  if (!list.length) {
    const sh = ss.getSheetByName(DASH.ROSTER_SHEET);
    if (sh) list.push({ sh: sh, name: sh.getName(), year: 0 });
  }
  return list;
}

/** 가장 최근 연도의 명단 탭 (발령자가 한 명 이상 들어 있는 탭) */
function latestRosterSheet_(ss) {
  const tabs = rosterSheets_(ss);
  for (let i = tabs.length - 1; i >= 0; i--) if (tabs[i].sh.getLastRow() > 2) return tabs[i].sh;
  return tabs.length ? tabs[tabs.length - 1].sh : null;
}

/** '부서별 발령/사직' 탭에서 'YYYY년 사직율' 열을 찾아 부서별 전년도 사직율을 읽는다 */
function readPrevRates_(ss) {
  const out = { years: [], dept: {} };
  const sh = ss.getSheetByName(DASH.PREV_SHEET);
  if (!sh) return out;
  const rows = sh.getDataRange().getValues();
  for (let i = 0; i < rows.length; i++) {
    const head = rows[i].map(v => String(v).replace(/\s+/g, ''));
    const di = head.indexOf('부서');
    const yc = [];
    head.forEach((h, j) => { const m = h.match(/^(\d{4})년사직율$/); if (m) yc.push([Number(m[1]), j]); });
    if (di < 0 || !yc.length) continue;
    out.years = yc.map(y => y[0]);
    for (let k = i + 1; k < rows.length; k++) {
      const d = String(rows[k][di] || '').trim();
      if (!d) continue;
      const v = {};
      yc.forEach(([y, j]) => { const x = rate_(rows[k][j]); if (x != null) v[y] = x; });
      if (Object.keys(v).length) out.dept[d] = v;
    }
    break;
  }
  return out;
}

function ymd_(v) {
  let y, m, d;
  if (v instanceof Date && !isNaN(v)) {
    const s = Utilities.formatDate(v, DASH.TZ, 'yyyy-MM-dd').split('-');
    y = +s[0]; m = +s[1]; d = +s[2];
  } else {
    const mt = String(v || '').trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (!mt) return null;
    y = +mt[1]; m = +mt[2]; d = +mt[3];
  }
  return { y: y, m: m, d: d, t: Date.UTC(y, m - 1, d), s: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

/** 사직이 입사 후 몇 번째 달에 일어났는지 (1 = 1개월 이내) */
function monthIndex_(a, b) {
  for (let k = 1; k < 600; k++) {
    if (b.t < Date.UTC(a.y, a.m - 1 + k, a.d)) return k;
  }
  return 600;
}

function periodLabel_(m) {
  return m <= 1 ? '1개월 이내' : m <= 2 ? '2개월 이내' : m <= 3 ? '3개월 이내' : m <= 6 ? '6개월 이내' : m <= 12 ? '12개월 이내' : '12개월 이상';
}

function rankBand_(v) {
  if (v === '' || v == null) return '미기재';
  let x = typeof v === 'number' ? v : parseFloat(String(v).replace('%', ''));
  if (isNaN(x)) return '미기재';
  if (typeof v === 'number' && x <= 1) x *= 100; // 셀 서식이 %인 경우 0.5 = 50%
  return x < 10 ? '0–10%' : x < 20 ? '10–20%' : x < 30 ? '20–30%' : x < 50 ? '30–50%' : '50% 이상';
}

function rate_(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return v > 1 ? v / 100 : v;
  const x = parseFloat(String(v).replace('%', ''));
  return isNaN(x) ? null : x / 100;
}

/* ---------- 교육과정 만족도 (신규간호사 설문) ----------
 * 원자료는 시트의 '교육만족도_응답'·'교육만족도_회차' 탭 (관리자 업로드 화면에서 저장)
 * 대시보드에는 집계값만 보낸다: 문항 평균·5점 비율, 부서군별 평균(응답 3명 이상), 주관식은 주제별 건수만 (원문은 보내지 않음)
 */
const SURVEY = {
  RESP_SHEET: '교육만족도_응답',
  COH_SHEET: '교육만족도_회차',
  MIN_N: 1, // 근무부서별 평균은 응답 인원과 관계없이 공개 (2026-10-11 요청)
  DEPTS: { 1: '일반병동', 2: '간호간병통합병동', 3: '중환자실', 4: '수술실·마취회복실', 5: '응급실', 6: '기타' },
  // 26번 '업무 적응에 도움이 된 교육' 주제 (한 응답에 여러 주제가 나오면 각각 1건)
  HELP: [
    ['전산교육', /전산|인피스|inphis|emr|오더|fee/i],
    ['술기·실습', /술기|실습|실기|set|세트|펌프|pump|infusion|인퓨전|석션|중심정맥|도뇨|모형|물품|배액|플루이드|line|벤트|vent/i],
    ['1:1·대표 프리셉터', /프리셉터|프셉|프리샙터|preceptor/i],
    ['집체·이론교육', /집체|이론|강의|지침서|사전|간담회/i],
    ['교육전담·현장지도', /교육\s*선생님|전담|현장\s*교육|현장지도|독립\s*후|찾아와/i],
    ['독립 전 추가교육', /추가\s*교육|추가교육|8\s*to\s*5/i],
    ['투약·약물', /투약|약물|인슐린|항암|항생제|수혈|주사|약품|케모/i],
    ['업무흐름·환자파악', /흐름|환자\s*파악|노티|notify|입퇴원|보고|근무조|신환/i],
    ['시술·수술 준비', /시술|수술|검사|검체/i],
  ],
  // 27번 '교육과정 전반 의견' 주제
  OPIN: [
    ['교육·프리셉터 기간 확대 요청', /길었으면|늘려|늘렸|늘리|더\s*길|연장|기간.{0,6}(더|조금|부족)|3개월|더 교육|더 자주|더 많이 필요|더 했으면/],
    ['부서·현장 실무교육 확대', /부서|현장|병동\s*내|실무|수술방|수술실|회복실/],
    ['전산교육 요구', /전산|emr|인피스/i],
    ['교육자료 형식 개선', /pdf|출력|강의록/i],
    ['체계적·만족', /체계|만족|좋|유익|알차|도움|뜻깊/],
    ['감사 표현', /감사/],
  ],
};

function readSurvey_(ss) {
  const shR = ss.getSheetByName(SURVEY.RESP_SHEET), shC = ss.getSheetByName(SURVEY.COH_SHEET);
  if (!shR || !shC) return null;
  const meta = {};
  shC.getDataRange().getValues().slice(1).forEach(r => {
    const d = ymd_(r[0]); if (!d) return;
    meta[d.s] = { date: d.s, placed: Number(r[1]) || null, target: Number(r[2]) || null, resp: Number(r[3]) || null, period: String(r[4] || ''),
      notes: [r[5], r[6], r[7], r[8]].map(v => String(v || '').trim()).filter(Boolean) };
  });
  const by = {};
  shR.getDataRange().getValues().slice(1).forEach(r => {
    const d = ymd_(r[0]); if (!d) return;
    const q = r.slice(2, 27).map(v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v));
    if (q.slice(0, 24).filter((v, i) => i !== 2 && v == null).length) return;
    (by[d.s] = by[d.s] || []).push({ q: q, help: String(r[27] || ''), opin: String(r[28] || ''), dept: Number(r[29]) || 0 });
  });
  const ITEMS = [0, 1].concat(Array.from({ length: 21 }, (_, i) => i + 3)); // 1·2번, 4~24번 (3번 자가학습률 제외) = 23문항
  const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  const overall = x => mean(ITEMS.map(i => x.q[i]));
  const r3 = v => v == null ? null : Math.round(v * 1000) / 1000;
  const cohorts = Object.keys(by).sort().map(date => {
    const rs = by[date];
    const q = Array.from({ length: 25 }, (_, i) => r3(mean(rs.map(x => x.q[i]).filter(v => v != null))));
    const top = Array.from({ length: 24 }, (_, i) => i === 2 ? null : r3(rs.filter(x => x.q[i] === 5).length / rs.length));
    const dept = {};
    Object.keys(SURVEY.DEPTS).forEach(k => {
      const g = rs.filter(x => x.dept === Number(k));
      dept[k] = g.length >= SURVEY.MIN_N ? [g.length, r3(mean(g.map(overall))), r3(mean(g.map(x => x.q[24]).filter(v => v != null)))] : [g.length, null, null];
    });
    const count = (rules, field) => {
      const o = {}; rules.forEach(([k]) => { o[k] = 0; });
      rs.forEach(x => rules.forEach(([k, re]) => { if (re.test(x[field])) o[k]++; }));
      return o;
    };
    const blank = rs.filter(x => x.opin.replace(/[\s.\-ㅡ­_]/g, '').length < 2 || /^(없음|없다|없습니다)$/.test(x.opin.trim())).length;
    return Object.assign({ date: date, n: rs.length, q: q, top: top, overall: r3(mean(rs.map(overall))), dept: dept,
      help: count(SURVEY.HELP, 'help'), opin: count(SURVEY.OPIN, 'opin'), opinBlank: blank },
      meta[date] || { date: date, notes: [] }, { n: rs.length });
  });
  return { cohorts: cohorts, depts: SURVEY.DEPTS, minN: SURVEY.MIN_N };
}
