import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { lovable } from "@/integrations/lovable/index";
import { Mail, Lock, User, Loader2, Braces } from "lucide-react";

interface AuthModalProps { isOpen: boolean; onClose: () => void; }

const AuthModal = ({ isOpen, onClose }: AuthModalProps) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { signInWithEmail, signUpWithEmail } = useAuth();
  const { toast } = useToast();

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setDisplayName("");
  };

  // ✅ FIXED GOOGLE LOGIN
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { data, error } = await lovable.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin, // 🔥 MUHIM FIX
        },
      });

      if (error) {
        throw error;
      }

      // redirect bo‘lsa shu yerga kelmaydi
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Google sign-in failed",
        variant: "destructive",
      });
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      toast({
        title: "Error",
        description: "Enter email and password",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const { error } = await signInWithEmail(email, password);
        if (error) throw error;

        toast({ title: "Signed in!" });
        resetForm();
        onClose();
      } else {
        if (!displayName.trim()) {
          toast({
            title: "Error",
            description: "Enter your name",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        const { error } = await signUpWithEmail(email, password, displayName);
        if (error) throw error;

        toast({
          title: "Registered!",
          description: "You can now sign in",
        });

        resetForm();
        onClose();
      }
    } catch (error: any) {
      let msg = error.message;

      if (msg?.includes("Invalid login credentials"))
        msg = "Invalid email or password";
      else if (msg?.includes("User already registered"))
        msg = "Already registered";

      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl glass-card border-primary/15">
        <div className="h-1 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />

        <div className="p-6">
          <DialogHeader className="mb-5">
            <div className="flex items-center justify-center mb-3">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center glow-md border border-primary/20">
                <Braces className="h-7 w-7 text-primary" />
              </div>
            </div>

            <DialogTitle className="text-center text-lg font-bold font-orbitron tracking-wide">
              {mode === "login" ? "WELCOME BACK" : "CREATE ACCOUNT"}
            </DialogTitle>
          </DialogHeader>

          {/* 🔥 GOOGLE BUTTON */}
          <button
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full h-11 mb-4 flex items-center justify-center gap-3 rounded-xl border border-border bg-background/50 hover:bg-background/80 transition-all duration-200 text-sm font-medium disabled:opacity-50"
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </>
            )}
          </button>

          {/* FORM qolgan qismi o‘zgarmagan */}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AuthModal;
