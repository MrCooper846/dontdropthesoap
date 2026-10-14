import { notFound } from "next/navigation";
import VoiceProbe from "@/components/VoiceProbe";
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <VoiceProbe />;
}
