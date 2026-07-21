<script setup lang="ts">
// game-flow spec section 20 (Goal Celebration): a full VFX treatment with
// scorer attribution is Phase 14 scope. This banner satisfies Phase 7's
// functional requirement ("Celebration starts") without team-specific
// styling — see docs/build-decisions.md.
</script>

<template>
  <div class="goal-banner" data-testid="goal-banner">
    <div class="band">
      <span class="text wo-title">GOAL!</span>
    </div>
  </div>
</template>

<style scoped>
.goal-banner {
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
  align-items: center;
  justify-content: center;
  padding: 1.2rem 0;
  transform: skewY(-2deg);
  background: linear-gradient(90deg, rgba(79, 240, 255, 0.85), rgba(255, 95, 216, 0.85));
  animation: wo-slide-in 200ms ease-out;
}

.text {
  font-size: clamp(3rem, 10vw, 7rem);
  color: #050308;
  text-shadow: none;
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
