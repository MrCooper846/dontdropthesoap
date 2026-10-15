import { legacyDemoEnabled } from "@/lib/legacy-mode";
import { redirect } from "next/navigation";
import LegacyLobby from "@/components/LegacyLobby";
export default function Page() {
  if (legacyDemoEnabled()) return <LegacyLobby />;
  redirect("/play");
}
