<script>
  let { label, valor, clase = '', destacada = false } = $props();
</script>

<div class="metric" class:destacada><div class="ml">{label}</div><div class="mv {clase}">{valor}</div></div>
