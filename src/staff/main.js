import { mount } from 'svelte';
import '../css/iconos.css';   // solo los iconos usados (scripts/iconos.mjs)
import '../css/tokens.css';
import '../css/base.css';
import '../css/componentes.css';
import '../css/app.css';
import '../css/impresion.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('raiz') });
