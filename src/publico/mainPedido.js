import { mount } from 'svelte';
import '../css/iconos.css';   // solo los iconos usados (scripts/iconos.mjs)
import '../css/tokens.css';
import '../css/base.css';
import '../css/componentes.css';
import '../css/pedido.css';
import PedidoCliente from './PedidoCliente.svelte';

mount(PedidoCliente, { target: document.getElementById('raiz') });
