import React from "react"
import ReactDOM from "react-dom/client"
import "dialkit/styles.css"
import "@fontsource-variable/inter"
import "@fontsource-variable/space-grotesk"
import "./index.css"
import { App } from "./App"
import { EmbeddedEngineVisualization } from "./components/EmbeddedEngineVisualization"
import { ResponsiveDialRoot } from "@/components/ResponsiveDialRoot"

const isEmbedded = new URLSearchParams(window.location.search).get("embed") === "1"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isEmbedded ? <EmbeddedEngineVisualization /> : <><App /><ResponsiveDialRoot /></>}
  </React.StrictMode>,
)
