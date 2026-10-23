# 3D restaurant feel prototype

Unity 6.3 LTS, `6000.3.27f1`. Standalone Windows, single-player. This explores movement and physical presence before migrating any existing gameplay. No production services or wallets are connected.

## Play

On this laptop, run `D:\Unity\Projects\Soap3D\Build\SoapRestaurant.exe`, or the **Soap - 3D Restaurant** desktop shortcut.

- WASD/arrows: walk. Shift: run.
- Right mouse drag: orbit the follow camera. Mouse wheel: zoom.
- E: collect the yellow tray, or deliver a filled tray near the customer at Table 1.
- Hold F beside the kitchen preparation bench for three seconds to make a noodle bowl.
- Q: drop the tray as a physical object; E picks it up again.
- R: recover/reset the tray to its starting counter. H: show/hide controls. Escape: quit.

Loop: collect tray near the kitchen entrance → walk through the kitchen doorway → prepare noodles at the ingredient board → carry them to Table 1 → serve → repeat. Delivery awards ten temporary prototype noodles.

The room layout loosely follows the proposed restaurant: kitchen, dining area, bar, back corridor, washing area, office and stockroom. Props and striped prisoner are simple procedural placeholders. Held trays are stabilised; dropped trays use Rigidbody gravity/collision. This does not yet simulate tray balance, food spilling, other prisoners, restaurant roles, theft or shared money.

## Develop and build

The working local project is `D:\Unity\Projects\Soap3D`. This repository folder contains its source, package lock and settings; Unity-generated caches and builds are excluded. Open this folder in Unity Hub using the matching editor. Enter Play mode to generate the scene. The **Soap → Build playable prototype** menu regenerates `Assets/Restaurant.unity` and writes `Build/SoapRestaurant.exe`.

Command-line equivalent:

```powershell
& 'D:\Unity\Editors\6000.3.27f1\Editor\Unity.exe' -batchmode -nographics -quit -projectPath 'D:\Unity\Projects\Soap3D' -executeMethod BuildPrototype.Build -logFile unity-build.log
```

## Verification

Standalone runtime smoke mode (`SoapRestaurant.exe --smoke-test`) checks walking, wall collision, tray pickup, workstation completion, serving/reward and the Rigidbody drop state. It then saves `Build/prototype-preview.png` in the working local project and exits. Isolated checks reposition the prisoner, followed by a complete collision-constrained walking route from tray collection through the kitchen doorway to preparation and dining delivery. This does not replace human testing of keyboard/camera feel. The rendered scene is visually inspected separately. Run without `-batchmode` for screenshot capture.

Runtime verification found a stripped shader reference and a tray reset transform/physics synchronization bug; the scene now serializes its shader/font dependencies, and reset explicitly synchronizes the Rigidbody and transform. Source is C# with Unity built-in 3D rendering, CharacterController, PhysX rigid bodies and the legacy keyboard/mouse input API. No third-party art or packages were added.
