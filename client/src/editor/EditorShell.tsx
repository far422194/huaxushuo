import { Toolbar } from "./Toolbar";
import { SlideList } from "./SlideList";
import { Canvas } from "./Canvas";
import { PropertyPanel } from "./PropertyPanel";
import { ChatPanel } from "./ChatPanel";
import { useAutoSyncConversation } from "./useAutoSyncConversation";

export function EditorShell() {
  useAutoSyncConversation();
  return (
    <div className="w-screen h-screen flex bg-slate-100 text-slate-800">
      <SlideList />
      <main className="flex-1 flex flex-col min-w-0">
        <Toolbar />
        <Canvas />
      </main>
      <PropertyPanel />
      <ChatPanel />
    </div>
  );
}
