<script setup lang="ts">
// game-flow spec section 20 (Goal Celebration): a full VFX treatment with
// scorer attribution is Phase 14 scope. This banner satisfies Phase 7's
// functional requirement ("Celebration starts") without team-specific
// styling — see docs/build-decisions.md.
</script>

<template>
  <div class="goal-banner" data-testid="goal-banner">
    <span class="text">GOAL!</span>
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
}

.text {
  font-family: monospace;
  font-size: clamp(3rem, 10vw, 7rem);
  letter-spacing: 0.15em;
  color: #4ff0ff;
  text-shadow: 0 0 30px rgba(79, 240, 255, 0.8);
}
</style>
