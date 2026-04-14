import React from "react";
import ReactDOM from "react-dom/client";
import "./sidebar.css";
import { SidebarApp } from "./SidebarApp";

const rootElement = document.getElementById("root") ?? createRootElement();

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <SidebarApp />
  </React.StrictMode>
);

function createRootElement(): HTMLElement {
  const element = document.createElement("div");
  element.id = "root";
  document.body.appendChild(element);
  return element;
}
