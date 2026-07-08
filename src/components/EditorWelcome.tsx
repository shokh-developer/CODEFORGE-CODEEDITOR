import { FileCode } from "lucide-react";

const EditorWelcome = () => {
  return (
    <div className="h-full flex items-center justify-center futuristic-bg">
      <div className="text-center animate-fade-in relative z-10">
        <div className="inline-flex w-16 h-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 mb-5 glow-md">
          <FileCode className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-sm font-orbitron font-bold text-foreground/80 mb-2 tracking-widest">SELECT A FILE</h2>
        <p className="text-xs text-muted-foreground/60 max-w-[220px] leading-relaxed">
          Choose a file from the explorer or create a new one to start coding.
        </p>
      </div>
    </div>
  );
};

export default EditorWelcome;
