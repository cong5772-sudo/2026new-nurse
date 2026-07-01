// 신규간호사 발령/사직 데이터 (구글 시트 원본 기준, 2026-07-01 업데이트)
// 각 부서 배열의 순서는 DATES 배열의 발령일자 순서와 동일하다.

const DATES = ["2026-01-01", "2026-04-01", "2026-07-01"];

const DEPT_GROUPS = [
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

// 연도별 비교 데이터 (사용자 제공)
const YEARLY_COMPARISON = {
  2026: null, // 현재 연도 누적치는 실데이터로 계산
  2025: 143,
  2024: 167,
};

// 발령일자별 사직인원 (시트2[사직율] 기준)
const RESIGNATION_BY_DATE = [6, 14, 0];

// 사직발생기간 구분 및 발령일자별 사직인원 (시트2[사직율] 기준)
const RESIGNATION_PERIOD_LABELS = [
  "1개월 이내",
  "2개월 이내",
  "3개월 이내",
  "6개월 이내",
  "12개월 이내",
  "12개월 이상",
];

const RESIGNATION_PERIOD_BY_DATE = [
  [0, 1, 5, 0, 0, 0], // 2026-01-01
  [2, 6, 6, 0, 0, 0], // 2026-04-01
  [0, 0, 0, 0, 0, 0], // 2026-07-01
];

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

// 부서별 2026년 발령/사직 인원(누적) 및 2025년·2024년 사직율 비교 (시트 원본 기준)
const DEPT_RESIGNATION = {
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

function getDeptRate2026(deptName) {
  const d = DEPT_RESIGNATION[deptName];
  return d.assigned === 0 ? 0 : (d.resigned / d.assigned) * 100;
}

function getAllDeptNames() {
  return DEPT_GROUPS.flatMap((g) => Object.keys(g.depts));
}
