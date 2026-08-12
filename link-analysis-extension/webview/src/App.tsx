import { useEffect, useState } from "react";
import CytoscapeGraph from "./graph/CytoscapeGraph";

type EntityType = "person" | "org" | "place" | "asset";

interface Entity {
  id: string;
  name: string;
  type: EntityType;
  filePath: string;
  line: number;
}

interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  filePath: string;
  line: number;
}

interface EventRecord {
  id: string;
  date: string;
  label: string;
  participants: string[];
  location?: string;
  filePath: string;
  line: number;
}

interface GraphModel {
  entities: Entity[];
  relationships: Relationship[];
  events: EventRecord[];
}

type SelectedState =
  | { kind: "entity"; entity: Entity }
  | { kind: "relationship"; relationship: Relationship }
  | undefined;

type IncomingMessage =
  | { type: "graph:update"; payload: GraphModel }
  | { type: "graph:focus"; payload: { kind: "entity" | "relationship" | "event"; id: string } };

declare global {
  interface Window {
    acquireVsCodeApi: () => { postMessage: (message: unknown) => void };
  }
}

const vscode = window.acquireVsCodeApi();

const EMPTY_GRAPH: GraphModel = {
  entities: [],
  relationships: [],
  events: []
};

export default function App(): JSX.Element {
  const [graph, setGraph] = useState<GraphModel>(EMPTY_GRAPH);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectedState>();
  const [focusTarget, setFocusTarget] = useState<
    { kind: "entity" | "relationship" | "event"; id: string } | undefined
  >();

  useEffect(() => {
    const listener = (event: MessageEvent<IncomingMessage>) => {
      if (event.data.type === "graph:update") {
        setGraph(event.data.payload);

        setSelected((current) => {
          if (!current) {
            return current;
          }

          if (current.kind === "entity") {
            const next = event.data.payload.entities.find((entity) => entity.id === current.entity.id);
            return next ? { kind: "entity", entity: next } : undefined;
          }

          const next = event.data.payload.relationships.find(
            (relationship) => relationship.id === current.relationship.id
          );
          return next ? { kind: "relationship", relationship: next } : undefined;
        });
      }

      if (event.data.type === "graph:focus") {
        setFocusTarget(event.data.payload);
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  const entityById = new Map(graph.entities.map((entity) => [entity.id, entity]));
  const selectedEntityRelationships =
    selected?.kind === "entity"
      ? graph.relationships.filter(
          (relationship) =>
            relationship.sourceId === selected.entity.id || relationship.targetId === selected.entity.id
        )
      : [];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="eyebrow">Link Analysis</div>
          <h1>Graph Explorer</h1>
          <p className="muted">Structured notes stay canonical. The graph is a live projection.</p>
        </div>
        <label className="search-block">
          <span>Search entities</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="John Smith"
          />
        </label>
        <section className="inspector">
          <h2>Inspector</h2>
          {!selected && <p className="muted">Select a node or edge to inspect its source and context.</p>}
          {selected?.kind === "entity" && (
            <div className="details">
              <div className="pill">{selected.entity.type}</div>
              <h3>{selected.entity.name}</h3>
              <p className="meta">
                {selected.entity.filePath}:{selected.entity.line}
              </p>
              <div className="relationships-list">
                {selectedEntityRelationships.map((relationship) => {
                  const source = entityById.get(relationship.sourceId)?.name ?? relationship.sourceId;
                  const target = entityById.get(relationship.targetId)?.name ?? relationship.targetId;
                  return (
                    <button
                      key={relationship.id}
                      className="list-button"
                      onClick={() => {
                        setSelected({ kind: "relationship", relationship });
                        vscode.postMessage({ type: "edge:selected", payload: { id: relationship.id } });
                      }}
                    >
                      {source} {"->"} {target} : {relationship.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {selected?.kind === "relationship" && (
            <div className="details">
              <div className="pill">relationship</div>
              <h3>{selected.relationship.label}</h3>
              <p className="meta">
                {(entityById.get(selected.relationship.sourceId)?.name ?? selected.relationship.sourceId) +
                  " -> " +
                  (entityById.get(selected.relationship.targetId)?.name ?? selected.relationship.targetId)}
              </p>
              <p className="meta">
                {selected.relationship.filePath}:{selected.relationship.line}
              </p>
            </div>
          )}
        </section>
      </aside>
      <main className="graph-stage">
        <CytoscapeGraph
          graph={graph}
          search={search}
          focusTarget={focusTarget}
          onSelectEntity={(entity) => {
            setSelected({ kind: "entity", entity });
            vscode.postMessage({ type: "node:selected", payload: { id: entity.id } });
          }}
          onSelectRelationship={(relationship) => {
            setSelected({ kind: "relationship", relationship });
            vscode.postMessage({ type: "edge:selected", payload: { id: relationship.id } });
          }}
        />
      </main>
    </div>
  );
}
