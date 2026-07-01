(function () {
  const totalByDate = getTotalByDate();
  const cumulative = toCumulative(totalByDate);
  const yearTotal = getYearTotal();
  const roundCount = DATES.length;
  const asOfDate = DATES[DATES.length - 1];

  document.getElementById("asOfText").textContent = `기준일 : ${asOfDate} (2026년 ${roundCount}차 발령 기준)`;
  document.getElementById("heroTotal").textContent = yearTotal.toLocaleString();
  document.getElementById("heroRound").textContent = `발령 ${roundCount}회차 진행`;

  // 회차 배지
  const roundBadgesEl = document.getElementById("roundBadges");
  DATES.forEach((date, i) => {
    const badge = document.createElement("div");
    badge.className = "round-badge";
    badge.innerHTML = `${i + 1}차 (${date}) &nbsp; <b>${totalByDate[i]}명</b>`;
    roundBadgesEl.appendChild(badge);
  });

  // 연도별 비교
  const compareData = [
    { year: 2026, count: yearTotal, note: `~${asOfDate} 누적` },
    { year: 2025, count: YEARLY_COMPARISON[2025], note: "연간 합계" },
    { year: 2024, count: YEARLY_COMPARISON[2024], note: "연간 합계" },
  ];
  const maxCompare = Math.max(...compareData.map((d) => d.count));
  const compareRowsEl = document.getElementById("compareRows");
  compareData.forEach((d) => {
    const row = document.createElement("div");
    row.className = `compare-item y${d.year}`;
    const widthPct = Math.round((d.count / maxCompare) * 100);
    let deltaHtml = `<span class="delta">${d.note}</span>`;
    if (d.year === 2026) {
      const others = compareData.filter((x) => x.year !== 2026);
      const parts = others.map((o) => {
        const diff = d.count - o.count;
        const pct = ((diff / o.count) * 100).toFixed(1);
        const cls = diff >= 0 ? "up" : "down";
        const sign = diff >= 0 ? "+" : "";
        return `<span class="delta ${cls}">${o.year}년 대비 ${sign}${diff}명 (${sign}${pct}%)</span>`;
      });
      deltaHtml = parts.join(" ");
    }
    row.innerHTML = `
      <span class="yr">${d.year}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${widthPct}%"></span></span>
      <span class="cnt">${d.count.toLocaleString()}명</span>
    `;
    compareRowsEl.appendChild(row);
    if (d.year === 2026) {
      const deltaRow = document.createElement("div");
      deltaRow.style.gridColumn = "1 / -1";
      deltaRow.style.textAlign = "right";
      deltaRow.style.display = "flex";
      deltaRow.style.gap = "10px";
      deltaRow.style.justifyContent = "flex-end";
      deltaRow.innerHTML = deltaHtml;
      compareRowsEl.appendChild(deltaRow);
    }
  });

  // 발령일자별 차트
  const ctx = document.getElementById("dateChart").getContext("2d");
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: DATES,
      datasets: [
        {
          label: "발령인원",
          data: totalByDate,
          backgroundColor: BRAND.primary,
          borderRadius: 8,
          order: 2,
          yAxisID: "y",
        },
        {
          label: "누적 발령인원",
          data: cumulative,
          type: "line",
          borderColor: BRAND.green,
          backgroundColor: BRAND.green,
          tension: 0.3,
          order: 1,
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
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y}명` } },
      },
      scales: {
        y: {
          beginAtZero: true,
          position: "left",
          title: { display: true, text: "발령인원(명)", color: BRAND.muted },
          grid: { color: BRAND.grid },
          ticks: { color: BRAND.muted },
        },
        y1: {
          beginAtZero: true,
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: "누적 발령인원(명)", color: BRAND.muted },
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
  const dateTableBody = document.querySelector("#dateTable tbody");
  DATES.forEach((date, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}차</td>
      <td>${date}</td>
      <td>${totalByDate[i]}명</td>
      <td>${cumulative[i]}명</td>
    `;
    dateTableBody.appendChild(tr);
  });
  const totalRow = document.createElement("tr");
  totalRow.innerHTML = `<td colspan="2" style="text-align:right;font-weight:700;">합계</td><td style="font-weight:700;">${yearTotal}명</td><td style="font-weight:700;">${yearTotal}명</td>`;
  dateTableBody.appendChild(totalRow);

  // 부서별 세부 표 헤더
  const headRow = document.getElementById("deptTableHeadRow");
  let headHtml = `<th rowspan="2">부서</th>`;
  DATES.forEach((date, i) => {
    headHtml += `<th colspan="2">${i + 1}차 (${date})</th>`;
  });
  headRow.innerHTML = headHtml;
  const subHeadRow = document.createElement("tr");
  let subHeadHtml = "";
  DATES.forEach(() => {
    subHeadHtml += `<th>발령인원</th><th>누적인원</th>`;
  });
  subHeadRow.innerHTML = subHeadHtml;
  headRow.parentElement.appendChild(subHeadRow);

  // 부서별 세부 표 본문
  const deptTableBody = document.querySelector("#deptTable tbody");
  const grandTotals = new Array(DATES.length).fill(0);

  DEPT_GROUPS.forEach((group) => {
    const groupHeaderRow = document.createElement("tr");
    groupHeaderRow.className = "group-header";
    groupHeaderRow.innerHTML = `<td colspan="${1 + DATES.length * 2}">${group.name}</td>`;
    deptTableBody.appendChild(groupHeaderRow);

    const groupTotals = new Array(DATES.length).fill(0);

    Object.entries(group.depts).forEach(([deptName, values]) => {
      const cum = toCumulative(values);
      values.forEach((v, i) => (groupTotals[i] += v));
      const tr = document.createElement("tr");
      let cells = `<td class="dept-name">${deptName}</td>`;
      values.forEach((v, i) => {
        cells += `<td>${v}명</td><td class="cum">${cum[i]}명</td>`;
      });
      tr.innerHTML = cells;
      deptTableBody.appendChild(tr);
    });

    const groupCum = toCumulative(groupTotals);
    groupTotals.forEach((v, i) => (grandTotals[i] += v));
    const subtotalRow = document.createElement("tr");
    subtotalRow.className = "group-subtotal";
    let subCells = `<td class="dept-name">${group.name} 소계</td>`;
    groupTotals.forEach((v, i) => {
      subCells += `<td>${v}명</td><td class="cum">${groupCum[i]}명</td>`;
    });
    subtotalRow.innerHTML = subCells;
    deptTableBody.appendChild(subtotalRow);
  });

  const grandCum = toCumulative(grandTotals);
  const grandRow = document.createElement("tr");
  grandRow.className = "grand-total";
  let grandCells = `<td class="dept-name">전체 합계</td>`;
  grandTotals.forEach((v, i) => {
    grandCells += `<td>${v}명</td><td>${grandCum[i]}명</td>`;
  });
  grandRow.innerHTML = grandCells;
  deptTableBody.appendChild(grandRow);
})();
