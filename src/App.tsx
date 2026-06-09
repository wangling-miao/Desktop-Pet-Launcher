import { PetWindow } from "./components/PetWindow";
import { SettingsWindow } from "./components/SettingsWindow";

export function App() {
  const route = window.location.hash.replace("#", "") || "pet";
  return route === "settings" ? <SettingsWindow /> : <PetWindow />;
}
