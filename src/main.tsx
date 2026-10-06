import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { ThemeProvider } from 'next-themes'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import { Toaster } from "@/components/ui/sonner"
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="mav-theme"
      disableTransitionOnChange
    >
      <BrowserRouter>
        <TRPCProvider>
          <App />
          <Toaster position="top-right" />
        </TRPCProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
