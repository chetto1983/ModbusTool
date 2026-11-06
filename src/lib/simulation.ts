// Slave value simulation. Values are a function of time, so every rule is deterministic
// except "random".

import { m } from "../paraglide/messages.js";
import type { SimulationKind, SimulationRule } from "./project";
import { encode, registerCount } from "./datatypes";

export const SIMULATION_KINDS: { id: SimulationKind; label: () => string }[] = [
  { id: "sine", label: m.sim_sine },
  { id: "increment", label: m.sim_ramp },
  { id: "random", label: m.sim_random },
  { id: "toggle", label: m.sim_square },
];

const isBitTable = (rule: SimulationRule) => rule.table === "coils" || rule.table === "discreteInputs";
const isFloat = (rule: SimulationRule) => rule.dataType === "float32" || rule.dataType === "float64";

/** Index of the current period: a rule writes a new value only when it changes. */
export function tick(rule: SimulationRule, timeMs: number): number {
  return Math.floor(timeMs / Math.max(rule.periodMs, 50));
}

export function simulatedValue(rule: SimulationRule, timeMs: number, random = Math.random): number {
  const { min, max } = rule;
  const k = tick(rule, timeMs);
  if (isBitTable(rule) || rule.kind === "toggle") return k % 2 === 0 ? min : max;
  switch (rule.kind) {
    case "increment": {
      const span = max - min + (isFloat(rule) ? 0 : 1);
      return span <= 0 ? min : min + ((((k * rule.step) % span) + span) % span);
    }
    case "random": {
      const value = min + random() * (max - min);
      return isFloat(rule) ? value : Math.round(value);
    }
    case "sine": {
      // One full wave every 20 periods, sampled once per period.
      const value = min + (max - min) * (0.5 + 0.5 * Math.sin((2 * Math.PI * k) / 20));
      return isFloat(rule) ? value : Math.round(value);
    }
  }
}

/** Registers (or a single 0/1 for bit tables) to write for the rule at `timeMs`. */
export function simulatedRegisters(rule: SimulationRule, timeMs: number, random = Math.random): number[] {
  const value = simulatedValue(rule, timeMs, random);
  if (isBitTable(rule)) return [value ? 1 : 0];
  return encode(String(value), rule.dataType, rule.byteOrder);
}

export function registersUsed(rule: SimulationRule): number {
  return isBitTable(rule) ? 1 : registerCount(rule.dataType);
}
