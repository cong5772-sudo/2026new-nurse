// 신규간호사 발령/사직 데이터 (구글 시트 원본 기준, 2026-07-01 스냅샷)
// 아래 값들은 페이지가 처음 열릴 때 보여줄 기본값이며, "실시간 조회" 버튼을 누르면
// live-sync.js 가 구글 시트[26신규명단]을 다시 읽어 이 값들을 갱신한다.

// 부서 조직 구성 (그룹 ↔ 부서 매핑) — 조직 구조이므로 실시간 조회로 바뀌지 않는다.
const DEPT_GROUP_DEFS = [
  { name: "일반병동", deptNames: ["12A", "12B", "11B", "10A", "10B", "8A", "8B", "7B"] },
  { name: "통합병동", deptNames: ["14A", "14B", "13A", "13B", "11A", "9A", "9B", "7A"] },
  { name: "중환자", deptNames: ["MICU", "SICU", "EICU", "NICU", "MFICU"] },
  { name: "수술회복", deptNames: ["수술실", "회복실"] },
  { name: "응급", deptNames: ["응급실"] },
];

// 부서별 2025년·2024년 사직율 비교 (과거 연도 수치는 원본 로스터에 없어 별도 보관, 사용자 제공값)
const HISTORICAL_DEPT_RATES = {
  "14A": { rate2025: 0.0, rate2024: 25.0 },
  "14B": { rate2025: 0.0, rate2024: 0.0 },
  "13A": { rate2025: 0.0, rate2024: 0.0 },
  "13B": { rate2025: 0.0, rate2024: 0.0 },
  "12A": { rate2025: 25.0, rate2024: 50.0 },
  "12B": { rate2025: 33.3, rate2024: 33.3 },
  "11A": { rate2025: 50.0, rate2024: 0.0 },
  "11B": { rate2025: 14.3, rate2024: 42.9 },
  "10A": { rate2025: 60.0, rate2024: 16.7 },
  "10B": { rate2025: 14.3, rate2024: 16.7 },
  "9A": { rate2025: 71.4, rate2024: 0.0 },
  "9B": { rate2025: 83.3, rate2024: 0.0 },
  "8A": { rate2025: 25.0, rate2024: 16.7 },
  "8B": { rate2025: 20.0, rate2024: 0.0 },
  "7A": { rate2025: 20.0, rate2024: 33.3 },
  "7B": { rate2025: 0.0, rate2024: 0.0 },
  MFICU: { rate2025: 0.0, rate2024: 0.0 },
  NICU: { rate2025: 0.0, rate2024: 21.7 },
  EICU: { rate2025: 0.0, rate2024: 0.0 },
  MICU: { rate2025: 0.0, rate2024: 0.0 },
  SICU: { rate2025: 17.6, rate2024: 25.0 },
  수술실: { rate2025: 22.2, rate2024: 43.8 },
  회복실: { rate2025: 0.0, rate2024: 0.0 },
  응급실: { rate2025: 0.0, rate2024: 0.0 },
};

// 연도별 발령 인원 비교 데이터 (2025/2024는 원본 로스터에 없는 과거 연도라 사용자 제공값 사용)
const YEARLY_COMPARISON = {
  2026: null, // 현재 연도 누적치는 실데이터로 계산
  2025: 143,
  2024: 167,
};

const GRADE_ORDER = ["S", "A+", "A", "A-", "B+", "B", "B-"];
const RESIGNATION_PERIOD_LABELS = [
  "1개월 이내",
  "2개월 이내",
  "3개월 이내",
  "6개월 이내",
  "12개월 이내",
  "12개월 이상",
];

// ── 아래는 로스터로부터 계산되는 값들 (실시간 조회 시 재계산되어 교체됨) ──
let DATES = ["2026-01-01", "2026-04-01", "2026-07-01"];

let DEPT_GROUPS = [
  {
    name: "일반병동",
    depts: {
      "12A": [0, 2, 2],
      "12B": [3, 2, 2],
      "11B": [3, 2, 2],
      "10A": [0, 3, 2],
      "10B": [3, 2, 2],
      "8A": [3, 2, 2],
      "8B": [0, 3, 2],
      "7B": [3, 2, 2],
    },
  },
  {
    name: "통합병동",
    depts: {
      "14A": [3, 2, 3],
      "14B": [3, 2, 2],
      "13A": [0, 3, 2],
      "13B": [2, 2, 2],
      "11A": [3, 2, 0],
      "9A": [2, 2, 2],
      "9B": [3, 2, 2],
      "7A": [3, 2, 2],
    },
  },
  {
    name: "중환자",
    depts: {
      MICU: [0, 3, 3],
      SICU: [0, 3, 3],
      EICU: [0, 3, 2],
      NICU: [0, 3, 8],
      MFICU: [2, 0, 3],
    },
  },
  {
    name: "수술회복",
    depts: {
      수술실: [0, 8, 0],
      회복실: [0, 5, 0],
    },
  },
  {
    name: "응급",
    depts: {
      응급실: [0, 2, 3],
    },
  },
];

let RESIGNATION_BY_DATE = [6, 14, 0];

let RESIGNATION_PERIOD_BY_DATE = [
  [0, 1, 5, 0, 0, 0], // 2026-01-01
  [2, 6, 6, 0, 0, 0], // 2026-04-01
  [0, 0, 0, 0, 0, 0], // 2026-07-01
];

let RESIGNATION_REASON_COUNTS = {
  "기타": 7,
  "(미기재)": 10,
  "학업": 1,
  "건강,기타": 1,
  "이직": 1,
};

let RESIGNATION_SCHOOL_COUNTS = {
  "인제대학교": 3,
  "대동대학교": 2,
  "동서대학교": 2,
  "동의대학교": 2,
  "춘해보건대학교": 2,
  "동의과학대학교": 2,
  "기타(1건씩 7개교)": 7,
};

let GRADE_STATS = {
  "S": { assigned: 10, resigned: 1 },
  "A+": { assigned: 27, resigned: 2 },
  "A": { assigned: 46, resigned: 5 },
  "A-": { assigned: 28, resigned: 5 },
  "B+": { assigned: 16, resigned: 2 },
  "B": { assigned: 7, resigned: 2 },
  "B-": { assigned: 3, resigned: 1 },
};

let GRADE_GROUP_STATS = {
  "A이상 (S~A-)": { assigned: 111, resigned: 13 },
  "B군 (B+~B-)": { assigned: 26, resigned: 5 },
};

let PERCENTILE_BUCKET_LABELS = ["0-10%", "10-20%", "20-30%", "30-40%", "40-50%", "50-60%", "60-70%", "70-80%", "80-90%"];
let PERCENTILE_BUCKET_STATS = {
  "0-10%": { assigned: 38, resigned: 6 },
  "10-20%": { assigned: 30, resigned: 5 },
  "20-30%": { assigned: 27, resigned: 3 },
  "30-40%": { assigned: 23, resigned: 1 },
  "40-50%": { assigned: 10, resigned: 0 },
  "50-60%": { assigned: 4, resigned: 0 },
  "60-70%": { assigned: 2, resigned: 2 },
  "70-80%": { assigned: 2, resigned: 1 },
  "80-90%": { assigned: 1, resigned: 0 },
};

let DEPT_RESIGNATION = {
  "14A": { assigned: 8, resigned: 1, rate2025: 0.0, rate2024: 25.0 },
  "14B": { assigned: 7, resigned: 2, rate2025: 0.0, rate2024: 0.0 },
  "13A": { assigned: 5, resigned: 0, rate2025: 0.0, rate2024: 0.0 },
  "13B": { assigned: 6, resigned: 0, rate2025: 0.0, rate2024: 0.0 },
  "12A": { assigned: 4, resigned: 2, rate2025: 25.0, rate2024: 50.0 },
  "12B": { assigned: 7, resigned: 1, rate2025: 33.3, rate2024: 33.3 },
  "11A": { assigned: 5, resigned: 0, rate2025: 50.0, rate2024: 0.0 },
  "11B": { assigned: 7, resigned: 2, rate2025: 14.3, rate2024: 42.9 },
  "10A": { assigned: 5, resigned: 0, rate2025: 60.0, rate2024: 16.7 },
  "10B": { assigned: 7, resigned: 3, rate2025: 14.3, rate2024: 16.7 },
  "9A": { assigned: 6, resigned: 2, rate2025: 71.4, rate2024: 0.0 },
  "9B": { assigned: 7, resigned: 0, rate2025: 83.3, rate2024: 0.0 },
  "8A": { assigned: 7, resigned: 1, rate2025: 25.0, rate2024: 16.7 },
  "8B": { assigned: 5, resigned: 1, rate2025: 20.0, rate2024: 0.0 },
  "7A": { assigned: 7, resigned: 0, rate2025: 20.0, rate2024: 33.3 },
  "7B": { assigned: 7, resigned: 1, rate2025: 0.0, rate2024: 0.0 },
  MFICU: { assigned: 5, resigned: 0, rate2025: 0.0, rate2024: 0.0 },
  NICU: { assigned: 11, resigned: 0, rate2025: 0.0, rate2024: 21.7 },
  EICU: { assigned: 5, resigned: 0, rate2025: 0.0, rate2024: 0.0 },
  MICU: { assigned: 6, resigned: 0, rate2025: 0.0, rate2024: 0.0 },
  SICU: { assigned: 6, resigned: 0, rate2025: 17.6, rate2024: 25.0 },
  수술실: { assigned: 8, resigned: 1, rate2025: 22.2, rate2024: 43.8 },
  회복실: { assigned: 5, resigned: 2, rate2025: 0.0, rate2024: 0.0 },
  응급실: { assigned: 5, resigned: 1, rate2025: 0.0, rate2024: 0.0 },
};

function sumArrays(arrays) {
  const len = arrays[0].length;
  const result = new Array(len).fill(0);
  arrays.forEach((arr) => {
    arr.forEach((v, i) => {
      result[i] += v;
    });
  });
  return result;
}

function toCumulative(arr) {
  const out = [];
  let running = 0;
  arr.forEach((v) => {
    running += v;
    out.push(running);
  });
  return out;
}

function getTotalByDate() {
  const allDeptArrays = DEPT_GROUPS.flatMap((g) => Object.values(g.depts));
  return sumArrays(allDeptArrays);
}

function getYearTotal() {
  return getTotalByDate().reduce((a, b) => a + b, 0);
}

function getResignationPeriodTotals() {
  return sumArrays(RESIGNATION_PERIOD_BY_DATE);
}

function getDeptRate2026(deptName) {
  const d = DEPT_RESIGNATION[deptName];
  return d.assigned === 0 ? 0 : (d.resigned / d.assigned) * 100;
}

function getAllDeptNames() {
  return DEPT_GROUPS.flatMap((g) => Object.keys(g.depts));
}

/**
 * 시트[26신규명단] 원본 행(레코드) 목록으로부터 대시보드에 필요한 모든 집계값을 다시 계산해
 * 위의 전역 변수들을 갱신한다. live-sync.js 가 구글 시트를 읽어온 뒤 호출한다.
 * @param {Array<{dept:string, assignDate:string, resignDate:string, resignPeriod:string, reason:string, school:string, grade:string, percentile:number|null}>} records
 */
function applyRosterRecords(records) {
  DATES = [...new Set(records.map((r) => r.assignDate))].sort();

  DEPT_GROUPS = DEPT_GROUP_DEFS.map((group) => {
    const depts = {};
    group.deptNames.forEach((deptName) => {
      depts[deptName] = DATES.map(
        (date) => records.filter((r) => r.dept === deptName && r.assignDate === date).length
      );
    });
    return { name: group.name, depts };
  });

  RESIGNATION_BY_DATE = DATES.map(
    (date) => records.filter((r) => r.assignDate === date && r.resignDate).length
  );

  RESIGNATION_PERIOD_BY_DATE = DATES.map((date) =>
    RESIGNATION_PERIOD_LABELS.map(
      (label) => records.filter((r) => r.assignDate === date && r.resignPeriod === label).length
    )
  );

  const resignedRecords = records.filter((r) => r.resignDate);

  const reasonCounts = {};
  resignedRecords.forEach((r) => {
    const key = r.reason && r.reason.trim() ? r.reason.trim() : "(미기재)";
    reasonCounts[key] = (reasonCounts[key] || 0) + 1;
  });
  RESIGNATION_REASON_COUNTS = reasonCounts;

  const schoolCounts = {};
  resignedRecords.forEach((r) => {
    if (!r.school) return;
    schoolCounts[r.school] = (schoolCounts[r.school] || 0) + 1;
  });
  const schoolEntries = Object.entries(schoolCounts).sort((a, b) => b[1] - a[1]);
  const majorSchools = schoolEntries.filter(([, count]) => count >= 2);
  const minorSchools = schoolEntries.filter(([, count]) => count === 1);
  const newSchoolCounts = {};
  majorSchools.forEach(([name, count]) => (newSchoolCounts[name] = count));
  if (minorSchools.length > 0) {
    newSchoolCounts[`기타(1건씩 ${minorSchools.length}개교)`] = minorSchools.length;
  }
  RESIGNATION_SCHOOL_COUNTS = newSchoolCounts;

  const gradeStats = {};
  GRADE_ORDER.forEach((g) => (gradeStats[g] = { assigned: 0, resigned: 0 }));
  records.forEach((r) => {
    if (!gradeStats[r.grade]) return;
    gradeStats[r.grade].assigned += 1;
    if (r.resignDate) gradeStats[r.grade].resigned += 1;
  });
  GRADE_STATS = gradeStats;

  const highGrades = ["S", "A+", "A", "A-"];
  const lowGrades = ["B+", "B", "B-"];
  const sumGroup = (grades) =>
    grades.reduce(
      (acc, g) => ({
        assigned: acc.assigned + gradeStats[g].assigned,
        resigned: acc.resigned + gradeStats[g].resigned,
      }),
      { assigned: 0, resigned: 0 }
    );
  GRADE_GROUP_STATS = {
    "A이상 (S~A-)": sumGroup(highGrades),
    "B군 (B+~B-)": sumGroup(lowGrades),
  };

  const withPercentile = records.filter((r) => typeof r.percentile === "number" && !Number.isNaN(r.percentile));
  const maxBucket = withPercentile.length
    ? Math.floor(Math.max(...withPercentile.map((r) => r.percentile)) / 10) * 10
    : 0;
  const bucketLabels = [];
  for (let lo = 0; lo <= maxBucket; lo += 10) {
    bucketLabels.push(`${lo}-${lo + 10}%`);
  }
  const bucketStats = {};
  bucketLabels.forEach((label) => (bucketStats[label] = { assigned: 0, resigned: 0 }));
  withPercentile.forEach((r) => {
    const lo = Math.min(Math.floor(r.percentile / 10) * 10, maxBucket);
    const label = `${lo}-${lo + 10}%`;
    bucketStats[label].assigned += 1;
    if (r.resignDate) bucketStats[label].resigned += 1;
  });
  PERCENTILE_BUCKET_LABELS = bucketLabels;
  PERCENTILE_BUCKET_STATS = bucketStats;

  const deptResignation = {};
  getAllDeptNames().forEach((deptName) => {
    const deptRecords = records.filter((r) => r.dept === deptName);
    const hist = HISTORICAL_DEPT_RATES[deptName] || { rate2025: 0, rate2024: 0 };
    deptResignation[deptName] = {
      assigned: deptRecords.length,
      resigned: deptRecords.filter((r) => r.resignDate).length,
      rate2025: hist.rate2025,
      rate2024: hist.rate2024,
    };
  });
  DEPT_RESIGNATION = deptResignation;
}
