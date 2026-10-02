import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Routes, Route } from "react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import LoginPage from "@/components/auth/LoginPage";
import Dashboard from "./pages/Dashboard";
import Tags from "./pages/Tags";
import Settings from "./pages/Settings";
import Database from "./pages/Database";
import Reimbursements from "./pages/Reimbursements";
import ApiDocs from "./pages/ApiDocs";

type AuthState = "loading" | "authenticated" | "unauthenticated";

export default function App() {
  const queryClient = useQueryClient();
  const [authState, setAuthState] = useState<AuthState>("loading");

  useEffect(() => {
    let isMounted = true;

    fetch("/api/auth/session", { credentials: "include" })
      .then(response => (response.ok ? response.json() : null))
      .then(payload => {
        if (!isMounted) return;
        setAuthState(payload?.authenticated ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (isMounted) setAuthState("unauthenticated");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      queryClient.clear();
      setAuthState("unauthenticated");
    }
  };

  if (authState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        正在检查登录状态...
      </main>
    );
  }

  if (authState !== "authenticated") {
    return <LoginPage onAuthenticated={() => setAuthState("authenticated")} />;
  }

  return (
    <AppLayout onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/reimbursements" element={<Reimbursements />} />
        <Route path="/tags" element={<Tags />} />
        <Route path="/database" element={<Database />} />
        <Route path="/docs" element={<ApiDocs />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppLayout>
  );
}
