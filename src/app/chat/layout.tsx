import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if ((await headers()).get("x-hyperthread-session") !== "verified") {
    redirect("/login");
  }
  return children;
}
