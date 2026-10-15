import { legacyDemoEnabled } from "@/lib/legacy-mode";
import { redirect } from "next/navigation";
import LegacyHome from "@/components/LegacyHome";
export default function Home() {
  if (legacyDemoEnabled()) return <LegacyHome />;
  redirect(process.env.FEATURE_YARD === "false" ? "/play" : "/yard");
}
