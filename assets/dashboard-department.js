(function () {
  const asOfDate = DATES[DATES.length - 1];
  document.getElementById("asOfText").textContent = `기준일 : ${asOfDate} (2026년 1~${DATES.length}차 발령 누적 기준)`;

  const deptNames = getAllDeptNames();
  const deptStats = deptNames.map((name) => {
    const d = DEPT_RESIGNATION[name];
    return {
      name,
      assigned: d.assigned,
      resigned: d.resigned,
      rate2026: getDeptRate2026(name),
      rate2025: d.rate2025,
      rate2024: d.rate2024,
    };
  });

  const sortedDesc = [...deptStats].sort((a, b) => b.rate2026 - a.rate2026);

  // 상단 TOP3 사직율 부서 카드
  const rankGrid = document.getElementById("rankGrid");
  sortedDesc.slice(0, 3).forEach((d, i) => {
    const card = document.createElement("div");
    card.className = "rank-card";
    const diff2025 = d.rate2026 - d.rate2025;
    const diff2024 = d.rate2026 - d.rate2024;
    const fmtDiff = (v) => (v >= 0 ? `+${v.toFixed(1)}%p` : `${v.toFixed(1)}%p`);
    card.innerHTML = `
      <span class="rank-badge">TOP ${i + 1}</span>
      <div class="rank-dept">${d.name}</div>
      <div class="rank-rate">${d.rate2026.toFixed(1)}%</div>
      <div class="rank-detail">발령 ${d.assigned}명 중 사직 ${d.resigned}명</div>
      <div class="rank-compare">
        <span>25년 대비 ${fmtDiff(diff2025)}</span>
        <span>24년 대비 ${fmtDiff(diff2024)}</span>
      </div>
    `;
    rankGrid.appendChild(card);
  });

  // 부서별 사직율 순위 차트 (2026 vs 2025 vs 2024)
  const ctx = document.getElementById("rankChart").getContext("2d");
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: sortedDesc.map((d) => d.name),
      datasets: [
        {
          label: "2026년",
          data: sortedDesc.map((d) => Number(d.rate2026.toFixed(1))),
          backgroundColor: BRAND.primary,
        },
        {
          label: "2025년",
          data: sortedDesc.map((d) => d.rate2025),
          backgroundColor: BRAND.magenta,
        },
        {
          label: "2024년",
          data: sortedDesc.map((d) => d.rate2024),
          backgroundColor: "rgba(166, 174, 224, 0.35)",
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: BRAND.muted } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.x}%` } },
      },
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: "사직율(%)", color: BRAND.muted },
          grid: { color: BRAND.grid },
          ticks: { color: BRAND.muted },
        },
        y: {
          grid: { color: BRAND.grid },
          ticks: { color: BRAND.muted },
        },
      },
    },
  });

  // 부서별 상세 표
  const tbody = document.querySelector("#deptDetailTable tbody");
  const tfoot = document.querySelector("#deptDetailTable tfoot");
  const grand = { assigned: 0, resigned: 0 };

  DEPT_GROUPS.forEach((group) => {
    const groupRow = document.createElement("tr");
    groupRow.className = "group-header";
    groupRow.innerHTML = `<td colspan="6">${group.name}</td>`;
    tbody.appendChild(groupRow);

    const groupTotal = { assigned: 0, resigned: 0 };

    Object.keys(group.depts).forEach((deptName) => {
      const d = DEPT_RESIGNATION[deptName];
      const rate2026 = getDeptRate2026(deptName);
      groupTotal.assigned += d.assigned;
      groupTotal.resigned += d.resigned;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="dept-name">${deptName}</td>
        <td>${d.assigned}명</td>
        <td>${d.resigned}명</td>
        <td>${rate2026.toFixed(1)}%</td>
        <td>${d.rate2025.toFixed(1)}%</td>
        <td>${d.rate2024.toFixed(1)}%</td>
      `;
      tbody.appendChild(tr);
    });

    grand.assigned += groupTotal.assigned;
    grand.resigned += groupTotal.resigned;
    const groupRate = groupTotal.assigned === 0 ? 0 : (groupTotal.resigned / groupTotal.assigned) * 100;
    const subtotalRow = document.createElement("tr");
    subtotalRow.className = "group-subtotal";
    subtotalRow.innerHTML = `
      <td class="dept-name">${group.name} 소계</td>
      <td>${groupTotal.assigned}명</td>
      <td>${groupTotal.resigned}명</td>
      <td>${groupRate.toFixed(1)}%</td>
      <td>-</td>
      <td>-</td>
    `;
    tbody.appendChild(subtotalRow);
  });

  const grandRate = grand.assigned === 0 ? 0 : (grand.resigned / grand.assigned) * 100;
  const grandRow = document.createElement("tr");
  grandRow.className = "grand-total";
  grandRow.innerHTML = `
    <td class="dept-name">전체 합계</td>
    <td>${grand.assigned}명</td>
    <td>${grand.resigned}명</td>
    <td>${grandRate.toFixed(1)}%</td>
    <td>-</td>
    <td>-</td>
  `;
  tfoot.appendChild(grandRow);
})();
