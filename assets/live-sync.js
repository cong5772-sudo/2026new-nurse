// 구글 시트[26신규명단]을 실시간으로 다시 읽어 대시보드 데이터를 갱신한다.
// 구글 시트가 "링크가 있는 모든 사용자 - 뷰어"로 공유되어 있어야 브라우저에서 바로 조회할 수 있다.

const LIVE_SYNC_SHEET_ID = "1wmsLCPfP7NafHpgl7XwuE87kc42hLq3zFLgUAkKTdPA";
const LIVE_SYNC_SHEET_NAME = "26신규명단";

let liveSyncJsonpCounter = 0;
let liveSyncInFlight = false;

function liveSyncFetchGviz(sheetName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const callbackName = `__gvizCallback_${Date.now()}_${liveSyncJsonpCounter++}`;
    let script;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("요청 시간이 초과되었습니다."));
    }, timeoutMs || 15000);

    function cleanup() {
      clearTimeout(timer);
      delete window[callbackName];
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = (response) => {
      cleanup();
      resolve(response);
    };

    const url =
      `https://docs.google.com/spreadsheets/d/${LIVE_SYNC_SHEET_ID}/gviz/tq` +
      `?sheet=${encodeURIComponent(sheetName)}` +
      `&tqx=out:json;responseHandler:${callbackName}`;

    script = document.createElement("script");
    script.src = url;
    script.onerror = () => {
      cleanup();
      reject(new Error("구글 시트에 접근할 수 없습니다. 시트 공유 설정을 확인해주세요."));
    };
    document.body.appendChild(script);
  });
}

function liveSyncCellText(cell) {
  if (!cell || cell.v === null || cell.v === undefined) return "";
  return String(cell.v).trim();
}

function liveSyncCellDate(cell) {
  if (!cell || cell.v === null || cell.v === undefined) return "";
  const raw = cell.v;
  if (typeof raw === "string" && raw.startsWith("Date(")) {
    const parts = raw.slice(5, -1).split(",").map(Number);
    const [y, m, d] = parts;
    if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return "";
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return String(raw).trim();
}

function liveSyncCellPercentile(cell) {
  if (!cell) return null;
  if (cell.f && cell.f.indexOf("%") !== -1) {
    const num = parseFloat(cell.f.replace("%", "").trim());
    return Number.isNaN(num) ? null : num;
  }
  if (typeof cell.v === "number") {
    return cell.v <= 1 ? cell.v * 100 : cell.v;
  }
  if (typeof cell.v === "string" && cell.v.trim()) {
    const num = parseFloat(cell.v.replace("%", "").trim());
    return Number.isNaN(num) ? null : num;
  }
  return null;
}

// 시트 컬럼 순서: 연번,사원번호,성명,성별,부서,발령일자,출신학교,석차백분율,AI역량검사평가,사직일,사직발생기간,사직사유
function liveSyncRowToRecord(row) {
  const c = row.c || [];
  return {
    dept: liveSyncCellText(c[4]),
    assignDate: liveSyncCellDate(c[5]),
    school: liveSyncCellText(c[6]),
    percentile: liveSyncCellPercentile(c[7]),
    grade: liveSyncCellText(c[8]),
    resignDate: liveSyncCellDate(c[9]),
    resignPeriod: liveSyncCellText(c[10]),
    reason: liveSyncCellText(c[11]),
  };
}

async function refreshFromGoogleSheet() {
  if (liveSyncInFlight) return;
  const btn = document.getElementById("refreshDataBtn");
  const status = document.getElementById("refreshStatus");
  const originalLabel = btn ? btn.textContent : "";

  liveSyncInFlight = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "불러오는 중…";
  }
  if (status) {
    status.textContent = "구글 시트에서 최신 데이터를 불러오는 중…";
    status.classList.remove("refresh-status-error");
  }

  try {
    const response = await liveSyncFetchGviz(LIVE_SYNC_SHEET_NAME);
    if (response.status === "error") {
      const detail = (response.errors && response.errors[0] && response.errors[0].detailed_message) || "구글 시트 응답 오류";
      throw new Error(detail);
    }
    const rows = (response.table && response.table.rows) || [];
    const records = rows.map(liveSyncRowToRecord).filter((r) => r.dept && r.assignDate);
    if (records.length === 0) {
      throw new Error("가져온 데이터가 없습니다. 시트 공유 설정 또는 탭 이름(26신규명단)을 확인해주세요.");
    }

    applyRosterRecords(records);
    if (typeof window.renderCurrentPage === "function") {
      window.renderCurrentPage();
    }

    if (status) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      status.textContent = `마지막 갱신 ${hh}:${mm} · 총 ${records.length}건 반영`;
      status.classList.remove("refresh-status-error");
    }
  } catch (err) {
    console.error("실시간 조회 실패:", err);
    if (status) {
      status.textContent = `갱신 실패: ${err.message}`;
      status.classList.add("refresh-status-error");
    } else {
      alert(`실시간 조회 실패: ${err.message}`);
    }
  } finally {
    liveSyncInFlight = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalLabel || "실시간 조회";
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("refreshDataBtn");
  if (btn) {
    btn.addEventListener("click", refreshFromGoogleSheet);
  }
});
