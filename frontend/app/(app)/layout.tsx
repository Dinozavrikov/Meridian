import { AppShell } from "@/components/layout/app-shell"
import { ConsentDialog } from "@/components/entities/consent-dialog"
import { ConfirmHost } from "@/components/ui/confirm-host"
import { ToastHost } from "@/components/ui/toast-host"
import { RecordSharesSync } from "@/components/entities/record-shares-sync"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <><AppShell>{children}</AppShell><ConsentDialog /><ConfirmHost /><ToastHost /><RecordSharesSync /></>
}
