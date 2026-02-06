import "tabulator-tables/dist/css/tabulator.min.css";
import { TabulatorFull as Tabulator } from "tabulator-tables";
import * as dfd from "danfojs";
import "./styles.css";

const embed = window.vegaEmbed;

const DATA_URL = new URL("../data/all_datasets_summary.csv", import.meta.url);
const METRICS = [
  { key: "test_acc", label: "Acc" },
  { key: "test_auc", label: "AUC" },
  { key: "test_f1_macro", label: "F1" }
];

const METRIC_SUFFIX_TO_KEY = {
  acc: "test_acc",
  auc: "test_auc",
  f1: "test_f1_macro"
};

const STRATEGY_ORDER = [
  "LP",
  "partial_start_20",
  "partial_end_20",
  "partial_start_40",
  "partial_end_40",
  "partial_start_60",
  "partial_end_60",
  "full"
];

const BACKBONE_SHAPES = {
  "densenet121": "circle",
  "resnet18": "square",
  "swin_tiny_patch4_window7_224": "triangle-up",
  "vit_base_patch16_224": "diamond"
};

/* ── Interaction state ─────────────────────────────────────────────── */
const interactionState = {
  visibleDatasets: new Set(),
  allDatasets: [],
  currentMetric: "test_acc",
  currentBackbone: null,
  vegaView: null,
  // Reverse map: sanitized key → original dataset name
  datasetKeyToName: new Map(),
};

/* ── Helpers ───────────────────────────────────────────────────────── */
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

/* ── Pivot ─────────────────────────────────────────────────────────── */
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

  // Build reverse map
  interactionState.datasetKeyToName.clear();
  datasetKeys.forEach((key, name) => {
    interactionState.datasetKeyToName.set(key, name);
  });

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

/* ── Columns (with interactive headers) ────────────────────────────── */
const buildColumns = (datasets, datasetKeys, tableRows, onDatasetToggle, onMetricClick) => {
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

      // Add hidden-dataset class if this column's dataset is hidden
      const datasetKey = field.split("__")[0];
      const datasetName = interactionState.datasetKeyToName.get(datasetKey);
      if (datasetName && !interactionState.visibleDatasets.has(datasetName)) {
        element.classList.add("cell-dataset-hidden");
      } else {
        element.classList.remove("cell-dataset-hidden");
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
    const isHidden = !interactionState.visibleDatasets.has(dataset);

    columns.push({
      title: dataset,
      cssClass: `dataset-col-group${isHidden ? " dataset-hidden" : ""}`,
      headerClick: (e, column) => {
        e.stopPropagation();
        onDatasetToggle(dataset, column);
      },
      columns: metricColumns.map(({ title, fieldSuffix }) => {
        const metricKey = METRIC_SUFFIX_TO_KEY[fieldSuffix];
        const isActiveMetric = metricKey === interactionState.currentMetric;
        return {
          title,
          field: `${datasetKey}__${fieldSuffix}`,
          hozAlign: "right",
          sorter: "number",
          formatter: formatMetricWithHighlight,
          width: 96,
          cssClass: `metric-col${isActiveMetric ? " metric-col-active" : ""}`,
          headerClick: (e, column) => {
            e.stopPropagation();
            onMetricClick(metricKey, column);
          }
        };
      })
    });
  });

  return columns;
};

/* ── Chart data ────────────────────────────────────────────────────── */
const buildLineChartData = (rows, metricKey) => {
  const lineChartData = [];
  const metric = METRICS.find(({ key }) => key === metricKey);
  if (!metric) return lineChartData;

  rows.forEach((row) => {
    if (!row.dataset || !row.strategy || !row.backbone) return;

    // Filter by visible datasets
    if (!interactionState.visibleDatasets.has(row.dataset)) return;

    const metricFieldKey = row.metricKeys?.[metricKey] ?? metricKey;
    const value = row[metricFieldKey];

    if (Number.isFinite(value) && value > 0) {
      lineChartData.push({
        strategy: row.strategy,
        dataset: row.dataset,
        backbone: row.backbone,
        value
      });
    }
  });

  return lineChartData;
};

/* ── Chart spec (with hover selection support) ─────────────────────── */
const buildLineChartSpec = (data, metricKey, chartWidth, activeBackbone) => {
  const metric = METRICS.find(({ key }) => key === metricKey);
  const metricLabel = metric ? metric.label : "Metric";

  const strategySort = [...STRATEGY_ORDER];

  // Determine if we have a specific backbone highlighted
  const hasBackboneHighlight = activeBackbone != null;

  // Build conditional opacity for backbone highlighting
  const lineOpacity = hasBackboneHighlight
    ? {
      condition: { test: `datum.backbone === '${activeBackbone}'`, value: 1 },
      value: 0.2
    }
    : { value: 0.8 };

  const pointOpacity = hasBackboneHighlight
    ? {
      condition: { test: `datum.backbone === '${activeBackbone}'`, value: 1 },
      value: 0.15
    }
    : { value: 0.8 };

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: chartWidth,
    height: 800,
    autosize: { type: "fit", contains: "padding" },
    data: { values: data },
    layer: [
      {
        mark: { type: "line", point: false },
        encoding: {
          x: {
            field: "strategy",
            type: "ordinal",
            title: "Strategy",
            scale: { domain: strategySort },
            axis: { labelAngle: -45, labelLimit: 120 }
          },
          y: {
            field: "value",
            type: "quantitative",
            title: metricLabel,
            scale: { zero: false }
          },
          color: {
            field: "dataset",
            type: "nominal",
            title: "Dataset",
            scale: { scheme: "tableau10" }
          },
          detail: [
            { field: "dataset", type: "nominal" },
            { field: "backbone", type: "nominal" }
          ],
          opacity: lineOpacity,
          strokeWidth: hasBackboneHighlight
            ? {
              condition: { test: `datum.backbone === '${activeBackbone}'`, value: 2.5 },
              value: 1
            }
            : { value: 1.5 }
        }
      },
      {
        // Base points layer with hover selection
        params: [
          {
            name: "hoveredPoint",
            select: {
              type: "point",
              fields: ["strategy", "dataset"],
              on: "pointerover",
              clear: "pointerout"
            }
          }
        ],
        mark: { type: "point", filled: true, size: 80 },
        encoding: {
          x: {
            field: "strategy",
            type: "ordinal",
            scale: { domain: strategySort }
          },
          y: {
            field: "value",
            type: "quantitative"
          },
          color: {
            field: "dataset",
            type: "nominal",
            scale: { scheme: "tableau10" },
            legend: null
          },
          shape: {
            field: "backbone",
            type: "nominal",
            title: "Backbone",
            scale: {
              domain: Object.keys(BACKBONE_SHAPES),
              range: Object.values(BACKBONE_SHAPES)
            }
          },
          opacity: pointOpacity,
          size: {
            condition: { param: "hoveredPoint", value: 220 },
            value: hasBackboneHighlight ? 60 : 80
          },
          stroke: {
            condition: { param: "hoveredPoint", value: "#1c2732" },
            value: null
          },
          strokeWidth: {
            condition: { param: "hoveredPoint", value: 2 },
            value: 0
          },
          tooltip: [
            { field: "strategy", type: "nominal", title: "Strategy" },
            { field: "dataset", type: "nominal", title: "Dataset" },
            { field: "backbone", type: "nominal", title: "Backbone" },
            { field: "value", type: "quantitative", title: metricLabel, format: ".4f" }
          ]
        }
      }
    ],
    config: {
      axis: { labelFontSize: 11, titleFontSize: 12 },
      legend: { labelFontSize: 11, titleFontSize: 12 }
    }
  };
};

/* ── Render chart ──────────────────────────────────────────────────── */
const renderLineChart = (rows, metricKey = "test_acc", activeBackbone = null) => {
  const chartElement = document.querySelector("#heatmap-chart");
  if (!chartElement) return;

  if (!rows.length) {
    chartElement.textContent = "No data available for chart.";
    interactionState.vegaView = null;
    return;
  }

  const data = buildLineChartData(rows, metricKey);
  if (!data.length) {
    chartElement.textContent = "No data available for chart.";
    interactionState.vegaView = null;
    return;
  }

  const spec = buildLineChartSpec(data, metricKey, chartElement.clientWidth - 40, activeBackbone);

  embed(chartElement, spec, { actions: { source: false, compiled: false, editor: false } })
    .then((result) => {
      interactionState.vegaView = result.view;
    })
    .catch((error) => {
      console.error("Failed to render line chart", error?.message ?? error);
      chartElement.textContent = "Failed to render line chart.";
      interactionState.vegaView = null;
    });
};

/* ── Highlight chart point from table hover ────────────────────────── */
const highlightChartPoint = (strategy, datasetName) => {
  const view = interactionState.vegaView;
  if (!view) return;

  try {
    if (!strategy || !datasetName) {
      // Clear selection
      view.signal("hoveredPoint_tuple", null);
      view.signal("hoveredPoint", null);
      view.runAsync();
      return;
    }

    // Find data points matching our hover target
    const allData = view.data("data_0");
    if (!allData) return;

    const matchingTuples = [];
    allData.forEach((datum) => {
      if (datum.strategy === strategy && datum.dataset === datasetName) {
        matchingTuples.push({
          values: [datum.strategy, datum.dataset],
        });
      }
    });

    if (matchingTuples.length > 0) {
      // Set selection to highlight matching points
      view.signal("hoveredPoint_tuple", matchingTuples);
      view.signal("hoveredPoint", {
        vlPoint: { or: matchingTuples.map((t) => ({ strategy: t.values[0], dataset: t.values[1] })) },
        fields: [
          { field: "strategy", channel: "x", type: "E" },
          { field: "dataset", channel: "color", type: "E" }
        ]
      });
      view.runAsync();
    }
  } catch (err) {
    // Silently handle signal errors - the chart may not have the signal yet
  }
};

/* ── Tabs ──────────────────────────────────────────────────────────── */
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

/* ── Table ─────────────────────────────────────────────────────────── */
const renderTable = (rows, onChartUpdate) => {
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

  // Initialize visible datasets if empty (first render or tab switch)
  if (interactionState.allDatasets.length === 0 || interactionState.visibleDatasets.size === 0) {
    interactionState.allDatasets = datasets;
    interactionState.visibleDatasets = new Set(datasets);
  }

  /* ── Dataset toggle handler ──────────────────────────────────────── */
  const onDatasetToggle = (datasetName, column) => {
    const isVisible = interactionState.visibleDatasets.has(datasetName);

    // Prevent hiding the last visible dataset
    if (isVisible && interactionState.visibleDatasets.size <= 1) return;

    if (isVisible) {
      interactionState.visibleDatasets.delete(datasetName);
    } else {
      interactionState.visibleDatasets.add(datasetName);
    }

    // Update column header visual
    applyDatasetHeaderStyles();

    // Update cell styles
    if (window.__tabulatorTable) {
      window.__tabulatorTable.getRows().forEach((row) => {
        row.getCells().forEach((cell) => {
          const field = cell.getField();
          if (!field || field === "strategy") return;
          const key = field.split("__")[0];
          const name = interactionState.datasetKeyToName.get(key);
          if (name) {
            const el = cell.getElement();
            if (interactionState.visibleDatasets.has(name)) {
              el.classList.remove("cell-dataset-hidden");
            } else {
              el.classList.add("cell-dataset-hidden");
            }
          }
        });
      });
    }

    // Re-render chart with filtered data
    onChartUpdate();
  };

  /* ── Metric click handler ────────────────────────────────────────── */
  const onMetricClick = (metricKey) => {
    if (!metricKey || metricKey === interactionState.currentMetric) return;

    interactionState.currentMetric = metricKey;

    // Sync the dropdown
    const dropdown = document.querySelector("#metric-selector");
    if (dropdown) dropdown.value = metricKey;

    // Update metric column active styles
    applyMetricHeaderStyles();

    // Re-render chart
    onChartUpdate();
  };

  const columns = buildColumns(datasets, datasetKeys, tableRows, onDatasetToggle, onMetricClick);

  /* ── Cell hover handlers ─────────────────────────────────────────── */
  const cellMouseEnter = (e, cell) => {
    const field = cell.getField();
    if (!field || field === "strategy") return;

    const parts = field.split("__");
    if (parts.length < 2) return;

    const datasetKey = parts[0];
    const datasetName = interactionState.datasetKeyToName.get(datasetKey);
    if (!datasetName) return;

    // Don't highlight if dataset is hidden
    if (!interactionState.visibleDatasets.has(datasetName)) return;

    const rowData = cell.getRow().getData();
    const strategy = rowData.strategy;

    // Visual highlight on cell
    cell.getElement().classList.add("cell-hover-highlight");

    // Highlight corresponding point in chart
    highlightChartPoint(strategy, datasetName);
  };

  const cellMouseLeave = (e, cell) => {
    cell.getElement().classList.remove("cell-hover-highlight");
    highlightChartPoint(null, null);
  };

  if (window.__tabulatorTable) {
    window.__tabulatorTable.setColumns(columns);
    window.__tabulatorTable.replaceData(tableRows);
    window.__tabulatorTable.setPage(1);
    // Re-apply styles after data update
    setTimeout(() => {
      applyDatasetHeaderStyles();
      applyMetricHeaderStyles();
    }, 50);
    return;
  }

  tableElement.textContent = "";
  window.__tabulatorTable = new Tabulator(tableElement, {
    data: tableRows,
    layout: "fitColumns",
    height: 360,
    pagination: "local",
    paginationSize: 8,
    columns,
    cellMouseEnter,
    cellMouseLeave,
  });

  // Apply styles once table is built
  window.__tabulatorTable.on("tableBuilt", () => {
    applyDatasetHeaderStyles();
    applyMetricHeaderStyles();
  });
};

/* ── Style helpers (applied after render) ──────────────────────────── */
const applyDatasetHeaderStyles = () => {
  // Column groups are not returned by getColumns() in Tabulator;
  // query the DOM directly for group header elements.
  const groupHeaders = document.querySelectorAll(".tabulator-col-group");
  groupHeaders.forEach((el) => {
    const titleEl = el.querySelector(":scope > .tabulator-col-content .tabulator-col-title");
    const title = titleEl?.textContent?.trim();
    if (!title) return;

    el.classList.add("dataset-col-group");
    if (interactionState.visibleDatasets.has(title)) {
      el.classList.remove("dataset-hidden");
    } else {
      el.classList.add("dataset-hidden");
    }
  });
};

const applyMetricHeaderStyles = () => {
  if (!window.__tabulatorTable) return;

  // Leaf columns are accessible via getColumns()
  const leafCols = window.__tabulatorTable.getColumns();
  leafCols.forEach((col) => {
    const field = col.getField();
    if (!field || field === "strategy") return;

    const suffix = field.split("__")[1];
    if (!suffix) return;

    const metricKey = METRIC_SUFFIX_TO_KEY[suffix];
    const el = col.getElement();
    if (!el) return;

    el.classList.add("metric-col");
    if (metricKey === interactionState.currentMetric) {
      el.classList.add("metric-col-active");
    } else {
      el.classList.remove("metric-col-active");
    }
  });
};

/* ── Init ──────────────────────────────────────────────────────────── */
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
        .groupby(["strategy_group", "dataset", "backbone"])
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

    const updateViews = (backbone, metric) => {
      const rows = getRows(backbone);
      const onChartUpdate = () => {
        renderLineChart(rows, interactionState.currentMetric, interactionState.currentBackbone);
      };
      renderTable(rows, onChartUpdate);
      renderLineChart(rows, metric, interactionState.currentBackbone);
    };

    /* ── Metric selector dropdown ────────────────────────────────────── */
    const metricSelector = document.querySelector("#metric-selector");
    if (metricSelector) {
      metricSelector.addEventListener("change", (event) => {
        interactionState.currentMetric = event.target.value;
        applyMetricHeaderStyles();
        const rows = getRows(interactionState.currentBackbone);
        renderLineChart(rows, interactionState.currentMetric, interactionState.currentBackbone);
      });
    }

    /* ── Reset datasets button ───────────────────────────────────────── */
    const resetButton = document.querySelector("#reset-datasets");
    if (resetButton) {
      resetButton.addEventListener("click", () => {
        interactionState.visibleDatasets = new Set(interactionState.allDatasets);
        applyDatasetHeaderStyles();
        // Update cell styles
        if (window.__tabulatorTable) {
          window.__tabulatorTable.getRows().forEach((row) => {
            row.getCells().forEach((cell) => {
              cell.getElement().classList.remove("cell-dataset-hidden");
            });
          });
        }
        const rows = getRows(interactionState.currentBackbone);
        renderLineChart(rows, interactionState.currentMetric, interactionState.currentBackbone);
      });
    }

    /* ── Backbone tabs ───────────────────────────────────────────────── */
    renderTabs(backbones, (backbone) => {
      interactionState.currentBackbone = backbone;
      // Reset visible datasets on tab switch
      interactionState.allDatasets = [];
      interactionState.visibleDatasets.clear();
      updateViews(backbone, interactionState.currentMetric);
    });

    updateViews(null, interactionState.currentMetric);
  } catch (error) {
    console.error("Failed to load dataset", error);
    if (tableElement) {
      const message = error instanceof Error ? error.message : "Failed to load data.";
      tableElement.textContent = message;
    }
  }
};

init();
