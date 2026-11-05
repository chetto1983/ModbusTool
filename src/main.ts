import { mount } from "svelte";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/martian-mono/400.css";
import "@fontsource/martian-mono/500.css";
import "./app.css";
import App from "./App.svelte";

export default mount(App, { target: document.getElementById("app")! });
