import { Link, useLocation } from "react-router";
import {
  Tags,
  Settings,
  LayoutDashboard,
  Database,
  Wallet,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    label: "概览",
    path: "/",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    label: "报销管理",
    path: "/reimbursements",
    icon: <Wallet className="h-4 w-4" />,
  },
  {
    label: "分类管理",
    path: "/tags",
    icon: <Tags className="h-4 w-4" />,
  },
  {
    label: "数据库",
    path: "/database",
    icon: <Database className="h-4 w-4" />,
  },
  {
    label: "API与文档",
    path: "/docs",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    label: "设置",
    path: "/settings",
    icon: <Settings className="h-4 w-4" />,
  },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center min-h-14 gap-x-6 gap-y-2 py-2">
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <i
                className="em em-moneybag block h-5 w-5"
                aria-role="presentation"
                aria-label="MONEY BAG"
              />
              <span className="font-bold text-lg">
                账有数｜让每一笔账都有价值
              </span>
            </Link>

            <nav className="flex flex-wrap items-center gap-1">
              {navItems.map(item => {
                const isActive =
                  item.path === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
