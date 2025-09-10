import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import GameApp from "./GameApp";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GameApp />
  </React.StrictMode>
);
