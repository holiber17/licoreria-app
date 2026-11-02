// Tema: oscuro por defecto, claro opcional (se guarda en el navegador)
const claroInicial = () => document.documentElement.dataset.tema === 'claro';
export const tema = $state({ claro: claroInicial() });

function aplicar() {
  if (tema.claro) document.documentElement.dataset.tema = 'claro';
  else delete document.documentElement.dataset.tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema.claro ? '#efe8dc' : '#110e0c');
}
export function alternarTema() {
  tema.claro = !tema.claro;
  try { localStorage.setItem('tema', tema.claro ? 'claro' : 'oscuro'); } catch (e) {}
  aplicar();
}
aplicar();
