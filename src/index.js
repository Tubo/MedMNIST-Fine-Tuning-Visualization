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
  "swin_tiny_patch4_window7_224": "square",
};

const EXCLUDED_BACKBONES = new Set(["resnet18", "vit_base_patch16_224"]);
const MOBILE_BREAKPOINT = 640;
const TABLET_BREAKPOINT = 980;

/* Stable color palette for datasets (tableau10 hex values) */
const TABLEAU10 = [
  "#4e79a7", "#f28e2c", "#e15759", "#76b7b2", "#59a14f",
  "#edc949", "#af7aa1", "#ff9da7", "#9c755f", "#bab0ab"
];

/** Build a fixed dataset→color map so colours never shuffle. */
const buildDatasetColorMap = (datasets) => {
  const map = new Map();
  const sorted = [...datasets].sort();
  sorted.forEach((name, i) => {
    map.set(name, TABLEAU10[i % TABLEAU10.length]);
  });
  return map;
};

/* ── Interaction state ─────────────────────────────────────────────── */
const interactionState = {
  visibleDatasets: new Set(),
  allDatasets: [],
  currentMetric: "test_acc",
  currentBackbone: null,
  // Reverse map: sanitized key → original dataset name
  datasetKeyToName: new Map(),
  // Fixed color mapping: dataset name → color
  datasetColorMap: new Map(),
  // Current table-driven highlight state
  highlightedDataset: null,
  highlightedStrategy: null,
  // Map dataset name → task type (e.g., "classification", "multilabel")
  datasetTaskMap: new Map(),
  // Set of dataset names where test_auc_macro was used instead of test_auc
  datasetAucMacroSet: new Set(),
};

/* ── Helpers ───────────────────────────────────────────────────────── */
const toNumberSeries = (series) => {
  const values = series.values.map((value) => {
    if (value === "" || value === null || value === undefined) return NaN;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : NaN;
  });
  return values;
};

const getResponsiveChartDimensions = (chartElement) => {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1200;
  const containerWidth =
    chartElement.clientWidth || chartElement.parentElement?.clientWidth || 960;
  const chartWidth = Math.max(280, Math.floor(containerWidth - 8));

  let chartHeight = 780;
  if (viewportWidth <= MOBILE_BREAKPOINT) {
    chartHeight = 420;
  } else if (viewportWidth <= TABLET_BREAKPOINT) {
    chartHeight = 600;
  }

  return {
    chartWidth,
    chartHeight,
    isMobile: viewportWidth <= MOBILE_BREAKPOINT,
  };
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
    const task = interactionState.datasetTaskMap.get(dataset);
    const headerTitle = task ? `${dataset} [${task}]` : dataset;

    columns.push({
      title: headerTitle,
      cssClass: `dataset-col-group${isHidden ? " dataset-hidden" : ""}`,
      headerClick: (e, column) => {
        e.stopPropagation();
        onDatasetToggle(dataset, column);
      },
      columns: metricColumns.filter(({ fieldSuffix }) => {
        // For chestmnist, only show AUC (hide Acc and F1)
        if (dataset === "chestmnist" && (fieldSuffix === "acc" || fieldSuffix === "f1")) {
          return false;
        }
        return true;
      }).map(({ title, fieldSuffix }, _i, filtered) => {
        const metricKey = METRIC_SUFFIX_TO_KEY[fieldSuffix];
        const isActiveMetric = metricKey === interactionState.currentMetric;
        // Show "Macro AUC" for datasets that use test_auc_macro fallback
        const colTitle = (fieldSuffix === "auc" && interactionState.datasetAucMacroSet.has(dataset))
          ? "Macro AUC"
          : title;
        // If fewer sub-columns than normal, widen to fill the parent group
        const colWidth = filtered.length < metricColumns.length
          ? Math.floor((96 * metricColumns.length) / filtered.length)
          : 96;
        return {
          title: colTitle,
          field: `${datasetKey}__${fieldSuffix}`,
          hozAlign: "right",
          sorter: "number",
          formatter: formatMetricWithHighlight,
          width: colWidth,
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

    // chestmnist only has AUC; skip it for Acc and F1 metrics
    if (row.dataset === "chestmnist" && (metricKey === "test_acc" || metricKey === "test_f1_macro")) return;

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
const buildLineChartSpec = (
  data,
  metricKey,
  chartWidth,
  chartHeight,
  activeBackbone,
  isMobile,
) => {
  const metric = METRICS.find(({ key }) => key === metricKey);
  const metricLabel = metric ? metric.label : "Metric";

  const strategySort = [...STRATEGY_ORDER];

  // Determine if we have a specific backbone highlighted
  const hasBackboneHighlight = activeBackbone != null;

  // Fixed color domain and range from the stable color map
  const colorMap = interactionState.datasetColorMap;
  const colorDomain = [...colorMap.keys()];
  const colorRange = colorDomain.map((d) => colorMap.get(d));

  // Table-driven highlight state
  const hlDataset = interactionState.highlightedDataset;
  const hlStrategy = interactionState.highlightedStrategy;
  const hasTableHighlight = hlDataset != null;
  const hasCellHighlight = hlDataset != null && hlStrategy != null;

  // Build conditional opacity for backbone highlighting
  const buildLineOpacity = () => {
    if (hasCellHighlight) {
      return {
        condition: {
          test: `datum.dataset === '${hlDataset}'`,
          value: 0.8
        },
        value: 0.15
      };
    }
    if (hasTableHighlight) {
      return {
        condition: {
          test: `datum.dataset === '${hlDataset}'`,
          value: 1
        },
        value: 0.15
      };
    }
    if (hasBackboneHighlight) {
      return {
        condition: { test: `datum.backbone === '${activeBackbone}'`, value: 1 },
        value: 0.2
      };
    }
    return { value: 0.8 };
  };

  const buildPointOpacity = () => {
    if (hasCellHighlight) {
      return {
        condition: {
          test: `datum.strategy === '${hlStrategy}' && datum.dataset === '${hlDataset}'`,
          value: 1
        },
        value: 0.12
      };
    }
    if (hasTableHighlight) {
      return {
        condition: {
          test: `datum.dataset === '${hlDataset}'`,
          value: 1
        },
        value: 0.12
      };
    }
    if (hasBackboneHighlight) {
      return {
        condition: { test: `datum.backbone === '${activeBackbone}'`, value: 1 },
        value: 0.15
      };
    }
    return { value: 0.8 };
  };

  const buildPointSize = () => {
    if (hasCellHighlight) {
      return {
        condition: {
          test: `datum.strategy === '${hlStrategy}' && datum.dataset === '${hlDataset}'`,
          value: 260
        },
        value: 50
      };
    }
    if (hasTableHighlight) {
      return {
        condition: {
          test: `datum.dataset === '${hlDataset}'`,
          value: 160
        },
        value: 50
      };
    }
    return { value: hasBackboneHighlight ? 60 : 80 };
  };

  const buildPointStroke = () => {
    if (hasCellHighlight) {
      return {
        condition: {
          test: `datum.strategy === '${hlStrategy}' && datum.dataset === '${hlDataset}'`,
          value: "#1c2732"
        },
        value: null
      };
    }
    return { value: null };
  };

  const buildPointStrokeWidth = () => {
    if (hasCellHighlight) {
      return {
        condition: {
          test: `datum.strategy === '${hlStrategy}' && datum.dataset === '${hlDataset}'`,
          value: 2.5
        },
        value: 0
      };
    }
    return { value: 0 };
  };

  const lineOpacity = buildLineOpacity();
  const pointOpacity = buildPointOpacity();

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: chartWidth,
    height: chartHeight,
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
            axis: { labelAngle: isMobile ? -35 : -45, labelLimit: isMobile ? 90 : 120 }
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
            scale: { domain: colorDomain, range: colorRange }
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
            scale: { domain: colorDomain, range: colorRange },
            legend: null
          },
          shape: {
            field: "backbone",
            type: "nominal",
            title: "Backbone",
            legend: isMobile ? null : { orient: "right" },
            scale: {
              domain: Object.keys(BACKBONE_SHAPES),
              range: Object.values(BACKBONE_SHAPES)
            }
          },
          opacity: pointOpacity,
          size: buildPointSize(),
          stroke: buildPointStroke(),
          strokeWidth: buildPointStrokeWidth(),
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
      axis: {
        labelFontSize: isMobile ? 10 : 11,
        titleFontSize: isMobile ? 11 : 12,
      },
      legend: {
        labelFontSize: isMobile ? 10 : 11,
        titleFontSize: isMobile ? 11 : 12,
      },
    }
  };
};

/* ── Render chart ──────────────────────────────────────────────────── */
const renderLineChart = (rows, metricKey = "test_acc", activeBackbone = null) => {
  const chartElement = document.querySelector("#heatmap-chart");
  if (!chartElement) return;

  if (!rows.length) {
    chartElement.textContent = "No data available for chart.";
    return;
  }

  const data = buildLineChartData(rows, metricKey);
  if (!data.length) {
    chartElement.textContent = "No data available for chart.";
    return;
  }

  const { chartWidth, chartHeight, isMobile } = getResponsiveChartDimensions(chartElement);

  const spec = buildLineChartSpec(
    data,
    metricKey,
    chartWidth,
    chartHeight,
    activeBackbone,
    isMobile,
  );

  embed(chartElement, spec, { actions: { source: false, compiled: false, editor: false } })
    .catch((error) => {
      console.error("Failed to render line chart", error?.message ?? error);
      chartElement.textContent = "Failed to render line chart.";
    });
};

/* ── Highlight chart from table hover (re-renders with updated state) ── */
let _highlightRenderPending = false;
let _highlightRenderRows = null;

const scheduleHighlightRender = (rows) => {
  _highlightRenderRows = rows;
  if (_highlightRenderPending) return;
  _highlightRenderPending = true;
  requestAnimationFrame(() => {
    _highlightRenderPending = false;
    if (_highlightRenderRows) {
      renderLineChart(_highlightRenderRows, interactionState.currentMetric, interactionState.currentBackbone);
    }
  });
};

const highlightChartPoint = (strategy, datasetName, rows) => {
  const changed =
    interactionState.highlightedStrategy !== strategy ||
    interactionState.highlightedDataset !== datasetName;
  if (!changed) return;

  interactionState.highlightedStrategy = strategy;
  interactionState.highlightedDataset = datasetName;
  if (rows) scheduleHighlightRender(rows);
};

const highlightChartDataset = (datasetName, rows) => {
  highlightChartPoint(null, datasetName, rows);
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
const renderTable = (rows, onChartUpdate, chartRows) => {
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

    // Highlight corresponding point in chart (re-renders with greyed-out others)
    highlightChartPoint(strategy, datasetName, chartRows);
  };

  const cellMouseLeave = (e, cell) => {
    cell.getElement().classList.remove("cell-hover-highlight");
    highlightChartPoint(null, null, chartRows);
  };

  if (window.__tabulatorTable) {
    // Re-register cell hover handlers (old ones are detached on setColumns)
    window.__tabulatorTable.off("cellMouseEnter");
    window.__tabulatorTable.off("cellMouseLeave");
    window.__tabulatorTable.on("cellMouseEnter", cellMouseEnter);
    window.__tabulatorTable.on("cellMouseLeave", cellMouseLeave);

    window.__tabulatorTable.setColumns(columns);
    window.__tabulatorTable.replaceData(tableRows);
    // Re-apply styles after data update
    setTimeout(() => {
      applyDatasetHeaderStyles();
      applyMetricHeaderStyles();
      attachDatasetHeaderHoverHandlers(chartRows);
    }, 50);
    return;
  }

  tableElement.textContent = "";
  window.__tabulatorTable = new Tabulator(tableElement, {
    data: tableRows,
    layout: "fitDataTable",
    columns,
  });

  window.__tabulatorTable.on("cellMouseEnter", cellMouseEnter);
  window.__tabulatorTable.on("cellMouseLeave", cellMouseLeave);

  // Apply styles once table is built
  window.__tabulatorTable.on("tableBuilt", () => {
    applyDatasetHeaderStyles();
    applyMetricHeaderStyles();
    attachDatasetHeaderHoverHandlers(chartRows);
  });
};

/* ── Style helpers (applied after render) ──────────────────────────── */
const applyDatasetHeaderStyles = () => {
  // Column groups are not returned by getColumns() in Tabulator;
  // query the DOM directly for group header elements.
  const groupHeaders = document.querySelectorAll(".tabulator-col-group");
  groupHeaders.forEach((el) => {
    const titleEl = el.querySelector(":scope > .tabulator-col-content .tabulator-col-title");
    const rawTitle = titleEl?.textContent?.trim();
    if (!rawTitle) return;
    // Strip task suffix (e.g., "bloodmnist [classification]" → "bloodmnist")
    const datasetName = rawTitle.replace(/\s*\[.*\]$/, "");

    el.classList.add("dataset-col-group");
    if (interactionState.visibleDatasets.has(datasetName)) {
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

/* ── Attach hover handlers to dataset column group headers ─────────── */
const attachDatasetHeaderHoverHandlers = (chartRows) => {
  const groupHeaders = document.querySelectorAll(".tabulator-col-group");
  groupHeaders.forEach((el) => {
    // Avoid attaching duplicate listeners
    if (el._datasetHoverAttached) return;
    el._datasetHoverAttached = true;

    const titleEl = el.querySelector(":scope > .tabulator-col-content .tabulator-col-title");
    const rawTitle = titleEl?.textContent?.trim();
    if (!rawTitle) return;
    // Strip task suffix (e.g., "bloodmnist [classification]" → "bloodmnist")
    const datasetName = rawTitle.replace(/\s*\[.*\]$/, "");

    el.addEventListener("mouseenter", () => {
      if (!interactionState.visibleDatasets.has(datasetName)) return;
      highlightChartDataset(datasetName, chartRows);
    });

    el.addEventListener("mouseleave", () => {
      highlightChartDataset(null, chartRows);
    });
  });
};

/* ── Init ──────────────────────────────────────────────────────────── */
const init = async () => {
  const tableElement = document.querySelector("#data-table");
  if (tableElement) tableElement.textContent = "Loading data...";
  const resolvedUrl = DATA_URL.toString();

  try {
    const rawDataframe = await dfd.readCSV(resolvedUrl);

    // Filter out excluded backbones
    const backboneValues = rawDataframe["backbone"]?.values ?? [];
    const keepIndices = [];
    for (let i = 0; i < backboneValues.length; i += 1) {
      if (!EXCLUDED_BACKBONES.has(backboneValues[i])) {
        keepIndices.push(i);
      }
    }
    const dataframe = rawDataframe.iloc({ rows: keepIndices });

    METRICS.forEach(({ key }) => {
      if (dataframe.columns.includes(key)) {
        dataframe.addColumn(key, toNumberSeries(dataframe[key]), { inplace: true });
      }
    });

    // Fall back to test_auc_macro where test_auc is missing (e.g., chestmnist)
    // First, capture original test_auc values BEFORE the merge to detect which datasets needed the fallback
    const datasetAucMacroSet = new Set();
    if (dataframe.columns.includes("test_auc_macro")) {
      dataframe.addColumn("test_auc_macro", toNumberSeries(dataframe["test_auc_macro"]), { inplace: true });
      const aucValues = dataframe["test_auc"].values;
      const aucMacroValues = dataframe["test_auc_macro"].values;
      const dsValues = dataframe["dataset"].values;

      // Detect datasets where ALL test_auc values are NaN (before merge)
      const datasetHasAuc = new Set();
      for (let i = 0; i < dsValues.length; i += 1) {
        if (Number.isFinite(aucValues[i])) {
          datasetHasAuc.add(dsValues[i]);
        }
      }
      const allDs = new Set(dsValues);
      allDs.forEach((ds) => {
        if (!datasetHasAuc.has(ds)) datasetAucMacroSet.add(ds);
      });

      // Merge: where test_auc is NaN, use test_auc_macro
      const mergedAuc = aucValues.map((v, i) =>
        Number.isFinite(v) ? v : aucMacroValues[i]
      );
      dataframe.addColumn("test_auc", mergedAuc, { inplace: true });
    }
    interactionState.datasetAucMacroSet = datasetAucMacroSet;

    const backbones = Array.from(dataframe["backbone"].unique().values).sort();

    // Build fixed color map from ALL datasets so colors are stable
    const allDatasetNames = Array.from(dataframe["dataset"].unique().values).sort();
    interactionState.datasetColorMap = buildDatasetColorMap(allDatasetNames);

    // Build dataset-to-task mapping (task is a dataset-level attribute)
    const datasetTaskMap = new Map();
    const datasetValues = dataframe["dataset"]?.values ?? [];
    const taskValues = dataframe["task"]?.values ?? [];
    for (let i = 0; i < datasetValues.length; i += 1) {
      if (!datasetTaskMap.has(datasetValues[i]) && taskValues[i]) {
        datasetTaskMap.set(datasetValues[i], String(taskValues[i]));
      }
    }
    interactionState.datasetTaskMap = datasetTaskMap;

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
      renderTable(rows, onChartUpdate, rows);
      renderLineChart(rows, metric, interactionState.currentBackbone);
    };

    let resizeRenderPending = false;
    const scheduleResponsiveRender = () => {
      if (resizeRenderPending) return;
      resizeRenderPending = true;
      requestAnimationFrame(() => {
        resizeRenderPending = false;
        const rows = getRows(interactionState.currentBackbone);
        if (window.__tabulatorTable) {
          window.__tabulatorTable.redraw(true);
        }
        renderLineChart(rows, interactionState.currentMetric, interactionState.currentBackbone);
      });
    };

    const chartElement = document.querySelector("#heatmap-chart");
    if (chartElement && "ResizeObserver" in window) {
      const chartResizeObserver = new ResizeObserver(() => {
        scheduleResponsiveRender();
      });
      chartResizeObserver.observe(chartElement);
    }
    window.addEventListener("resize", scheduleResponsiveRender);

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
