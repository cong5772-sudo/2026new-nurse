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
