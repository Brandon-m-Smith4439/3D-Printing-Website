import { redirect } from "next/navigation";

export default function LegacyCurrentQueuePage() {
  redirect("/queue");
}
