<script setup lang="ts">
import { ASSET_CREDITS } from "@/assets/attribution/AssetCredits";
import { useGameRuntime } from "@/core/useGameRuntime";

const runtime = useGameRuntime();
const sections = ASSET_CREDITS;

function back(): void {
  runtime.playUiSound("cancel");
  runtime.openMainMenu();
}
</script>

<template>
  <div class="menu-panel credits-panel" data-testid="credits-panel" data-menu-root>
    <h2 class="heading wo-title">CREDITS</h2>
    <p class="intro">
      This game uses third-party assets under their respective licences.
      Attribution is provided below as required by those licences.
    </p>

    <div class="credits-content">
      <section v-for="section in sections" :key="section.heading" class="credit-section">
        <h3 class="section-heading wo-label">{{ section.heading }}</h3>
        <ul class="credit-list">
          <li v-for="entry in section.entries" :key="entry.sourceUrl" class="credit-entry">
            <span class="credit-title">{{ entry.title }}</span>
            <span class="credit-meta">
              by {{ entry.author }} &middot;
              <a class="credit-link" :href="entry.licenceUrl" target="_blank" rel="noopener noreferrer">{{ entry.licence }}</a>
            </span>
            <a class="credit-link credit-source" :href="entry.sourceUrl" target="_blank" rel="noopener noreferrer">
              {{ entry.sourceUrl }}
            </a>
          </li>
        </ul>
      </section>
    </div>

    <button type="button" class="menu-item wo-item" data-index="01" data-menu-back @click="back()">BACK</button>
  </div>
</template>

<style scoped>
.menu-panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding-left: 8vw;
  pointer-events: none;
}

.heading {
  pointer-events: none;
  color: var(--ui-ink);
  margin: 0 0 0.75rem 0;
  font-size: 1.6rem;
}

.intro {
  pointer-events: none;
  font-family: var(--font-ui);
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--ui-dim);
  max-width: 32rem;
  margin: 0 0 1.25rem 0;
}

.credits-content {
  pointer-events: auto;
  min-width: 22rem;
  max-width: 40rem;
  max-height: 55vh;
  overflow-y: auto;
  margin-bottom: 1.5rem;
  padding-right: 0.25rem;
}

.credit-section {
  margin-bottom: 1.25rem;
}

.section-heading {
  font-family: var(--font-ui);
  font-size: 0.9rem;
  letter-spacing: 0.15em;
  color: var(--ui-cyan);
  margin: 0 0 0.6rem 0;
}

.credit-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.credit-entry {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.credit-title {
  font-family: var(--font-ui);
  font-size: 0.95rem;
  color: var(--ui-ink);
}

.credit-meta {
  font-family: var(--font-ui);
  font-size: 0.78rem;
  color: var(--ui-dim);
}

.credit-link {
  color: var(--ui-cyan);
  text-decoration: none;
}

.credit-link:hover,
.credit-link:focus-visible {
  text-decoration: underline;
}

.credit-source {
  font-family: var(--font-ui);
  font-size: 0.72rem;
  word-break: break-all;
}

.menu-item {
  pointer-events: auto;
  font-family: var(--font-ui);
  font-size: 1.1rem;
  letter-spacing: 0.15em;
  padding: 0.55rem 1.4rem 0.55rem 1rem;
  border: none;
  color: var(--ui-ink);
  cursor: pointer;
  text-align: left;
  width: fit-content;
  text-transform: uppercase;
}

.menu-item:hover,
.menu-item:focus-visible {
  transform: translateX(6px);
}
</style>
