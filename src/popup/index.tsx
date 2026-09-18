import { createRoot } from "react-dom/client";
import tailwind from "@/styles/tailwind.css";
import { App } from "./App";

const style = document.createElement("style");
style.textContent = tailwind;
document.head.appendChild(style);

const container = document.getElementById("root");

if (container !== null) {
    createRoot(container).render(<App />);
}
