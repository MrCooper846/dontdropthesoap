"use client";
import { useEffect, useRef, useState } from "react";
export default function FoundationSpike() {
  const yard = useRef<HTMLDivElement>(null),
    editor = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Loading");
  const [blocks, setBlocks] = useState(0);
  useEffect(() => {
    let stopped = false;
    let destroyGame: (() => void) | undefined;
    let disposeEditor: (() => void) | undefined;
    Promise.all([
      import("phaser"),
      import("blockly/core"),
      import("blockly/blocks"),
      import("blockly/msg/en"),
    ])
      .then(([P, B, , messages]) => {
        if (stopped || !yard.current || !editor.current) return;
        B.setLocale(
          Object.fromEntries(
            Object.entries(messages).filter(([, v]) => typeof v === "string"),
          ) as Record<string, string>,
        );
        const game = new P.default.Game({
          type: P.default.CANVAS,
          parent: yard.current,
          width: 320,
          height: 240,
          backgroundColor: "#253d31",
          scene: {
            create() {
              const scene = this as unknown as Phaser.Scene;
              scene.add.circle(160, 120, 28, 0xf5b845);
              scene.add.text(75, 170, "Yard renderer mounted");
            },
          },
        });
        destroyGame = () => game.destroy(true);
        const workspace = B.inject(editor.current, {
          toolbox: {
            kind: "flyoutToolbox",
            contents: [
              { kind: "block", type: "controls_if" },
              { kind: "block", type: "logic_compare" },
              { kind: "block", type: "logic_boolean" },
            ],
          },
          scrollbars: true,
          move: { scrollbars: true, drag: true, wheel: true },
          zoom: { controls: true, wheel: true },
        });
        workspace.addChangeListener(() =>
          setBlocks(workspace.getAllBlocks(false).length),
        );
        disposeEditor = () => workspace.dispose();
        setStatus("Renderer and editor mounted");
      })
      .catch((e) => {
        console.error("Foundation mount failed", e);
        setStatus("Renderer/editor failed to mount: " + String(e));
      });
    return () => {
      stopped = true;
      disposeEditor?.();
      destroyGame?.();
    };
  }, []);
  return (
    <section className="stack">
      <p role="status" aria-label="Prototype status">
        {status}
      </p>
      <p data-testid="block-count">Blocks in workspace: {blocks}</p>
      <div data-testid="yard-spike" ref={yard} />
      <div
        data-testid="editor-spike"
        ref={editor}
        style={{ height: 360, width: "100%" }}
      />
    </section>
  );
}
