import { legacyDemoEnabled } from "@/lib/legacy-mode";
import { redirect } from "next/navigation";
import LegacyNickname from "@/components/LegacyNickname";
export default function Page() {
  if (legacyDemoEnabled()) return <LegacyNickname />;
  redirect("/play");
}
