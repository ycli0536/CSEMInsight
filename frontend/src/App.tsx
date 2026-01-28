import "./App.css";
import SpatialLayout from "@/components/layout/SpatialLayout";
import { TooltipProvider } from "@/components/ui/tooltip";

function App() {
  return (
    <TooltipProvider>
      <SpatialLayout />
    </TooltipProvider>
  );
}

export default App;
