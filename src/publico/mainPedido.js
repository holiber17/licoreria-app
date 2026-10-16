import { mount } from 'svelte';
import '@tabler/icons-webfont/tabler-icons.min.css';
import '../css/tokens.css';
import '../css/base.css';
import '../css/componentes.css';
import '../css/pedido.css';
import PedidoCliente from './PedidoCliente.svelte';

mount(PedidoCliente, { target: document.getElementById('raiz') });
