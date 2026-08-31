import "./App.css";
import { BackendStatusBanner } from "@/components/layout/BackendStatusBanner";
import SpatialLayout from "@/components/layout/SpatialLayout";
import { TooltipProvider } from "@/components/ui/tooltip";

function App() {
  return (
    <TooltipProvider>
      <BackendStatusBanner />
      <SpatialLayout />
    </TooltipProvider>
  );
}

export default App;
