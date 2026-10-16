import { mount } from 'svelte';
import '@tabler/icons-webfont/tabler-icons.min.css';
import '../css/tokens.css';
import '../css/base.css';
import '../css/componentes.css';
import '../css/pedido.css';
import Carta from './Carta.svelte';

mount(Carta, { target: document.getElementById('raiz') });
