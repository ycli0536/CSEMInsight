import "./App.css";
import { Dashboard } from "@/components/custom/Dashboard";

function App() {
  return (
    <>
      <div className="relative flex min-h-screen flex-col bg-background">
        <div className="relative w-full h-full theme-zinc">
          <Dashboard />
        </div>
      </div>
    </>
  );
}

export default App;
