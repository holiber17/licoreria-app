import { mount } from 'svelte';
import '../css/iconos.css';   // solo los iconos usados (scripts/iconos.mjs)
import '../css/tokens.css';
import '../css/base.css';
import '../css/componentes.css';
import '../css/pedido.css';
import Carta from './Carta.svelte';

mount(Carta, { target: document.getElementById('raiz') });
