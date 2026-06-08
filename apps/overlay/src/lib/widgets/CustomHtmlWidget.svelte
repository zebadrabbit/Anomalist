<script lang="ts">
  import type { Widget } from "@anomalist/types";

  export let widget: Widget;
</script>

<iframe
  srcdoc={typeof widget.props.html === "string" ? widget.props.html : ""}
  sandbox="allow-scripts allow-same-origin"
  style="width:100%;height:100%;border:none;background:transparent;"
  title="Custom widget"
></iframe>
