import { redirect } from "next/navigation";

/**
 * Route pendek untuk menu "Template Notif". Panel admin adalah SPA berbasis
 * `/admin?panel=…`, jadi route ini mengarahkan ke panel yang sama tanpa
 * menduplikasi shell/auth admin.
 */
export default function TemplateNotifRoute() {
  redirect("/admin?panel=notif-template");
}
