(function () {
  const totalByDate = getTotalByDate();
  const resignByDate = RESIGNATION_BY_DATE;
  const rateByDate = totalByDate.map((v, i) => (v === 0 ? 0 : (resignByDate[i] / v) * 100));

  const totalAssigned = totalByDate.reduce((a, b) => a + b, 0);
  const totalResigned = resignByDate.reduce((a, b) => a + b, 0);
  const totalRate = (totalResigned / totalAssigned) * 100;

  const asOfDate = DATES[DATES.length - 1];
  document.getElementById("asOfText").textContent = `기준일 : ${asOfDate} (2026년 1~${DATES.length}차 발령 기준)`;

  document.getElementById("statAssigned").innerHTML = `${totalAssigned.toLocaleString()} <span class="stat-unit">명</span>`;
  document.getElementById("statResigned").innerHTML = `${totalResigned.toLocaleString()} <span class="stat-unit">명</span>`;
  document.getElementById("statResignedSub").textContent = `발령 ${totalAssigned}명 중 사직`;
  document.getElementById("statRate").innerHTML = `${totalRate.toFixed(1)} <span class="stat-unit">%</span>`;
  document.getElementById("statRateSub").textContent = `사직인원 ${totalResigned}명 / 발령인원 ${totalAssigned}명`;

  // 발령일자별 발령/사직/사직율 콤보 차트
  const ctx1 = document.getElementById("dateResignChart").getContext("2d");
  new Chart(ctx1, {
    type: "bar",
    data: {
      labels: DATES,
      datasets: [
        {
          label: "발령인원",
          data: totalByDate,
          backgroundColor: "#0f766e",
          borderRadius: 6,
          yAxisID: "y",
        },
        {
          label: "사직인원",
          data: resignByDate,
          backgroundColor: "#dc2626",
          borderRadius: 6,
          yAxisID: "y",
        },
        {
          label: "사직율(%)",
          data: rateByDate.map((v) => Number(v.toFixed(1))),
          type: "line",
          borderColor: "#f59e0b",
          backgroundColor: "#f59e0b",
          tension: 0.3,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (c) => (c.dataset.label === "사직율(%)" ? `${c.dataset.label}: ${c.parsed.y}%` : `${c.dataset.label}: ${c.parsed.y}명`),
          },
        },
      },
      scales: {
        y: { beginAtZero: true, position: "left", title: { display: true, text: "인원(명)" } },
        y1: {
          beginAtZero: true,
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: "사직율(%)" },
        },
      },
    },
  });

  // 발령일자별 상세 표
  const dateBody = document.querySelector("#dateResignTable tbody");
  DATES.forEach((date, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}차</td>
      <td>${date}</td>
      <td>${totalByDate[i]}명</td>
      <td>${resignByDate[i]}명</td>
      <td>${rateByDate[i].toFixed(1)}%</td>
    `;
    dateBody.appendChild(tr);
  });
  const dateTotalRow = document.createElement("tr");
  dateTotalRow.innerHTML = `
    <td colspan="2" style="text-align:right;font-weight:700;">합계</td>
    <td style="font-weight:700;">${totalAssigned}명</td>
    <td style="font-weight:700;">${totalResigned}명</td>
    <td style="font-weight:700;">${totalRate.toFixed(1)}%</td>
  `;
  dateBody.appendChild(dateTotalRow);

  // 사직발생시기별 분석
  const periodTotals = getResignationPeriodTotals();
  const periodMax = Math.max(...periodTotals);
  const maxIndex = periodTotals.indexOf(periodMax);
  const periodColors = periodTotals.map((_, i) => (i === maxIndex ? "#dc2626" : "#94a3b8"));

  const ctx2 = document.getElementById("periodChart").getContext("2d");
  new Chart(ctx2, {
    type: "bar",
    data: {
      labels: RESIGNATION_PERIOD_LABELS,
      datasets: [
        {
          label: "사직인원",
          data: periodTotals,
          backgroundColor: periodColors,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => {
              const pct = totalResigned === 0 ? 0 : (c.parsed.y / totalResigned) * 100;
              return `${c.parsed.y}명 (${pct.toFixed(1)}%)`;
            },
          },
        },
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "사직인원(명)" } },
      },
    },
  });

  if (totalResigned > 0) {
    const maxPct = (periodMax / totalResigned) * 100;
    document.getElementById("insightBox").style.display = "flex";
    document.getElementById("insightText").innerHTML = `<b>${RESIGNATION_PERIOD_LABELS[maxIndex]}</b> 구간이 ${periodMax}명(${maxPct.toFixed(1)}%)으로 가장 많습니다.`;
  }

  // 발령일자별 사직발생시기 상세 표
  const periodHead = document.getElementById("periodTableHead");
  let headHtml = `<th>발령일자</th>`;
  RESIGNATION_PERIOD_LABELS.forEach((label) => (headHtml += `<th>${label}</th>`));
  headHtml += `<th>사직인원 합</th>`;
  periodHead.innerHTML = headHtml;

  const periodBody = document.querySelector("#periodTable tbody");
  DATES.forEach((date, i) => {
    const row = RESIGNATION_PERIOD_BY_DATE[i];
    const rowTotal = row.reduce((a, b) => a + b, 0);
    const tr = document.createElement("tr");
    let cells = `<td>${date}</td>`;
    row.forEach((v) => (cells += `<td>${v}명</td>`));
    cells += `<td style="font-weight:700;">${rowTotal}명</td>`;
    tr.innerHTML = cells;
    periodBody.appendChild(tr);
  });

  const periodFoot = document.querySelector("#periodTable tfoot");
  const totalRow = document.createElement("tr");
  let totalCells = `<td style="font-weight:700;">합계</td>`;
  periodTotals.forEach((v) => (totalCells += `<td style="font-weight:700;">${v}명</td>`));
  totalCells += `<td style="font-weight:700;">${totalResigned}명</td>`;
  totalRow.innerHTML = totalCells;
  periodFoot.appendChild(totalRow);

  const pctRow = document.createElement("tr");
  let pctCells = `<td>비율</td>`;
  periodTotals.forEach((v) => {
    const pct = totalResigned === 0 ? 0 : (v / totalResigned) * 100;
    pctCells += `<td>${pct.toFixed(1)}%</td>`;
  });
  pctCells += `<td>100.0%</td>`;
  pctRow.innerHTML = pctCells;
  periodFoot.appendChild(pctRow);
})();
