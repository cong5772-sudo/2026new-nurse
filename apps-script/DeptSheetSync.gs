/**
 * [부서별 발령/사직] 탭 자동 갱신
 *
 * [26신규명단]의 발령일자를 보고 회차를 자동으로 인식한 뒤,
 * 부서별·회차별 발령인원/사직인원과 오른쪽 합계(발령인원합·사직인원합·사직율)를 다시 계산해 적는다.
 * - 머리글 글자(예: '발령' / '발령월')에 영향받지 않는다.
 * - 회차가 빈 칸 수보다 많아지면 합계 열 앞에 2열씩 자동으로 추가한다.
 * - 명단에 새 부서가 생기면 부서 목록 끝에 행을 추가한다.
 * - 전년도 사직율 열(P·Q 등)은 건드리지 않는다.
 * - 표 아래의 '구분(연번)' 표 2개(회차별 발령·사직 / 사직 발생시기)도 함께 다시 채운다.
 *
 * DashboardApi.gs와 같은 프로젝트에 넣어 쓴다 (DASH 설정과 ymd_ 함수를 함께 사용).
 */

const DEPT_SYNC = {
  SHEET: '부서별 발령/사직',
  HEAD_ROW: 1,   // '2026-01-01 발령' 같은 회차 머리글 행
  SUB_ROW: 2,    // '발령인원 / 사직인원' 행
  FIRST_ROW: 3,  // 부서 데이터가 시작하는 행
  FIRST_COL: 2,  // 첫 회차 열 (B)
  RUN_HOUR: 18,  // 매일 자동 실행 시각 (오후 5시 사직정보 업데이트 이후)
};

/** 탭을 지금 바로 갱신한다. 편집기에서 실행하거나 매일 자동 실행된다. */
function syncDeptSheet() {
  const ss = SpreadsheetApp.openById(DASH.SHEET_ID);
  const roster = ss.getSheetByName(DASH.ROSTER_SHEET);
  const sh = ss.getSheetByName(DEPT_SYNC.SHEET);
  if (!roster) throw new Error(`'${DASH.ROSTER_SHEET}' 탭을 찾을 수 없습니다.`);
  if (!sh) throw new Error(`'${DEPT_SYNC.SHEET}' 탭을 찾을 수 없습니다.`);

  // 1) 명단 집계: 부서 → 발령일 → [발령인원, 사직인원]
  const rows = roster.getDataRange().getValues();
  const hi = rows.findIndex(r => r.some(v => String(v).trim() === '부서') && r.some(v => String(v).trim() === '발령일자'));
  if (hi < 0) throw new Error(`'${DASH.ROSTER_SHEET}' 탭에서 '부서'·'발령일자' 머리글을 찾을 수 없습니다.`);
  const head = rows[hi].map(v => String(v).trim());
  const cDept = head.indexOf('부서'), cDate = head.indexOf('발령일자'), cRd = head.indexOf('사직일'), cPer = head.indexOf('사직발생기간');
  const count = {};
  const dateSet = {};
  const coh = {}; // 발령일 → { p: 발령, r: 사직, per: { '1개월 이내': n, … } }
  for (let i = hi + 1; i < rows.length; i++) {
    const d = String(rows[i][cDept] || '').trim();
    const st = ymd_(rows[i][cDate]);
    if (!d || !st) continue;
    dateSet[st.s] = true;
    const byDate = count[d] || (count[d] = {});
    const v = byDate[st.s] || (byDate[st.s] = [0, 0]);
    v[0]++;
    const c = coh[st.s] || (coh[st.s] = { p: 0, r: 0, per: {} });
    c.p++;
    const end = cRd >= 0 ? ymd_(rows[i][cRd]) : null;
    if (end) {
      v[1]++;
      c.r++;
      const label = String(cPer >= 0 ? rows[i][cPer] : '').trim() || periodLabel_(monthIndex_(st, end));
      c.per[label] = (c.per[label] || 0) + 1;
    }
  }
  const cohorts = Object.keys(dateSet).sort();
  if (!cohorts.length) throw new Error('명단에 발령일자가 있는 행이 없습니다.');

  // 2) 탭 구조 파악: '부서별 발령인원합' 열 앞까지가 회차 칸
  const sub = sh.getRange(DEPT_SYNC.SUB_ROW, 1, 1, sh.getLastColumn()).getValues()[0].map(v => String(v).replace(/\s+/g, ''));
  let sumCol = sub.indexOf('부서별발령인원합') + 1;
  if (sumCol < 1) throw new Error(`'${DEPT_SYNC.SHEET}' 탭 ${DEPT_SYNC.SUB_ROW}행에서 '부서별 발령인원합' 머리글을 찾을 수 없습니다.`);
  const gapCol = sumCol - 1; // 회차 칸과 합계 사이의 빈 열
  let slots = Math.floor((gapCol - DEPT_SYNC.FIRST_COL) / 2);

  // 회차가 칸보다 많으면 빈 열 앞에 2열씩 추가하고 직전 회차 칸의 서식을 복사
  if (cohorts.length > slots) {
    const add = cohorts.length - slots;
    sh.insertColumnsBefore(gapCol, add * 2);
    const src = sh.getRange(1, gapCol - 2, sh.getMaxRows(), 2);
    for (let k = 0; k < add; k++) {
      const c = gapCol + k * 2;
      src.copyTo(sh.getRange(1, c, sh.getMaxRows(), 2), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      sh.getRange(DEPT_SYNC.HEAD_ROW, c, 1, 2).merge();
    }
    slots += add;
    sumCol += add * 2;
  }

  // 3) 회차 머리글
  const headRow = [], subRow = [];
  for (let i = 0; i < slots; i++) {
    headRow.push(i < cohorts.length ? `${cohorts[i]} 발령` : '(    ) 발령', '');
    subRow.push('발령인원', '사직인원');
  }
  sh.getRange(DEPT_SYNC.HEAD_ROW, DEPT_SYNC.FIRST_COL, 1, slots * 2).setValues([headRow]);
  sh.getRange(DEPT_SYNC.SUB_ROW, DEPT_SYNC.FIRST_COL, 1, slots * 2).setValues([subRow]);
  const title = String(sh.getRange(DEPT_SYNC.HEAD_ROW, sumCol).getValue());
  if (/^\d{4}년\s*부서별/.test(title)) {
    sh.getRange(DEPT_SYNC.HEAD_ROW, sumCol).setValue(title.replace(/^\d{4}/, cohorts[cohorts.length - 1].slice(0, 4)));
  }

  // 4) 부서 행 확인 (명단에만 있는 새 부서는 마지막 부서 다음에 추가)
  const isTotal = s => /^(합계|계|총계|전체|소계)$/.test(s);
  const readNames = () => {
    const last = sh.getLastRow();
    if (last < DEPT_SYNC.FIRST_ROW) return [];
    const all = sh.getRange(DEPT_SYNC.FIRST_ROW, 1, last - DEPT_SYNC.FIRST_ROW + 1, 1).getValues().map(r => String(r[0]).trim());
    const cut = all.indexOf(''); // 첫 빈 행까지만 부서표로 본다 (아래 메모 등은 건드리지 않음)
    return cut >= 0 ? all.slice(0, cut) : all;
  };
  let names = readNames();
  const listed = {};
  names.forEach(n => { if (n) listed[n] = true; });
  const missing = Object.keys(count).filter(d => !listed[d]);
  if (missing.length) {
    let lastDept = -1;
    names.forEach((n, i) => { if (n && !isTotal(n)) lastDept = i; });
    const at = DEPT_SYNC.FIRST_ROW + lastDept; // 이 행 다음에 추가
    sh.insertRowsAfter(at, missing.length);
    sh.getRange(at + 1, 1, missing.length, 1).setValues(missing.map(d => [d]));
    names = readNames();
  }
  let lastNamed = -1;
  names.forEach((n, i) => { if (n) lastNamed = i; });
  if (lastNamed < 0) throw new Error(`'${DEPT_SYNC.SHEET}' 탭 A열에 부서가 없습니다.`);
  names = names.slice(0, lastNamed + 1);

  // 5) 값 계산
  const colTotals = new Array(slots * 2).fill(0);
  let allP = 0, allR = 0;
  const body = [], sums = [];
  names.forEach(n => {
    if (!n || isTotal(n)) { body.push(null); sums.push(null); return; }
    const byDate = count[n] || {};
    const row = [];
    let p = 0, r = 0;
    for (let i = 0; i < slots; i++) {
      if (i < cohorts.length) {
        const v = byDate[cohorts[i]] || [0, 0];
        row.push(v[0], v[1]);
        colTotals[i * 2] += v[0]; colTotals[i * 2 + 1] += v[1];
        p += v[0]; r += v[1];
      } else {
        row.push('', '');
      }
    }
    allP += p; allR += r;
    body.push(row);
    sums.push([p, r, p ? r / p : 0]);
  });
  const totalRow = colTotals.map((v, i) => (Math.floor(i / 2) < cohorts.length ? v : ''));
  const blank = new Array(slots * 2).fill('');
  const bodyOut = names.map((n, i) => (isTotal(n) ? totalRow : body[i] || blank));
  const sumsOut = names.map((n, i) => (isTotal(n) ? [allP, allR, allP ? allR / allP : 0] : sums[i] || ['', '', '']));

  // 6) 기록 (전년도 사직율 열은 손대지 않음)
  sh.getRange(DEPT_SYNC.FIRST_ROW, DEPT_SYNC.FIRST_COL, names.length, slots * 2).setValues(bodyOut);
  sh.getRange(DEPT_SYNC.FIRST_ROW, sumCol, names.length, 3).setValues(sumsOut);
  sh.getRange(DEPT_SYNC.FIRST_ROW, sumCol + 2, names.length, 1).setNumberFormat('0.0%');

  const lower = syncLowerTables_(sh, cohorts, coh);

  if (typeof clearDashboardCache === 'function') clearDashboardCache();
  const msg = `부서별 발령/사직 갱신 완료: 회차 ${cohorts.length}개 (${cohorts.join(', ')}), 부서 ${names.filter(n => n && !isTotal(n)).length}개, 발령 ${allP}명 / 사직 ${allR}명` +
    (missing.length ? ` · 새 부서 추가: ${missing.join(', ')}` : '') + ` · 하단 표 ${lower}개 갱신`;
  Logger.log(msg);
  return msg;
}

/** 매일 자동 실행 예약 (한 번만 실행하면 됨). 다시 실행해도 예약이 중복되지 않는다. */
function installDeptSheetTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncDeptSheet')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncDeptSheet').timeBased().everyDays(1).atHour(DEPT_SYNC.RUN_HOUR).inTimezone(DASH.TZ).create();
  Logger.log(`매일 ${DEPT_SYNC.RUN_HOUR}시대에 [${DEPT_SYNC.SHEET}] 탭을 자동 갱신하도록 예약했습니다.`);
}

/**
 * 부서표 아래의 '구분(연번)' 표들을 다시 채운다.
 * - 3번째 열 머리글이 '발령인원'인 표: 발령일자 / 발령인원 / 사직인원 / 사직율 + '발령인원합' 행
 * - 3번째 열 머리글이 '1개월 이내'인 표: 발령일자 / 기간별 사직인원 / 사직인원 합 + '종합 합계'·'전체 비율' 행
 * 회차 칸(A열이 숫자인 행)보다 회차가 많으면 칸 수만큼만 채운다.
 */
function syncLowerTables_(sh, cohorts, coh) {
  const PER = ['1개월 이내', '2개월 이내', '3개월 이내', '6개월 이내', '12개월 이내', '12개월 이상'];
  const last = sh.getLastRow();
  const colA = sh.getRange(1, 1, last, 1).getDisplayValues().map(r => String(r[0]).replace(/\s+/g, ''));
  const toDate = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const key = (r, c) => String(sh.getRange(r, c).getDisplayValue()).replace(/\s+/g, '');
  let done = 0;
  colA.forEach((a, i) => {
    if (a !== '구분(연번)') return;
    const h = i + 1, s = h + 1;
    let n = 0;
    while (s + n <= last && /^\d+$/.test(colA[s + n - 1])) n++;
    if (!n) return;
    const used = cohorts.slice(0, n);
    const kind = key(h, 3);
    if (kind === '발령인원') {
      const body = [];
      let P = 0, R = 0;
      for (let k = 0; k < n; k++) {
        if (k >= used.length) { body.push(['', '', '', '']); continue; }
        const x = coh[used[k]];
        P += x.p; R += x.r;
        body.push([toDate(used[k]), x.p, x.r, x.p ? x.r / x.p : 0]);
      }
      sh.getRange(s, 2, n, 4).setValues(body);
      sh.getRange(s, 2, n, 1).setNumberFormat('yyyy-mm-dd');
      sh.getRange(s, 5, n, 1).setNumberFormat('0.0%');
      if (key(s + n, 2) === '발령인원합') {
        sh.getRange(s + n, 3, 1, 3).setValues([[P, R, P ? R / P : 0]]);
        sh.getRange(s + n, 5).setNumberFormat('0.0%');
      }
      done++;
    } else if (kind === '1개월이내') {
      const body = [];
      const tot = new Array(PER.length).fill(0);
      for (let k = 0; k < n; k++) {
        if (k >= used.length) { body.push(new Array(PER.length + 2).fill('')); continue; }
        const v = PER.map(p => coh[used[k]].per[p] || 0);
        v.forEach((x, j) => { tot[j] += x; });
        body.push([toDate(used[k])].concat(v, [v.reduce((a2, b2) => a2 + b2, 0)]));
      }
      sh.getRange(s, 2, n, PER.length + 2).setValues(body);
      sh.getRange(s, 2, n, 1).setNumberFormat('yyyy-mm-dd');
      const all = tot.reduce((a2, b2) => a2 + b2, 0);
      for (let r = s + n; r <= Math.min(last, s + n + 3); r++) {
        const lab = key(r, 1);
        if (lab === '종합합계') sh.getRange(r, 3, 1, PER.length + 1).setValues([tot.concat([all])]);
        if (lab === '전체비율') {
          sh.getRange(r, 3, 1, PER.length + 1).setValues([tot.map(x => (all ? x / all : 0)).concat([all ? 1 : 0])]);
          sh.getRange(r, 3, 1, PER.length + 1).setNumberFormat('0.0%');
        }
      }
      done++;
    }
  });
  return done;
}
