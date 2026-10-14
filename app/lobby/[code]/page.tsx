import { redirect } from "next/navigation";
import LegacyLobby from "@/components/LegacyLobby";
export default function Page() {
  if (process.env.SOAP_LEGACY === "true") return <LegacyLobby />;
  redirect("/play");
}
