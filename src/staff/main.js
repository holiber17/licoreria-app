import { mount } from 'svelte';
import '@tabler/icons-webfont/tabler-icons.min.css';
import '../css/tokens.css';
import '../css/base.css';
import '../css/componentes.css';
import '../css/app.css';
import '../css/impresion.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('raiz') });
