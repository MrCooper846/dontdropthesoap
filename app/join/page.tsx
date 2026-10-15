import { legacyDemoEnabled } from "@/lib/legacy-mode";
import { redirect } from "next/navigation";
import LegacyJoin from "@/components/LegacyJoin";
export default function Page() {
  if (legacyDemoEnabled()) return <LegacyJoin />;
  redirect("/play");
}
