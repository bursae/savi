import * as fs from "fs/promises";
import * as path from "path";
import { Entity, EventRecord, GraphModel, Relationship } from "../models/types";

interface ChartNode {
  id: string;
  label: string;
  type: Entity["type"] | "event";
  subtitle?: string;
  focus?: boolean;
}

interface ChartEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

interface ChartData {
  title: string;
  focusName?: string;
  nodes: ChartNode[];
  edges: ChartEdge[];
}

export interface ChartOptions {
  focusName?: string;
  depth: number;
  outputPath: string;
}

export async function exportChart(caseDir: string, graph: GraphModel, options: ChartOptions): Promise<string> {
  const chartData = buildChartData(graph, options.focusName, options.depth);
  const resolvedOutputPath = path.resolve(caseDir, options.outputPath);
  await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await fs.writeFile(resolvedOutputPath, renderChartHtml(chartData), "utf8");
  return resolvedOutputPath;
}

function buildChartData(graph: GraphModel, focusName: string | undefined, depth: number): ChartData {
  const entityByName = new Map(graph.entities.map((entity) => [entity.name, entity]));
  const eventNodes = graph.events.map(eventToNode);
  const eventEdges = graph.events.flatMap((event) => eventToEdges(event, entityByName));
  const baseNodes: ChartNode[] = [
    ...graph.entities.map((entity) => ({
      id: entity.id,
      label: entity.name,
      type: entity.type,
      subtitle: entity.type
    })),
    ...eventNodes
  ];
  const baseEdges: ChartEdge[] = [
    ...graph.relationships.map((relationship) => ({
      id: relationship.id,
      source: relationship.sourceId,
      target: relationship.targetId,
      label: relationship.label
    })),
    ...eventEdges
  ];

  if (!focusName) {
    return {
      title: "Savi Case Chart",
      nodes: baseNodes,
      edges: baseEdges
    };
  }

  const focusEntity = graph.entities.find((entity) => entity.name.toLowerCase() === focusName.toLowerCase());
  if (!focusEntity) {
    throw new Error(`No entity found named "${focusName}".`);
  }

  const includedIds = collectNeighborhoodIds(focusEntity.id, baseEdges, Math.max(depth, 1));
  const nodes = baseNodes
    .filter((node) => includedIds.has(node.id))
    .map((node) => ({ ...node, focus: node.id === focusEntity.id }));
  const edges = baseEdges.filter((edge) => includedIds.has(edge.source) && includedIds.has(edge.target));

  return {
    title: `${focusEntity.name} - Savi Chart`,
    focusName: focusEntity.name,
    nodes,
    edges
  };
}

function collectNeighborhoodIds(focusId: string, edges: ChartEdge[], depth: number): Set<string> {
  const included = new Set<string>([focusId]);
  let frontier = new Set<string>([focusId]);

  for (let step = 0; step < depth; step += 1) {
    const next = new Set<string>();
    for (const edge of edges) {
      if (frontier.has(edge.source) && !included.has(edge.target)) {
        next.add(edge.target);
      }
      if (frontier.has(edge.target) && !included.has(edge.source)) {
        next.add(edge.source);
      }
    }
    next.forEach((id) => included.add(id));
    frontier = next;
  }

  return included;
}

function eventToNode(event: EventRecord): ChartNode {
  return {
    id: `event_node_${event.id}`,
    label: event.label,
    type: "event",
    subtitle: event.date
  };
}

function eventToEdges(event: EventRecord, entityByName: Map<string, Entity>): ChartEdge[] {
  const eventNodeId = `event_node_${event.id}`;
  const participantEdges = event.participants.flatMap((participant) => {
    const entity = entityByName.get(participant);
    if (!entity) {
      return [];
    }
    return [
      {
        id: `${event.id}_${entity.id}`,
        source: entity.id,
        target: eventNodeId,
        label: "participated in"
      }
    ];
  });

  const location = event.location ? entityByName.get(event.location) : undefined;
  if (!location) {
    return participantEdges;
  }

  return [
    ...participantEdges,
    {
      id: `${event.id}_${location.id}`,
      source: eventNodeId,
      target: location.id,
      label: "at"
    }
  ];
}

function renderChartHtml(data: ChartData): string {
  const encodedData = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(data.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f5ef;
      --ink: #1d2528;
      --muted: #667075;
      --line: #b8c0bd;
      --panel: #ffffff;
      --person: #c85f3e;
      --org: #2f6f89;
      --place: #4d7d62;
      --asset: #7a5a9a;
      --event: #c7a135;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font: 14px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow: hidden;
    }
    header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 18px;
      background: rgba(247, 245, 239, 0.92);
      border-bottom: 1px solid #ded9cd;
      backdrop-filter: blur(12px);
    }
    h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .meta {
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }
    .legend {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .legend span {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--muted);
      font-size: 12px;
    }
    .swatch {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: var(--color);
    }
    svg {
      width: 100vw;
      height: 100vh;
      display: block;
      cursor: grab;
    }
    svg:active { cursor: grabbing; }
    .edge {
      stroke: var(--line);
      stroke-width: 1.7;
      marker-end: url(#arrow);
      opacity: 0.82;
    }
    .edge-label {
      fill: #556064;
      font-size: 11px;
      paint-order: stroke;
      stroke: var(--bg);
      stroke-width: 4px;
      stroke-linecap: round;
      stroke-linejoin: round;
      pointer-events: none;
    }
    .node circle,
    .node rect,
    .node path {
      fill: var(--node-color);
      stroke: #ffffff;
      stroke-width: 2;
      filter: drop-shadow(0 4px 8px rgba(32, 38, 40, 0.18));
    }
    .node.focus circle,
    .node.focus rect,
    .node.focus path {
      stroke: #111;
      stroke-width: 4;
    }
    .node text {
      text-anchor: middle;
      pointer-events: none;
    }
    .node .label {
      fill: #161d20;
      font-weight: 700;
      font-size: 12px;
      paint-order: stroke;
      stroke: var(--bg);
      stroke-width: 5px;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .node .subtitle {
      fill: var(--muted);
      font-size: 10px;
      paint-order: stroke;
      stroke: var(--bg);
      stroke-width: 4px;
    }
    .tooltip {
      position: fixed;
      z-index: 10;
      max-width: 320px;
      padding: 10px 12px;
      border: 1px solid #d8d3c8;
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 10px 30px rgba(31, 38, 41, 0.18);
      pointer-events: none;
      opacity: 0;
      transform: translate(8px, 8px);
    }
    .tooltip strong {
      display: block;
      margin-bottom: 2px;
      font-size: 13px;
    }
    .tooltip span {
      color: var(--muted);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(data.title)}</h1>
      <div class="meta">${data.nodes.length} nodes · ${data.edges.length} links${data.focusName ? ` · focused on ${escapeHtml(data.focusName)}` : ""}</div>
    </div>
    <div class="legend">
      <span><i class="swatch" style="--color: var(--person)"></i>Person</span>
      <span><i class="swatch" style="--color: var(--org)"></i>Org</span>
      <span><i class="swatch" style="--color: var(--asset)"></i>Asset</span>
      <span><i class="swatch" style="--color: var(--place)"></i>Place</span>
      <span><i class="swatch" style="--color: var(--event)"></i>Event</span>
    </div>
  </header>
  <svg id="chart" role="img" aria-label="Savi network chart"></svg>
  <div class="tooltip" id="tooltip"></div>
  <script>
    const chartData = ${encodedData};
    const typeColor = {
      person: "var(--person)",
      org: "var(--org)",
      place: "var(--place)",
      asset: "var(--asset)",
      event: "var(--event)"
    };
    const svg = document.getElementById("chart");
    const tooltip = document.getElementById("tooltip");
    const width = window.innerWidth;
    const height = window.innerHeight;
    const centerX = width / 2;
    const centerY = height / 2 + 28;
    const nodes = chartData.nodes.map((node, index) => {
      const angle = (index / Math.max(chartData.nodes.length, 1)) * Math.PI * 2;
      const radius = node.focus ? 0 : Math.min(width, height) * (0.2 + (index % 4) * 0.035);
      return {
        ...node,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        vx: 0,
        vy: 0
      };
    });
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const edges = chartData.edges
      .map((edge) => ({ ...edge, sourceNode: nodeById.get(edge.source), targetNode: nodeById.get(edge.target) }))
      .filter((edge) => edge.sourceNode && edge.targetNode);

    const defs = make("defs");
    defs.innerHTML = '<marker id="arrow" viewBox="0 0 10 10" refX="17" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9aa4a1"></path></marker>';
    svg.appendChild(defs);
    const viewport = make("g");
    svg.appendChild(viewport);
    const edgeLayer = make("g");
    const labelLayer = make("g");
    const nodeLayer = make("g");
    viewport.append(edgeLayer, labelLayer, nodeLayer);

    for (const edge of edges) {
      edge.el = make("line", "edge");
      edge.labelEl = make("text", "edge-label");
      edge.labelEl.textContent = edge.label;
      edgeLayer.appendChild(edge.el);
      labelLayer.appendChild(edge.labelEl);
    }

    for (const node of nodes) {
      const group = make("g", "node" + (node.focus ? " focus" : ""));
      group.style.setProperty("--node-color", typeColor[node.type]);
      group.dataset.id = node.id;
      group.dataset.label = node.label;
      group.dataset.subtitle = node.subtitle || node.type;
      group.appendChild(shapeFor(node));
      const label = make("text", "label");
      label.setAttribute("y", "34");
      label.textContent = shortLabel(node.label);
      const subtitle = make("text", "subtitle");
      subtitle.setAttribute("y", "48");
      subtitle.textContent = node.subtitle || node.type;
      group.append(label, subtitle);
      group.addEventListener("pointerenter", showTooltip);
      group.addEventListener("pointermove", moveTooltip);
      group.addEventListener("pointerleave", hideTooltip);
      node.el = group;
      nodeLayer.appendChild(group);
    }

    for (let i = 0; i < 380; i += 1) {
      tick();
    }
    render();

    let pan = { x: 0, y: 0 };
    let scale = 1;
    let dragStart = null;
    svg.addEventListener("pointerdown", (event) => {
      dragStart = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener("pointermove", (event) => {
      if (!dragStart) return;
      pan = {
        x: dragStart.panX + event.clientX - dragStart.x,
        y: dragStart.panY + event.clientY - dragStart.y
      };
      updateViewport();
    });
    svg.addEventListener("pointerup", () => { dragStart = null; });
    svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      const nextScale = Math.max(0.35, Math.min(2.4, scale * (event.deltaY > 0 ? 0.92 : 1.08)));
      scale = nextScale;
      updateViewport();
    }, { passive: false });

    function tick() {
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x || 0.01;
          const dy = b.y - a.y || 0.01;
          const distSq = dx * dx + dy * dy;
          const force = Math.min(900 / distSq, 0.9);
          a.vx -= dx * force;
          a.vy -= dy * force;
          b.vx += dx * force;
          b.vy += dy * force;
        }
      }
      for (const edge of edges) {
        const a = edge.sourceNode;
        const b = edge.targetNode;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = edge.label.includes("contributed") ? 150 : 125;
        const force = (dist - target) * 0.018;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
      for (const node of nodes) {
        const pull = node.focus ? 0.08 : 0.012;
        node.vx += (centerX - node.x) * pull;
        node.vy += (centerY - node.y) * pull;
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.72;
        node.vy *= 0.72;
      }
    }

    function render() {
      for (const edge of edges) {
        edge.el.setAttribute("x1", edge.sourceNode.x);
        edge.el.setAttribute("y1", edge.sourceNode.y);
        edge.el.setAttribute("x2", edge.targetNode.x);
        edge.el.setAttribute("y2", edge.targetNode.y);
        edge.labelEl.setAttribute("x", (edge.sourceNode.x + edge.targetNode.x) / 2);
        edge.labelEl.setAttribute("y", (edge.sourceNode.y + edge.targetNode.y) / 2 - 4);
      }
      for (const node of nodes) {
        node.el.setAttribute("transform", "translate(" + node.x + " " + node.y + ")");
      }
      updateViewport();
    }

    function updateViewport() {
      viewport.setAttribute("transform", "translate(" + pan.x + " " + pan.y + ") scale(" + scale + ")");
    }

    function shapeFor(node) {
      if (node.type === "org") {
        const rect = make("rect");
        rect.setAttribute("x", "-23");
        rect.setAttribute("y", "-18");
        rect.setAttribute("width", "46");
        rect.setAttribute("height", "36");
        rect.setAttribute("rx", "7");
        return rect;
      }
      if (node.type === "asset") {
        const path = make("path");
        path.setAttribute("d", "M-16 -22 H11 L21 -12 V22 H-16 Z M11 -22 V-12 H21");
        return path;
      }
      if (node.type === "place") {
        const path = make("path");
        path.setAttribute("d", "M0 -25 C13 -25 22 -15 22 -3 C22 13 0 27 0 27 C0 27 -22 13 -22 -3 C-22 -15 -13 -25 0 -25 Z");
        return path;
      }
      if (node.type === "event") {
        const rect = make("rect");
        rect.setAttribute("x", "-20");
        rect.setAttribute("y", "-20");
        rect.setAttribute("width", "40");
        rect.setAttribute("height", "40");
        rect.setAttribute("rx", "20");
        return rect;
      }
      const circle = make("circle");
      circle.setAttribute("r", node.focus ? "28" : "22");
      return circle;
    }

    function shortLabel(label) {
      return label.length > 28 ? label.slice(0, 25) + "..." : label;
    }

    function showTooltip(event) {
      tooltip.innerHTML = "<strong>" + escapeHtml(event.currentTarget.dataset.label) + "</strong><span>" + escapeHtml(event.currentTarget.dataset.subtitle) + "</span>";
      tooltip.style.opacity = "1";
      moveTooltip(event);
    }

    function moveTooltip(event) {
      tooltip.style.left = event.clientX + "px";
      tooltip.style.top = event.clientY + "px";
    }

    function hideTooltip() {
      tooltip.style.opacity = "0";
    }

    function make(tag, className) {
      const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
      if (className) element.setAttribute("class", className);
      return element;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);
    }
  </script>
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}
