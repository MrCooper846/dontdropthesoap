"use client";
import { useEffect, useRef, useState } from "react";
import type * as Blockly from "blockly/core";
import { registerBlocks, toolbox } from "../../shared/bots/blocks";
export const labels: Record<string, string> = {
  soap_program: "Strategy",
  soap_return: "Choose a move",
  soap_if: "If / otherwise",
  soap_set: "Remember a value",
  soap_init: "Declare memory",
  soap_number: "Number",
  soap_boolean: "Boolean",
  soap_move: "Move value",
  soap_none: "No earlier move",
  soap_observe: "Observation",
  soap_count: "Move count",
  soap_random: "Seeded random",
  soap_memory: "Read memory",
  soap_compare: "Compare",
  soap_arithmetic: "Add / subtract",
  soap_logic: "And / or",
  soap_not: "Not",
};
const inputLabels: Record<string, string> = {
  MEMORY: "Initial memory",
  DECISION: "Decision",
  CONDITION: "Condition",
  THEN: "When true",
  ELSE: "Otherwise",
  VALUE: "Value",
  LEFT: "Left value",
  RIGHT: "Right value",
  NEXT: "Next action",
};
const fieldLabels: Record<string, string> = {
  MOVE: "Choice",
  FACT: "Observation",
  OP: "Operator",
  WHO: "Count for",
  NAME: "Memory name",
  TYPE: "Memory type",
  VALUE: "Initial value",
  NUM: "Number",
  BOOL: "Boolean",
};
type Inspector = {
  blocks: { id: string; label: string }[];
  fields: {
    name: string;
    label: string;
    value: string;
    options?: { label: string; value: string }[];
  }[];
  inputs: { name: string; label: string; occupied: boolean }[];
  type: string;
};
export default function BlocklyEditor({
  initial,
  loadToken,
  onChange,
}: {
  initial: unknown;
  loadToken: number;
  onChange: (workspace: unknown) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    workspace = useRef<Blockly.WorkspaceSvg | null>(null),
    api = useRef<typeof Blockly | null>(null),
    initialRef = useRef(initial),
    change = useRef(onChange),
    selectedRef = useRef("");
  initialRef.current = initial;
  change.current = onChange;
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(""),
    [add, setAdd] = useState("soap_return"),
    [input, setInput] = useState(""),
    [inspector, setInspector] = useState<Inspector>({
      blocks: [],
      fields: [],
      inputs: [],
      type: "",
    });
  function inspect(id = selectedRef.current) {
    const w = workspace.current,
      B = api.current;
    if (!w || !B) return;
    const all = w.getAllBlocks(false),
      block = w.getBlockById(id) ?? all[0];
    selectedRef.current = block?.id ?? "";
    setSelected(selectedRef.current);
    const fields =
      block?.inputList
        .flatMap((i) => i.fieldRow)
        .filter((f) => !!f.name)
        .map((f) => ({
          name: f.name!,
          label: fieldLabels[f.name!] ?? f.name!,
          value: String(f.getValue()),
          ...(f instanceof B.FieldDropdown
            ? {
                options: f.getOptions(false).map((o) => ({
                  label: typeof o[0] === "string" ? o[0] : "Option",
                  value: o[1],
                })),
              }
            : {}),
        })) ?? [];
    const inputs =
      block?.inputList
        .filter((i) => i.connection)
        .map((i) => ({
          name: i.name,
          label: inputLabels[i.name] ?? i.name,
          occupied: !!i.connection?.targetConnection,
        })) ?? [];
    if (block?.nextConnection)
      inputs.push({
        name: "NEXT",
        label: "Next action",
        occupied: !!block.nextConnection.targetConnection,
      });
    setInspector({
      blocks: all.map((b, i) => ({
        id: b.id,
        label: i + 1 + " · " + (labels[b.type] ?? "Block"),
      })),
      fields,
      inputs,
      type: block?.type ?? "",
    });
    setInput((old) =>
      inputs.some((i) => i.name === old) ? old : (inputs[0]?.name ?? ""),
    );
  }
  useEffect(() => {
    let disposed = false,
      observer: ResizeObserver | undefined;
    Promise.all([import("blockly/core"), import("blockly/msg/en")])
      .then(([B, messages]) => {
        if (disposed || !container.current) return;
        B.setLocale(
          Object.fromEntries(
            Object.entries(messages).filter(([, v]) => typeof v === "string"),
          ) as Record<string, string>,
        );
        registerBlocks(B);
        api.current = B;
        const w = B.inject(container.current, {
          media: "/blockly/",
          toolbox,
          horizontalLayout: window.matchMedia("(max-width:760px)").matches,
          theme: B.Theme.defineTheme("soapBot", {
            name: "soapBot",
            base: B.Themes.Classic,
            componentStyles: {
              workspaceBackgroundColour: "#f4f5ee",
              toolboxBackgroundColour: "#25352b",
              toolboxForegroundColour: "#f6f1e8",
              flyoutBackgroundColour: "#e6eee3",
              flyoutForegroundColour: "#18271d",
              scrollbarColour: "#667561",
              scrollbarOpacity: 0.65,
            },
          }),
          trashcan: true,
          scrollbars: true,
          move: { scrollbars: true, drag: true, wheel: true },
          zoom: {
            controls: true,
            wheel: true,
            startScale: 0.85,
            maxScale: 1.5,
            minScale: 0.4,
          },
          renderer: "geras",
        });
        workspace.current = w;
        B.serialization.workspaces.load(
          initialRef.current as Record<string, unknown>,
          w,
        );
        const emit = () => {
          if (disposed) return;
          change.current(B.serialization.workspaces.save(w));
          inspect();
        };
        w.addChangeListener((e) => {
          if (disposed) return;
          if (e.type === B.Events.SELECTED) {
            const id = (e as Blockly.Events.Selected).newElementId;
            if (id) inspect(id);
          }
          if (!e.isUiEvent) emit();
        });
        observer = new ResizeObserver(() => {
          if (!disposed) B.svgResize(w);
        });
        observer.observe(container.current);
        setReady(true);
        emit();
        B.svgResize(w);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Editor could not load"),
      );
    return () => {
      disposed = true;
      observer?.disconnect();
      workspace.current?.dispose();
      workspace.current = null;
      api.current = null;
    };
  }, []);
  useEffect(() => {
    const B = api.current,
      w = workspace.current;
    if (!ready || !B || !w) return;
    B.Events.disable();
    try {
      B.serialization.workspaces.load(
        initialRef.current as Record<string, unknown>,
        w,
      );
      selectedRef.current = "";
      inspect();
      change.current(B.serialization.workspaces.save(w));
      w.zoomToFit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot load this workspace");
    } finally {
      B.Events.enable();
    }
  }, [loadToken, ready]);
  function attach() {
    const B = api.current,
      w = workspace.current,
      parent = w?.getBlockById(selectedRef.current);
    if (!B || !w || !parent) return;
    const connection =
      input === "NEXT"
        ? parent.nextConnection
        : parent.getInput(input)?.connection;
    if (!connection || connection.targetConnection) {
      setError(
        "Choose an empty connection, or remove its current block first.",
      );
      return;
    }
    const block = w.newBlock(add);
    block.initSvg();
    block.render();
    const own = block.outputConnection ?? block.previousConnection;
    if (!own) {
      block.dispose();
      return;
    }
    try {
      connection.connect(own);
      if (!own.targetConnection)
        throw new Error("That block does not fit this connection.");
      setError("");
      inspect(block.id);
      w.zoomToFit();
      change.current(B.serialization.workspaces.save(w));
    } catch (e) {
      block.dispose();
      setError(e instanceof Error ? e.message : "Blocks do not fit");
    }
  }
  return (
    <div className="bot-editor">
      <div
        ref={container}
        className="bot-blocks"
        role="application"
        aria-label="Visual strategy blocks"
        data-testid="visual-workspace"
      />
      <section
        className="panel stack bot-inspector"
        aria-label="Block controls"
      >
        <h3>Edit blocks</h3>
        <p className="muted">
          Drag blocks from the toolbox, or connect them with these controls.
        </p>
        {!ready && <p role="status">Loading blocks…</p>}
        <label className="label">
          Block to edit
          <select
            className="input"
            aria-label="Block to edit"
            value={selected}
            onChange={(e) => inspect(e.target.value)}
          >
            {inspector.blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        {inspector.fields.map((f) => (
          <label className="label" key={selected + f.name}>
            {f.label}
            {f.options ? (
              <select
                className="input"
                aria-label={f.label}
                value={f.value}
                onChange={(e) => {
                  workspace.current
                    ?.getBlockById(selected)
                    ?.setFieldValue(e.target.value, f.name);
                  inspect();
                }}
              >
                {f.options.map((o) => (
                  <option value={o.value} key={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                aria-label={f.label}
                value={f.value}
                onChange={(e) => {
                  workspace.current
                    ?.getBlockById(selected)
                    ?.setFieldValue(e.target.value, f.name);
                  inspect();
                }}
              />
            )}
          </label>
        ))}
        <label className="label">
          New block
          <select
            className="input"
            aria-label="New block"
            value={add}
            onChange={(e) => setAdd(e.target.value)}
          >
            {Object.entries(labels)
              .filter(([key]) => key !== "soap_program")
              .map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
          </select>
        </label>
        <label className="label">
          Attach at
          <select
            className="input"
            aria-label="Attach at"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          >
            {inspector.inputs.map((i) => (
              <option key={i.name} value={i.name} disabled={i.occupied}>
                {i.label}
                {i.occupied ? " · occupied" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button"
          disabled={
            !input || inspector.inputs.find((i) => i.name === input)?.occupied
          }
          onClick={attach}
        >
          Add and connect block
        </button>
        <button
          className="button small"
          disabled={!selected || inspector.type === "soap_program"}
          onClick={() => {
            workspace.current?.getBlockById(selected)?.dispose(true);
            selectedRef.current = "";
            inspect();
          }}
        >
          Remove selected block
        </button>
        <button
          className="button small"
          onClick={() => workspace.current?.zoomToFit()}
        >
          Fit blocks on screen
        </button>
        {error && (
          <p role="alert" className="danger">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
