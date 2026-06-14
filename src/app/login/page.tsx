import LoginForm from "@/components/LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log in | CRM PPA",
};

export default function LoginPage() {
  return <LoginForm />;
}
