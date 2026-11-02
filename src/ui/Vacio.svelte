<script>
  // Estado vacío con icono grande
  let { icono, children } = $props();
</script>

<div class="empty"><i class="ti {icono}"></i>{@render children?.()}</div>
