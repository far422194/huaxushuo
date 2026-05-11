import { useEditorStore } from "@/store/editor";
import { EditorShell } from "@/editor/EditorShell";
import { Home } from "@/editor/Home";

export function App() {
  const view = useEditorStore((s) => s.view);

  if (view === "home") {
    return <Home />;
  }
  return <EditorShell />;
}
