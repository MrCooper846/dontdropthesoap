import { redirect } from "next/navigation";
import LegacyNickname from "@/components/LegacyNickname";
export default function Page() {
  if (process.env.SOAP_LEGACY === "true") return <LegacyNickname />;
  redirect("/play");
}
