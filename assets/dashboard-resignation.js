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
          backgroundColor: BRAND.primary,
          borderRadius: 8,
          yAxisID: "y",
        },
        {
          label: "사직인원",
          data: resignByDate,
          backgroundColor: BRAND.magenta,
          borderRadius: 8,
          yAxisID: "y",
        },
        {
          label: "사직율(%)",
          data: rateByDate.map((v) => Number(v.toFixed(1))),
          type: "line",
          borderColor: BRAND.green,
          backgroundColor: BRAND.green,
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
        legend: { position: "bottom", labels: { color: BRAND.muted } },
        tooltip: {
          callbacks: {
            label: (c) => (c.dataset.label === "사직율(%)" ? `${c.dataset.label}: ${c.parsed.y}%` : `${c.dataset.label}: ${c.parsed.y}명`),
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          position: "left",
          title: { display: true, text: "인원(명)", color: BRAND.muted },
          grid: { color: BRAND.grid },
          ticks: { color: BRAND.muted },
        },
        y1: {
          beginAtZero: true,
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: "사직율(%)", color: BRAND.muted },
          ticks: { color: BRAND.muted },
        },
        x: {
          grid: { color: BRAND.grid },
          ticks: { color: BRAND.muted },
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
  const periodColors = periodTotals.map((_, i) => (i === maxIndex ? BRAND.magenta : "rgba(166, 174, 224, 0.35)"));

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
          borderRadius: 8,
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
        y: {
          beginAtZero: true,
          title: { display: true, text: "사직인원(명)", color: BRAND.muted },
          grid: { color: BRAND.grid },
          ticks: { color: BRAND.muted },
        },
        x: {
          grid: { color: BRAND.grid },
          ticks: { color: BRAND.muted },
        },
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

  // ── 사직사유 분포 ──
  const reasonEntries = Object.entries(RESIGNATION_REASON_COUNTS);
  const reasonColors = [BRAND.primary, "rgba(166, 174, 224, 0.35)", BRAND.green, BRAND.link, BRAND.magenta];
  new Chart(document.getElementById("reasonChart").getContext("2d"), {
    type: "doughnut",
    data: {
      labels: reasonEntries.map(([k]) => k),
      datasets: [
        {
          data: reasonEntries.map(([, v]) => v),
          backgroundColor: reasonColors,
          borderColor: "transparent",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { color: BRAND.muted, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: (c) => {
              const pct = (c.parsed / totalResigned) * 100;
              return `${c.label}: ${c.parsed}명 (${pct.toFixed(1)}%)`;
            },
          },
        },
      },
    },
  });

  // ── 사직자 출신학교 분포 ──
  const schoolEntries = Object.entries(RESIGNATION_SCHOOL_COUNTS);
  new Chart(document.getElementById("schoolChart").getContext("2d"), {
    type: "bar",
    data: {
      labels: schoolEntries.map(([k]) => k),
      datasets: [
        {
          label: "사직인원",
          data: schoolEntries.map(([, v]) => v),
          backgroundColor: BRAND.primary,
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1, color: BRAND.muted }, grid: { color: BRAND.grid } },
        y: { ticks: { color: BRAND.muted }, grid: { color: BRAND.grid } },
      },
    },
  });

  // ── AI역량검사평가 등급별 사직율 ──
  const gradeRates = GRADE_ORDER.map((g) => {
    const s = GRADE_STATS[g];
    return s.assigned === 0 ? 0 : (s.resigned / s.assigned) * 100;
  });
  new Chart(document.getElementById("gradeChart").getContext("2d"), {
    type: "bar",
    data: {
      labels: GRADE_ORDER,
      datasets: [
        {
          label: "사직율",
          data: gradeRates.map((v) => Number(v.toFixed(1))),
          backgroundColor: BRAND.magenta,
          borderRadius: 8,
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
              const g = GRADE_ORDER[c.dataIndex];
              const s = GRADE_STATS[g];
              return `사직율 ${c.parsed.y}% (발령 ${s.assigned}명 중 사직 ${s.resigned}명)`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "사직율(%)", color: BRAND.muted },
          grid: { color: BRAND.grid },
          ticks: { color: BRAND.muted },
        },
        x: { grid: { color: BRAND.grid }, ticks: { color: BRAND.muted } },
      },
    },
  });

  const gradeTableBody = document.querySelector("#gradeTable tbody");
  GRADE_ORDER.forEach((g) => {
    const s = GRADE_STATS[g];
    const rate = s.assigned === 0 ? 0 : (s.resigned / s.assigned) * 100;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${g}</td><td>${s.assigned}명</td><td>${s.resigned}명</td><td>${rate.toFixed(1)}%</td>`;
    gradeTableBody.appendChild(tr);
  });
  const gradeFoot = document.querySelector("#gradeTable tfoot");
  Object.entries(GRADE_GROUP_STATS).forEach(([label, s]) => {
    const rate = s.assigned === 0 ? 0 : (s.resigned / s.assigned) * 100;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td style="font-weight:700;">${label}</td><td style="font-weight:700;">${s.assigned}명</td><td style="font-weight:700;">${s.resigned}명</td><td style="font-weight:700;">${rate.toFixed(1)}%</td>`;
    gradeFoot.appendChild(tr);
  });

  const aAbove = GRADE_GROUP_STATS["A이상 (S~A-)"];
  const bGroup = GRADE_GROUP_STATS["B군 (B+~B-)"];
  const aRate = (aAbove.resigned / aAbove.assigned) * 100;
  const bRate = (bGroup.resigned / bGroup.assigned) * 100;
  document.getElementById("gradeInsightBox").style.display = "flex";
  document.getElementById("gradeInsightText").innerHTML = `<b>B군(B+~B-)</b> 사직율이 ${bRate.toFixed(1)}%로, <b>A등급 이상(S~A-)</b> ${aRate.toFixed(1)}%보다 높습니다.`;

  // ── 석차백분율 구간별 사직율 ──
  const percentileRates = PERCENTILE_BUCKET_LABELS.map((label) => {
    const s = PERCENTILE_BUCKET_STATS[label];
    return s.assigned === 0 ? 0 : (s.resigned / s.assigned) * 100;
  });
  new Chart(document.getElementById("percentileChart").getContext("2d"), {
    type: "bar",
    data: {
      labels: PERCENTILE_BUCKET_LABELS,
      datasets: [
        {
          label: "사직율",
          data: percentileRates.map((v) => Number(v.toFixed(1))),
          backgroundColor: BRAND.primary,
          borderRadius: 8,
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
              const label = PERCENTILE_BUCKET_LABELS[c.dataIndex];
              const s = PERCENTILE_BUCKET_STATS[label];
              return `사직율 ${c.parsed.y}% (발령 ${s.assigned}명 중 사직 ${s.resigned}명)`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "사직율(%)", color: BRAND.muted },
          grid: { color: BRAND.grid },
          ticks: { color: BRAND.muted },
        },
        x: { grid: { color: BRAND.grid }, ticks: { color: BRAND.muted } },
      },
    },
  });

  const percentileTableBody = document.querySelector("#percentileTable tbody");
  PERCENTILE_BUCKET_LABELS.forEach((label) => {
    const s = PERCENTILE_BUCKET_STATS[label];
    const rate = s.assigned === 0 ? 0 : (s.resigned / s.assigned) * 100;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${label}</td><td>${s.assigned}명</td><td>${s.resigned}명</td><td>${rate.toFixed(1)}%</td>`;
    percentileTableBody.appendChild(tr);
  });
})();
