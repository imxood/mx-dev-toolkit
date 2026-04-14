import React from "react";
import ReactDOM from "react-dom/client";
import "./workbench.css";
import { App } from "./App";

const rootElement = document.getElementById("root") ?? createRootElement();

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

function createRootElement(): HTMLElement {
  const element = document.createElement("div");
  element.id = "root";
  document.body.appendChild(element);
  return element;
}
