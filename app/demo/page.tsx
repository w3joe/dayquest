import type { Metadata } from "next";
import Today from "../../components/today/Today";

export const metadata: Metadata = { title: "Demo · DayQuest" };

export default function DemoPage() {
  return <Today demo />;
}
