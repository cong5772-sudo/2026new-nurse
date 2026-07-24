// 신규간호사 명단 시트[26신규명단]을 실시간으로 다시 읽어 대시보드 데이터를 갱신한다.
// 원본 시트는 비공개로 유지하고, Google Apps Script 프록시(웹 앱)가 대시보드에 필요한
// 필드(부서/발령일자/출신학교/석차백분율/등급/사직일/사직기간/사직사유)만 골라서 내려준다.
// 성명·사원번호·성별 등 개인 식별 정보는 프록시에서부터 제외되어 있다.

const LIVE_SYNC_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbxGJi_dSpCRnsQI_UFy02VJ76q64WYiKbYIqHAjaxT8RdErnWGKkDITAxgXvto2ybEq/exec";

let liveSyncJsonpCounter = 0;
let liveSyncInFlight = false;

function liveSyncFetchJsonp(timeoutMs) {
  return new Promise((resolve, reject) => {
    const callbackName = `__liveSyncCallback_${Date.now()}_${liveSyncJsonpCounter++}`;
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

    script = document.createElement("script");
    script.src = `${LIVE_SYNC_ENDPOINT}?callback=${callbackName}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("데이터 서버에 접근할 수 없습니다. 잠시 후 다시 시도해주세요."));
    };
    document.body.appendChild(script);
  });
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
    status.textContent = "최신 데이터를 불러오는 중…";
    status.classList.remove("refresh-status-error");
  }

  try {
    const response = await liveSyncFetchJsonp();
    const records = (response && response.records) || [];
    const valid = records.filter((r) => r && r.dept && r.assignDate);
    if (valid.length === 0) {
      throw new Error("가져온 데이터가 없습니다. Apps Script 배포 상태를 확인해주세요.");
    }

    applyRosterRecords(valid);
    if (typeof window.renderCurrentPage === "function") {
      window.renderCurrentPage();
    }

    if (status) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      status.textContent = `마지막 갱신 ${hh}:${mm} · 총 ${valid.length}건 반영`;
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
