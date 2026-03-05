import { redirect } from "next/navigation";

/**
 * Главная страница — дашборды. Редирект на /dashboard.
 */
export default function RootPage() {
  redirect("/dashboard");
}
