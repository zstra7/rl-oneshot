<template>
  <div class="overtime-banner" data-testid="overtime-banner">
    <div class="band">
      <span class="line-1 wo-title">OVERTIME</span>
      <span class="line-2 wo-label">GOLDEN GOAL</span>
    </div>
  </div>
</template>

<style scoped>
.overtime-banner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  overflow: hidden;
}

.band {
  width: 140%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1.5rem 0;
  transform: skewY(-2deg);
  background: rgba(255, 95, 216, 0.85);
  animation: wo-slide-in 200ms ease-out;
}

.line-1 {
  font-size: clamp(2.5rem, 8vw, 5rem);
  color: #050308;
  text-shadow: none;
}

.line-2 {
  color: #050308;
}

@keyframes wo-slide-in {
  0% {
    transform: skewY(-2deg) translateX(-100%);
    opacity: 0;
  }
  100% {
    transform: skewY(-2deg) translateX(0);
    opacity: 1;
  }
}
</style>
