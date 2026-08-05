import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Index from "./pages/Index";
import Room from "./pages/Room";
import Profile from "./pages/Profile";
import MyRooms from "./pages/MyRooms";
import Settings from "./pages/Settings";
import Pricing from "./pages/Pricing";
import ForgeTyping from "./pages/ForgeTyping";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();
const LANG_STORAGE_KEY = "kodo-ui-language";

const App = () => {
  useEffect(() => {
    const savedLanguage = localStorage.getItem(LANG_STORAGE_KEY);
    if (!savedLanguage) {
      localStorage.setItem(LANG_STORAGE_KEY, "en");
      document.documentElement.lang = "en";
      return;
    }
    document.documentElement.lang = savedLanguage;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/room/:id" element={<Room />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/my-rooms" element={<MyRooms />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/typing" element={<ForgeTyping />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
