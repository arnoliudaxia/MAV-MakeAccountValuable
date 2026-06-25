import { Routes, Route } from "react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Tags from "./pages/Tags";
import Settings from "./pages/Settings";
import Database from "./pages/Database";
import Reimbursements from "./pages/Reimbursements";
import ApiDocs from "./pages/ApiDocs";

export default function App() {
  return (
    <AppLayout>
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
