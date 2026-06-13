import Editor from "@monaco-editor/react";
import { useEffect, useState, useRef } from "react";

interface CodeEditorProps {
  code: string;
  language: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

const CodeEditor = ({ code, language, onChange, readOnly = false }: CodeEditorProps) => {
  const [mounted, setMounted] = useState(false);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  const handleChange = (value: string | undefined) => {
    if (value !== undefined) {
      onChange(value);
    }
  };

  if (!mounted) {
    return (
      <div className="h-full w-full bg-cyber-dark flex items-center justify-center">
        <div className="text-primary animate-pulse font-orbitron">Loading Editor...</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden border border-border">
      <Editor
        height="100%"
        language={language}
        value={code}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        theme="vs-dark"
        options={{
          fontSize: 13,
          lineHeight: 20,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
          tabSize: 2,
          readOnly: readOnly,
          cursorBlinking: "smooth",
          smoothScrolling: true,
          padding: { top: 8, bottom: 8 },
          lineNumbers: "on",
          renderLineHighlight: "line",
          bracketPairColorization: { enabled: true },
        }}
      />
    </div>
  );
};

export default CodeEditor;
