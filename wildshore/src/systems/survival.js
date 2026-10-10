// Survival simulation: hunger, thirst, energy, stamina, health, body temperature,
// wetness, oxygen, sickness and injuries. Rates are per game hour unless noted.
import { clamp, lerp } from '../util/math.js';
import { ITEMS } from '../data/items.js';

export class Survival {
  constructor() {
    this.health = 100;
    this.hunger = 80; // 100 = full
    this.thirst = 75;
    this.energy = 85; // fatigue: 100 = rested
    this.stamina = 100;
    this.temp = 37.0;
    this.wet = 0;
    this.oxygen = 100;
    this.sick = 0; // 0..1 illness severity
    this.bleeding = 0; // 0..1
    this.sprain = 0; // game hours remaining
    this.exertion = 0;
    this.daysSurvived = 0;
    this.alive = true;
    this.cause = '';
    this.warnings = new Map();
    this.messages = [];
  }

  // ctx: { dtH (game hours), dtR (real seconds), airTemp, raining, inWater, underwater, sprinting, swimming,
  //        nearFire (0..1 heat), sheltered (0..1), sleeping, sleepQuality, working, sunExposure }
  update(ctx) {
    if (!this.alive) return;
    const { dtH, dtR } = ctx;
    const work = ctx.sprinting ? 1.7 : ctx.swimming ? 1.6 : ctx.working ? 1.35 : 1;
    const sleepMul = ctx.sleeping ? 0.55 : 1;
    const sickMul = 1 + this.sick * 0.8;
    const heat = Math.max(0, ctx.airTemp - 29) * 0.06 + (ctx.sunExposure || 0) * 0.25;

    this.hunger -= 1.55 * work * sleepMul * sickMul * dtH;
    this.thirst -= (3.2 + heat * 2.2) * (ctx.sprinting || ctx.swimming ? 1.3 : 1) * sleepMul * sickMul * dtH;
    if (ctx.sleeping) this.energy += (7 + 9 * (ctx.sleepQuality || 0.4)) * dtH;
    else this.energy -= (3.6 * (ctx.working || ctx.sprinting ? 1.4 : 1) + this.sick * 2) * dtH;

    // stamina (real time)
    if (ctx.sprinting) this.stamina -= 13 * dtR;
    else if (ctx.swimming && ctx.fastSwim) this.stamina -= 8 * dtR;
    else if (ctx.swimming) this.stamina -= 1.0 * dtR;
    else {
      const regen = 12 * (this.hunger > 15 ? 1 : 0.4) * (this.thirst > 15 ? 1 : 0.4) * (this.energy > 10 ? 1 : 0.5);
      this.stamina += regen * dtR;
    }
    if (ctx.actionCost) this.stamina -= ctx.actionCost;

    // oxygen
    if (ctx.underwater) {
      this.oxygen -= (100 / 48) * dtR * (ctx.fastSwim ? 1.5 : 1);
      if (this.oxygen <= 0) { this.oxygen = 0; this.damage(14 * dtR, 'drowned'); }
    } else this.oxygen = Math.min(100, this.oxygen + 35 * dtR);

    // wetness
    if (ctx.inWater) this.wet = 100;
    else {
      if (ctx.raining > 0.05) this.wet += ctx.raining * 40 * (1 - (ctx.sheltered || 0)) * dtH;
      const dry = 22 + (ctx.sunExposure || 0) * 30 + (ctx.nearFire || 0) * 70;
      this.wet -= dry * dtH;
    }

    // body temperature
    let target = 37 + (ctx.airTemp - 27) * 0.04;
    target -= (this.wet / 100) * (1.6 + (ctx.wind || 0) * 1.2) * (ctx.airTemp < 30 ? 1 : 0.4);
    if (ctx.sleeping && !ctx.sheltered) target -= 0.5;
    target += (ctx.nearFire || 0) * 1.6;
    target += (ctx.sheltered || 0) * 0.4;
    if (ctx.sprinting) target += 0.3;
    if (this.sick > 0.5) target += 1.2; // fever
    this.temp = lerp(this.temp, target, 1 - Math.exp(-0.35 * dtH));

    // sickness recovers slowly, faster when resting
    if (this.sick > 0) this.sick = Math.max(0, this.sick - (ctx.sleeping ? 0.08 : 0.025) * dtH);
    if (this.sprain > 0) this.sprain = Math.max(0, this.sprain - dtH * (ctx.sleeping ? 2 : 1));

    // damage sources
    if (this.hunger <= 0) this.damage(3.2 * dtH, 'starved');
    if (this.thirst <= 0) this.damage(7 * dtH, 'died of thirst');
    if (this.energy <= 0) this.damage(1.5 * dtH, 'collapsed from exhaustion');
    if (this.temp < 35.2) this.damage(4 * dtH, 'succumbed to hypothermia');
    if (this.temp > 39.4) this.damage(3 * dtH, 'succumbed to heatstroke');
    if (this.bleeding > 0) {
      this.damage(9 * this.bleeding * dtH, 'bled out');
      this.bleeding = Math.max(0, this.bleeding - 0.05 * dtH);
    }
    if (this.sick > 0.6) this.damage(1.2 * dtH, 'died of illness');

    // natural healing
    if (this.hunger > 35 && this.thirst > 35 && this.energy > 15 && this.bleeding <= 0 && this.temp > 35.8 && this.temp < 38.8) {
      this.health += (ctx.sleeping ? 4.5 : 1.4) * dtH;
    }

    this.hunger = clamp(this.hunger, 0, 100);
    this.thirst = clamp(this.thirst, 0, 100);
    this.energy = clamp(this.energy, 0, 100);
    this.stamina = clamp(this.stamina, 0, this.maxStamina());
    this.wet = clamp(this.wet, 0, 100);
    this.health = clamp(this.health, 0, 100);
    if (this.health <= 0) this.alive = false;
  }

  maxStamina() {
    let m = 100;
    if (this.hunger < 20) m -= 25;
    if (this.thirst < 20) m -= 25;
    if (this.energy < 15) m -= 20;
    if (this.sick > 0.3) m -= 20;
    return Math.max(25, m);
  }

  damage(n, cause) {
    this.health -= n;
    if (this.health <= 0 && this.alive) { this.health = 0; this.alive = false; this.cause = cause; }
  }

  injure(kind, severity = 0.5) {
    if (kind === 'cut') this.bleeding = clamp(this.bleeding + severity, 0, 1);
    if (kind === 'sprain') this.sprain = Math.max(this.sprain, 12 * severity);
    if (kind === 'sick') this.sick = clamp(this.sick + severity, 0, 1);
  }

  // returns a short message describing the effect
  consume(id, fresh = 1) {
    const d = ITEMS[id];
    if (!d) return '';
    const q = fresh < 0.25 ? 0.7 : 1;
    if (d.food) this.hunger = clamp(this.hunger + d.food * q, 0, 100);
    if (d.water) this.thirst = clamp(this.thirst + d.water, 0, 100);
    if (d.heal) {
      this.health = clamp(this.health + d.heal, 0, 100);
      if (id === 'bandage') this.bleeding = 0;
    }
    if (d.cure) this.sick = Math.max(0, this.sick - 0.4);
    let msg = '';
    const risk = (d.risk || 0) + (fresh < 0.2 ? 0.15 : 0);
    if (risk && Math.random() < risk) {
      this.injure('sick', 0.35 + Math.random() * 0.25);
      msg = 'Your stomach turns. You feel sick.';
    }
    return msg;
  }

  status() {
    const s = [];
    if (this.bleeding > 0.05) s.push({ id: 'bleeding', label: 'Bleeding', bad: true });
    if (this.sick > 0.1) s.push({ id: 'sick', label: this.sick > 0.5 ? 'Feverish' : 'Nauseous', bad: true });
    if (this.sprain > 0) s.push({ id: 'sprain', label: 'Sprained ankle', bad: true });
    if (this.temp < 35.8) s.push({ id: 'cold', label: 'Hypothermic', bad: true });
    else if (this.temp < 36.4) s.push({ id: 'chilly', label: 'Cold' });
    if (this.temp > 38.6) s.push({ id: 'hot', label: 'Overheating', bad: true });
    if (this.wet > 40) s.push({ id: 'wet', label: 'Soaked' });
    if (this.energy < 20) s.push({ id: 'tired', label: 'Exhausted', bad: this.energy < 8 });
    if (this.hunger < 20) s.push({ id: 'hungry', label: 'Starving', bad: true });
    if (this.thirst < 20) s.push({ id: 'thirsty', label: 'Dehydrated', bad: true });
    return s;
  }

  serialize() {
    const { health, hunger, thirst, energy, stamina, temp, wet, oxygen, sick, bleeding, sprain, daysSurvived, alive, cause } = this;
    return { health, hunger, thirst, energy, stamina, temp, wet, oxygen, sick, bleeding, sprain, daysSurvived, alive, cause };
  }
  restore(s) { Object.assign(this, s); }
}
