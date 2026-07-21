<template>
  <div class="overtime-banner" data-testid="overtime-banner">
    <span class="line-1">OVERTIME</span>
    <span class="line-2">GOLDEN GOAL</span>
  </div>
</template>

<style scoped>
.overtime-banner {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  pointer-events: none;
  font-family: monospace;
}

.line-1 {
  font-size: clamp(2.5rem, 8vw, 5rem);
  letter-spacing: 0.15em;
  color: #ff5fd8;
  text-shadow: 0 0 30px rgba(255, 95, 216, 0.7);
}

.line-2 {
  font-size: clamp(1rem, 3vw, 1.5rem);
  letter-spacing: 0.3em;
  color: #e8f9ff;
}
</style>
