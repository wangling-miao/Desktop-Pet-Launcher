import { ErrorBoundary } from "./components/ErrorBoundary";
import { PetWindow } from "./components/PetWindow";
import { SettingsWindow } from "./components/SettingsWindow";

export function App() {
  const route = window.location.hash.replace("#", "") || "pet";
  return (
    <ErrorBoundary fallbackTitle={route === "settings" ? "设置界面出错" : "桌宠界面出错"}>
      {route === "settings" ? <SettingsWindow /> : <PetWindow />}
    </ErrorBoundary>
  );
}
