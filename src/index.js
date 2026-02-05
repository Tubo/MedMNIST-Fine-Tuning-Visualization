import "tabulator-tables/dist/css/tabulator.min.css";
import { TabulatorFull as Tabulator } from "tabulator-tables";
import * as dfd from "danfojs";
import "./styles.css";

const DATA_URL = new URL("../data/all_datasets_summary.csv", import.meta.url);
const METRICS = [
  { key: "test_acc", label: "Acc" },
  { key: "test_auc", label: "AUC" },
  { key: "test_f1_macro", label: "F1" }
];

const resolveDataUrl = (defaultUrl) => {
  const importMap = document.querySelector('script[type="importmap"]');
  if (!importMap) return defaultUrl.toString();

  try {
    const { imports } = JSON.parse(importMap.textContent);
    if (!imports) return defaultUrl.toString();
    const csvUrl = Object.values(imports).find((value) => value.endsWith(".csv"));
    if (!csvUrl) return defaultUrl.toString();
    return new URL(csvUrl, window.location.origin).toString();
  } catch (error) {
    return defaultUrl.toString();
  }
};

const toNumberSeries = (series) => {
  const values = series.values.map((value) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : NaN;
  });
  return new dfd.Series(values, { index: series.index });
};

const buildPivot = (rows) => {
  const datasetSet = new Set();
  const strategySet = new Set();

  rows.forEach((row) => {
    if (!row.dataset || !row.strategy) return;
    datasetSet.add(row.dataset);
    strategySet.add(row.strategy);
  });

  const datasets = Array.from(datasetSet).sort();
  const strategies = Array.from(strategySet).sort();
  const datasetKeys = new Map(
    datasets.map((dataset) => [dataset, dataset.replace(/[^a-z0-9]+/gi, "_")])
  );

  const tableRows = strategies.map((strategy) => {
    const row = { strategy };
    datasets.forEach((dataset) => {
      const datasetKey = datasetKeys.get(dataset);
      METRICS.forEach(({ label }) => {
        const fieldKey = `${datasetKey}__${label.toLowerCase()}`;
        row[fieldKey] = null;
      });
    });
    return row;
  });

  const rowIndex = new Map(tableRows.map((row) => [row.strategy, row]));

  rows.forEach((row) => {
    const strategyRow = rowIndex.get(row.strategy);
    const datasetKey = datasetKeys.get(row.dataset);
    if (!strategyRow || !datasetKey) return;
    METRICS.forEach(({ key, label }) => {
      const metricKey = row.metricKeys?.[key] ?? key;
      const fieldKey = `${datasetKey}__${label.toLowerCase()}`;
      const value = row[metricKey];
      strategyRow[fieldKey] = Number.isFinite(value) ? value : null;
    });
  });

  return { datasets, datasetKeys, tableRows };
};

const buildColumns = (datasets, datasetKeys, tableRows) => {
  const metricColumns = METRICS.map(({ label }) => ({
    title: label,
    fieldSuffix: label.toLowerCase()
  }));

  const highlightMap = new Map();
  datasets.forEach((dataset) => {
    const datasetKey = datasetKeys.get(dataset);
    METRICS.forEach(({ label }) => {
      const field = `${datasetKey}__${label.toLowerCase()}`;
      const ranked = tableRows
        .map((row) => ({ strategy: row.strategy, value: row[field] }))
        .filter(({ value }) => Number.isFinite(value))
        .sort((a, b) => {
          if (b.value !== a.value) return b.value - a.value;
          return String(a.strategy).localeCompare(String(b.strategy));
        });
      const topRankings = new Map();
      ranked.slice(0, 3).forEach(({ strategy }, index) => {
        topRankings.set(strategy, index + 1);
      });
      highlightMap.set(field, topRankings);
    });
  });

  const formatMetric = (cell) => {
    const value = cell.getValue();
    if (value == null || Number.isNaN(value)) return "";
    return Number(value).toFixed(4);
  };

  const formatMetricWithHighlight = (cell) => {
    const output = formatMetric(cell);
    if (!output) return output;
    const field = cell.getField();
    const strategy = cell.getRow().getData().strategy;
    const highlightSet = highlightMap.get(field);
    const element = cell.getElement();
    const rank = highlightSet?.get(strategy);
    if (element) {
      if (rank) {
        element.classList.add("cell-top-rank");
      } else {
        element.classList.remove("cell-top-rank");
      }
    }
    if (!rank) return output;
    return `
      <span class="rank-badge" aria-label="Rank ${rank}">${rank}</span>
      <span class="metric-value">${output}</span>
    `;
  };

  const columns = [
    {
      title: "Strategy",
      field: "strategy",
      headerFilter: "input",
      frozen: true,
      width: 160
    }
  ];

  datasets.forEach((dataset) => {
    const datasetKey = datasetKeys.get(dataset);
    columns.push({
      title: dataset,
      columns: metricColumns.map(({ title, fieldSuffix }) => ({
        title,
        field: `${datasetKey}__${fieldSuffix}`,
        hozAlign: "right",
        sorter: "number",
        formatter: formatMetricWithHighlight,
        width: 96
      }))
    });
  });

  return columns;
};

const renderTabs = (backbones, onSelect) => {
  const tabBar = document.querySelector("#backbone-tabs");
  if (!tabBar) return;
  tabBar.innerHTML = "";
  tabBar.setAttribute("role", "tablist");
  tabBar.setAttribute("aria-label", "Backbone filters");

  const setActiveTab = (button) => {
    const buttons = Array.from(tabBar.querySelectorAll(".tab"));
    buttons.forEach((tabButton) => {
      const isActive = tabButton === button;
      tabButton.classList.toggle("active", isActive);
      tabButton.setAttribute("aria-selected", isActive ? "true" : "false");
      tabButton.tabIndex = isActive ? 0 : -1;
    });
  };

  const selectTab = (button) => {
    if (!button) return;
    setActiveTab(button);
    const name = button.dataset.backbone;
    onSelect(name === "All" ? null : name);
  };

  const allTabs = ["All", ...backbones];
  allTabs.forEach((name, index) => {
    const button = document.createElement("button");
    button.className = `tab${index === 0 ? " active" : ""}`;
    button.type = "button";
    button.textContent = name;
    button.dataset.backbone = name;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "data-table");
    button.setAttribute("aria-selected", index === 0 ? "true" : "false");
    button.tabIndex = index === 0 ? 0 : -1;
    button.addEventListener("click", () => selectTab(button));
    button.addEventListener("keydown", (event) => {
      const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
      if (!keys.includes(event.key)) return;
      const buttons = Array.from(tabBar.querySelectorAll(".tab"));
      const currentIndex = buttons.indexOf(button);
      if (currentIndex === -1) return;
      let nextIndex = currentIndex;
      if (event.key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
      if (event.key === "ArrowRight") nextIndex = Math.min(buttons.length - 1, currentIndex + 1);
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = buttons.length - 1;
      const nextButton = buttons[nextIndex];
      if (nextButton) {
        nextButton.focus();
        selectTab(nextButton);
      }
    });
    tabBar.appendChild(button);
  });
};

const renderTable = (rows) => {
  const tableElement = document.querySelector("#data-table");
  if (!tableElement) return;

  if (!rows.length) {
    if (window.__tabulatorTable) {
      window.__tabulatorTable.destroy();
      window.__tabulatorTable = null;
    }
    tableElement.textContent = "No data available.";
    return;
  }

  const { datasets, datasetKeys, tableRows } = buildPivot(rows);
  if (!datasets.length) {
    if (window.__tabulatorTable) {
      window.__tabulatorTable.destroy();
      window.__tabulatorTable = null;
    }
    tableElement.textContent = "No datasets found.";
    return;
  }

  const columns = buildColumns(datasets, datasetKeys, tableRows);

  if (window.__tabulatorTable) {
    window.__tabulatorTable.setColumns(columns);
    window.__tabulatorTable.replaceData(tableRows);
    window.__tabulatorTable.setPage(1);
    return;
  }

  tableElement.textContent = "";
  window.__tabulatorTable = new Tabulator(tableElement, {
    data: tableRows,
    layout: "fitColumns",
    height: 360,
    pagination: "local",
    paginationSize: 8,
    columns
  });
};

const init = async () => {
  const tableElement = document.querySelector("#data-table");
  if (tableElement) tableElement.textContent = "Loading data...";
  const resolvedUrl = resolveDataUrl(DATA_URL);

  try {
    const dataframe = await dfd.readCSV(resolvedUrl);
    METRICS.forEach(({ key }) => {
      if (dataframe.columns.includes(key)) {
        dataframe.addColumn(key, toNumberSeries(dataframe[key]), { inplace: true });
      }
    });

    const backbones = Array.from(dataframe["backbone"].unique().values).sort();

    const filterByBackbone = (frame, backbone) => {
      if (!backbone) return frame;
      const values = frame["backbone"]?.values ?? [];
      const rowIndices = [];
      for (let index = 0; index < values.length; index += 1) {
        if (values[index] === backbone) {
          rowIndices.push(index);
        }
      }
      return frame.iloc({ rows: rowIndices });
    };

    const buildRows = (backbone) => {
      const scoped = filterByBackbone(dataframe, backbone);
      const working = scoped.copy();
      const strategyValues = working["strategy"].values;
      const unfreezeValues = working["unfreeze_pct"]?.values ?? [];
      const directionValues = working["Direction"]?.values ?? [];
      const derivedStrategies = strategyValues.map((value, index) => {
        if (value !== "partial") return value;
        const pct = Number(unfreezeValues[index]);
        const direction = String(directionValues[index] ?? "").toLowerCase();
        if (!Number.isFinite(pct)) return "partial";
        if (!direction) return `partial_${Math.round(pct)}`;
        return `partial_${direction}_${Math.round(pct)}`;
      });
      working.addColumn("strategy_group", new dfd.Series(derivedStrategies), { inplace: true });

      const grouped = working
        .groupby(["strategy_group", "dataset"])
        .col(METRICS.map(({ key }) => key))
        .mean();

      const groupedColumns = grouped.columns;
      const metricKeys = METRICS.reduce((acc, { key }) => {
        const meanKey = `${key}_mean`;
        acc[key] = groupedColumns.includes(meanKey) ? meanKey : key;
        return acc;
      }, {});

      return dfd.toJSON(grouped).map((row) => {
        const { strategy_group: strategyGroup, ...rest } = row;
        return {
          ...rest,
          strategy: strategyGroup ?? row.strategy,
          metricKeys
        };
      });
    };

    const dataCache = new Map();
    const getRows = (backbone) => {
      const key = backbone ?? "All";
      if (!dataCache.has(key)) {
        dataCache.set(key, buildRows(backbone));
      }
      return dataCache.get(key);
    };

    renderTabs(backbones, (backbone) => renderTable(getRows(backbone)));
    renderTable(getRows(null));
  } catch (error) {
    console.error("Failed to load dataset", error);
    if (tableElement) {
      const message = error instanceof Error ? error.message : "Failed to load data.";
      tableElement.textContent = message;
    }
  }
};

init();
