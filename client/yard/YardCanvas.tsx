"use client";
import { useEffect, useRef, useState } from "react";
import type { YardView } from "../../shared/yard/types";
import {
  YARD_MAP,
  movePoint,
  distance,
  type Point,
} from "../../shared/yard/map";
type Motion = { seq: number; axisX: number; axisY: number };
type Props = {
  view: YardView;
  ownerId: string;
  controlEpoch: number;
  enabled: boolean;
  onInput: (m: Motion) => void;
  onInspect: (id: string) => void;
};
export default function YardCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(props),
    joystick = useRef({ x: 0, y: 0 }),
    keys = useRef(new Set<string>()),
    sequence = useRef(0),
    pending = useRef<Motion[]>([]);
  latest.current = props;
  const [ready, setReady] = useState(false),
    [failure, setFailure] = useState(""),
    [stick, setStick] = useState({ x: 0, y: 0 }),
    origin = useRef<Point | null>(null);
  useEffect(() => {
    sequence.current = 0;
    pending.current = [];
    keys.current.clear();
    joystick.current = { x: 0, y: 0 };
  }, [props.controlEpoch]);
  useEffect(() => {
    let cancelled = false,
      game: Phaser.Game | undefined,
      observer: ResizeObserver | undefined;
    const holders = new Map<string, Phaser.GameObjects.Container>();
    const labels = new Map<string, Phaser.GameObjects.Text>();
    let predicted: Point = { ...YARD_MAP.spawn },
      lastTick = -1,
      lastEpoch = "",
      lastView: YardView | null = null,
      previous: YardView | null = null;
    function input() {
      if (!latest.current.enabled) return { axisX: 0, axisY: 0 };
      const focused = document.activeElement;
      if (focused?.matches("input,textarea,select,[contenteditable=true]"))
        return { axisX: 0, axisY: 0 };
      if (joystick.current.x || joystick.current.y)
        return { axisX: joystick.current.x, axisY: joystick.current.y };
      return {
        axisX:
          Number(keys.current.has("d") || keys.current.has("arrowright")) -
          Number(keys.current.has("a") || keys.current.has("arrowleft")),
        axisY:
          Number(keys.current.has("s") || keys.current.has("arrowdown")) -
          Number(keys.current.has("w") || keys.current.has("arrowup")),
      };
    }
    const stop = () => {
      keys.current.clear();
      joystick.current = { x: 0, y: 0 };
      setStick({ x: 0, y: 0 });
    };
    const down = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.matches("input,textarea,select,[contenteditable=true]")
      )
        return;
      const key = e.key.toLowerCase();
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowleft",
          "arrowdown",
          "arrowright",
        ].includes(key)
      ) {
        e.preventDefault();
        keys.current.add(key);
      }
      if (key === "e") {
        const view = latest.current.view,
          me = view.players.find((p) => p.ownerId === latest.current.ownerId);
        if (me) {
          const c = [...view.circles].sort(
            (a, b) => distance(me, a) - distance(me, b),
          )[0];
          if (c) latest.current.onInspect(c.id);
        }
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", stop);
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", visibility);
    const timer = setInterval(() => {
      if (!latest.current.enabled) return;
      const own = latest.current.view.players.find(
        (p) => p.ownerId === latest.current.ownerId,
      );
      const axes = own?.seated ? { axisX: 0, axisY: 0 } : input(),
        motion = { seq: sequence.current++, ...axes };
      pending.current.push(motion);
      if (pending.current.length > 100) pending.current.shift();
      latest.current.onInput(motion);
    }, 50);
    void import("phaser")
      .then((P) => {
        if (cancelled || !host.current) return;
        const Phaser = P.default;
        class Scene extends Phaser.Scene {
          create() {
            this.cameras.main.setBounds(0, 0, YARD_MAP.width, YARD_MAP.height);
            this.add.rectangle(480, 320, 960, 640, 0x182821);
            this.add
              .rectangle(480, 320, 864, 544, 0x738d68)
              .setStrokeStyle(12, 0x394739);
            const floor = this.add.graphics();
            floor.lineStyle(1, 0x91a080, 0.35);
            for (let x = 64; x < 912; x += 32) floor.lineBetween(x, 48, x, 592);
            for (let y = 64; y < 592; y += 32) floor.lineBetween(48, y, 912, y);
            for (let x = 52; x <= 908; x += 24) {
              this.add.rectangle(x, 26, 5, 35, 0x30423f);
              this.add.rectangle(x, 613, 5, 35, 0x30423f);
            }
            this.add.rectangle(480, 27, 920, 4, 0xc0cec0);
            this.add.rectangle(480, 612, 920, 4, 0xc0cec0);
            this.add
              .text(480, 68, "COMMISSARY COURTYARD", {
                fontFamily: "Arial",
                fontSize: "20px",
                fontStyle: "bold",
                color: "#f2e2b5",
                stroke: "#263b32",
                strokeThickness: 4,
              })
              .setOrigin(0.5);
            for (const o of YARD_MAP.obstacles) {
              this.add.rectangle(
                o.x + o.width / 2 + 5,
                o.y + o.height / 2 + 8,
                o.width,
                o.height,
                0x24342a,
                0.3,
              );
              this.add
                .rectangle(
                  o.x + o.width / 2,
                  o.y + o.height / 2,
                  o.width,
                  o.height,
                  0x9d7854,
                )
                .setStrokeStyle(4, 0x4a3b2c);
            }
            this.add
              .text(480, 310, "NOODLE\nACCOUNTING", {
                fontFamily: "Arial",
                fontSize: "15px",
                fontStyle: "bold",
                color: "#f7e6b1",
                align: "center",
              })
              .setOrigin(0.5);
            for (const c of YARD_MAP.circles) {
              const color = c.mode === "human" ? 0xf2d47a : 0x73d4cb;
              this.add
                .circle(c.x, c.y, c.radius, color, 0.12)
                .setStrokeStyle(3, color)
                .setInteractive()
                .on("pointerdown", () => latest.current.onInspect(c.id));
              for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                this.add.circle(
                  c.x + Math.cos(a) * 76,
                  c.y + Math.sin(a) * 76,
                  5,
                  0xd8cc9b,
                  0.7,
                );
              }
              const label = this.add
                .text(c.x, c.y - 18, c.name, {
                  fontFamily: "Arial",
                  fontSize: "15px",
                  fontStyle: "bold",
                  color: "#fff9e5",
                  stroke: "#26332d",
                  strokeThickness: 3,
                  align: "center",
                })
                .setOrigin(0.5);
              labels.set(c.id, label);
            }
            this.add
              .text(480, 556, "ENTER · STAY SUSPICIOUS", {
                fontFamily: "Arial",
                fontSize: "13px",
                color: "#f7efc8",
                stroke: "#324333",
                strokeThickness: 3,
              })
              .setOrigin(0.5);
            game!.canvas.setAttribute("aria-label", "Cartoon prison yard");
            game!.canvas.setAttribute("role", "img");
            setReady(true);
          }
          avatar(name: string, color: number) {
            const g = this.add.graphics();
            g.fillStyle(0x17221e, 0.4);
            g.fillEllipse(0, 3, 34, 12);
            g.fillStyle(0x253334);
            g.fillRoundedRect(-12, -14, 10, 17, 3);
            g.fillRoundedRect(3, -14, 10, 17, 3);
            g.fillStyle(color);
            g.fillRoundedRect(-17, -37, 34, 28, 8);
            g.fillStyle(0xf1e9d3);
            for (let y = -34; y < -10; y += 8) g.fillRect(-16, y, 32, 3);
            g.fillStyle(0xe9b98f);
            g.fillCircle(0, -42, 13);
            g.fillStyle(0x3c342c);
            g.fillRoundedRect(-13, -55, 26, 8, 4);
            g.fillStyle(0x222d26);
            g.fillCircle(-4, -43, 2);
            g.fillCircle(4, -43, 2);
            g.lineStyle(2, 0x995f46);
            g.lineBetween(-3, -36, 4, -36);
            const label = this.add
              .text(0, -74, name, {
                fontFamily: "Arial",
                fontSize: "12px",
                color: "#fff8df",
                stroke: "#25352b",
                strokeThickness: 3,
              })
              .setOrigin(0.5);
            return this.add.container(0, 0, [g, label]);
          }
          update(_time: number, delta: number) {
            if (cancelled || !host.current) return;
            const view = latest.current.view,
              owner = latest.current.ownerId;
            if (view.tick !== lastTick || view.epoch !== lastEpoch) {
              previous = lastEpoch === view.epoch ? lastView : null;
              lastView = view;
              lastTick = view.tick;
              lastEpoch = view.epoch;
              const own = view.players.find((p) => p.ownerId === owner);
              if (own) {
                pending.current = pending.current.filter(
                  (m) => m.seq > own.processedSeq,
                );
                let corrected = { x: own.x, y: own.y };
                if (!own.seated)
                  for (const m of pending.current)
                    corrected = movePoint(corrected, m.axisX, m.axisY, 50);
                if (distance(predicted, corrected) > 64 || own.seated)
                  predicted = corrected;
                else
                  predicted = {
                    x: predicted.x + (corrected.x - predicted.x) * 0.55,
                    y: predicted.y + (corrected.y - predicted.y) * 0.55,
                  };
              }
            }
            const own = view.players.find((p) => p.ownerId === owner),
              axes = input();
            if (own && !own.seated && latest.current.enabled)
              predicted = movePoint(predicted, axes.axisX, axes.axisY, delta);
            for (const p of view.players) {
              let holder = holders.get(p.ownerId);
              if (!holder) {
                let hash = 0;
                for (const c of p.ownerId)
                  hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
                holder = this.avatar(
                  p.name,
                  [0xe1a55a, 0xa797c7, 0x72b8ae, 0xd67970][hash % 4],
                );
                holders.set(p.ownerId, holder);
              }
              let point: Point = p;
              if (p.ownerId === owner) point = predicted;
              else if (previous && lastView) {
                const old = previous.players.find(
                  (v) => v.ownerId === p.ownerId,
                );
                if (old) {
                  const target = Date.now() - 100,
                    ratio = Math.max(
                      0,
                      Math.min(
                        1,
                        (target - previous.serverTime) /
                          Math.max(
                            1,
                            lastView.serverTime - previous.serverTime,
                          ),
                      ),
                    );
                  point = {
                    x: old.x + (p.x - old.x) * ratio,
                    y: old.y + (p.y - old.y) * ratio,
                  };
                }
              }
              holder
                .setPosition(point.x, point.y)
                .setDepth(point.y + 100)
                .setAlpha(p.connected === false ? 0.5 : 1);
            }
            for (const [id, h] of holders)
              if (!view.players.some((p) => p.ownerId === id)) {
                h.destroy();
                holders.delete(id);
              }
            for (const c of view.circles)
              labels
                .get(c.id)
                ?.setText(
                  c.name +
                    "\n" +
                    c.seatCount +
                    "/" +
                    c.settings.maxSeats +
                    " · " +
                    c.mode +
                    "\n" +
                    c.phase,
                );
            const local = holders.get(owner);
            if (local) {
              this.cameras.main.setZoom(
                host.current!.clientWidth < 600 ? 0.85 : 1,
              );
              this.cameras.main.centerOn(local.x, local.y);
            }
          }
        }
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: host.current,
          width: host.current.clientWidth,
          height: host.current.clientHeight,
          backgroundColor: "#17271f",
          scene: Scene,
          render: { antialias: true },
          scale: { mode: Phaser.Scale.RESIZE },
          audio: { noAudio: true },
        });
        observer = new ResizeObserver(() => {
          if (!cancelled && host.current && game)
            game.scale.resize(
              host.current.clientWidth,
              host.current.clientHeight,
            );
        });
        observer.observe(host.current);
      })
      .catch(() =>
        setFailure(
          "The yard renderer could not start. Nearby-circle controls still work.",
        ),
      );
    return () => {
      cancelled = true;
      clearInterval(timer);
      observer?.disconnect();
      game?.destroy(true);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [props.ownerId]);
  function stickMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!origin.current) return;
    const dx = e.clientX - origin.current.x,
      dy = e.clientY - origin.current.y,
      length = Math.max(42, Math.hypot(dx, dy));
    joystick.current = { x: dx / length, y: dy / length };
    setStick({ x: (dx / length) * 28, y: (dy / length) * 28 });
  }
  function release() {
    origin.current = null;
    joystick.current = { x: 0, y: 0 };
    setStick({ x: 0, y: 0 });
  }
  return (
    <section className="yard-canvas-wrap">
      <div ref={host} className="yard-canvas" data-testid="yard-canvas" />
      {!ready && !failure && <p className="yard-loading">Opening the yard…</p>}
      {failure && <p role="alert">{failure}</p>}
      <div className="yard-controls">
        <div
          role="application"
          aria-label="Movement joystick"
          tabIndex={0}
          className="yard-joystick"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            origin.current = { x: e.clientX, y: e.clientY };
            stickMove(e);
          }}
          onPointerMove={stickMove}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
        >
          <span
            style={{
              transform: "translate(" + stick.x + "px," + stick.y + "px)",
            }}
          />
        </div>
        <p>
          WASD / arrows
          <br />E to inspect nearby circle
        </p>
        <button
          className="button small"
          onClick={() => {
            const own = props.view.players.find(
              (p) => p.ownerId === props.ownerId,
            );
            if (own) {
              const c = [...props.view.circles].sort(
                (a, b) => distance(own, a) - distance(own, b),
              )[0];
              if (c) props.onInspect(c.id);
            }
          }}
        >
          Interact
        </button>
      </div>
    </section>
  );
}
