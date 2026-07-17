import { redirect } from "next/navigation";
export default function Home() {
  redirect("/login"); // middleware routes signed-in users to their portal
}
