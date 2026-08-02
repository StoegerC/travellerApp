/**
 * Kampf – Delta Green (User-Wunsch 02.08.2026): kompakte "Alles
 * griffbereit"-Seite für den Spieltisch. Layout/CSS-Klassen (.combat-page,
 * .combat-block, .combat-equip-…, .combat-ammo-…) sind dieselben wie bei
 * MGT2s systems/mgt2/pages/combat.js — bewusst NICHT als eigenes
 * Delta-Green-Aussehen neu erfunden, aber inhaltlich deutlich schlanker:
 * kein Initiative-Tracker, kein Schiffskampf, keine Erste-Hilfe-/
 * Strahlungs-Mechanik wie bei MGT2 — dafür gibt es bei Delta Green keine
 * Entsprechung, und war auch nicht angefragt.
 *
 * Drei Blöcke, wie angefragt:
 *
 * 1. Ressourcen (Trefferpunkte/Willenskraft/Sanity/Luck/Breaking Point)
 *    inkl. ±-Zähler — ruft DgStatsPage._renderPool()/_renderBreakingPoint()/
 *    _applyDerivedResourceValues()/_attachPoolListeners() direkt auf statt
 *    Berechnung/Darstellung zu duplizieren (Single Source of Truth, siehe
 *    Refactor dort). Identische Element-IDs wie im Werte-Tab (dghpValue
 *    usw.) — unkritisch, weil pro Tab immer nur EIN Seiten-Container im DOM
 *    gefüllt ist (Render-Zyklus, siehe CLAUDE.md); Werte-Tab und Kampf-Tab
 *    existieren nie gleichzeitig im DOM.
 *
 * 2. Aktive Rüstung + aktive Bewaffnung (character.equipment, Kern-Feld,
 *    von equipment.js befüllt) — analog zu MGT2s combat.js
 *    _renderProtection()/_renderBlock3(), gleiche .combat-equip-…/
 *    .combat-ammo-…-Klassen wiederverwendet. Bewusst OHNE MGT2s Attribut-DM/
 *    "Mod"-Zeile (Delta Green hat kein DM-System, siehe
 *    App._characteristicLabels()-Kommentar in equipment.js) und ohne Heft/
 *    Recoil-Warnung (STR-DM-Konzept, MGT2-spezifisch). Munitions-Zähler
 *    bewusst simpler als MGT2 (reines CoreWidgets.attachCounter, kein
 *    Auto-Burst/Nachladen-aus-Reserve — nicht angefragt, siehe
 *    core-widgets.js-Kommentar zu MGT2s bewusst NICHT verallgemeinerter
 *    Munitionslogik).
 *
 * 3. Fertigkeiten-Kurzreferenz: Ausweichen/Schusswaffen/Nahkampfwaffen, per
 *    Namens-Präfix aus character.systemData.skills gesucht (freie Liste,
 *    siehe stats.js — Namen tragen oft einen Prozent-Suffix wie
 *    "Ausweichen (30%)", deshalb Präfix- statt Exakt-Vergleich). Reine
 *    Lese-Anzeige ohne Ankreuz-Kästchen/Steigern-Dialog — dafür bleibt der
 *    Werte-Tab zuständig, hier ging es nur um "Werte anzeigen".
 */
const DgCombatPage = {
  _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  // ── Block 1: Ressourcen ──────────────────────────────────────────────
  _renderResourcesBlock(character) {
    const pools = {
      hp:   DgStatsPage._hitPoints(character),
      wp:   DgStatsPage._willpower(character),
      san:  DgStatsPage._sanity(character),
      luck: DgStatsPage._luck(character),
    };
    const derived = DgStatsPage._applyDerivedResourceValues(character);
    return `<div class="combat-block">
      <h3 class="combat-block-title">Ressourcen</h3>
      <div class="dg-pool-grid">
        ${Object.entries(DgStatsPage._POOLS).map(([prefix, meta]) =>
          DgStatsPage._renderPool(prefix, meta.label, pools[prefix], DgStatsPage._RESOURCE_RULES[prefix], derived[prefix])
        ).join('')}
        ${DgStatsPage._renderBreakingPoint(pools.san, derived.breakingPoint)}
      </div>
    </div>`;
  },

  // ── Block 2a: Aktive Rüstung (alle equipped, wie equipment.js' Summe) ──
  _renderArmorBlock(character) {
    const armors = (character.equipment || []).filter(e => e.type === 'armor' && e.equipped && !e._deleted);
    if (!armors.length) {
      return `<div class="combat-block">
        <h3 class="combat-block-title">Aktive Rüstung</h3>
        <div class="combat-prot-empty">Kein Schutz aktiv</div>
      </div>`;
    }
    const total = armors.reduce((s, a) => s + (parseInt(a.protection) || 0), 0);
    const rows = armors.map(a => `
      <div class="combat-armor-row">
        <span class="combat-armor-row-name">${this._esc(a.name)}</span>
        <span class="combat-armor-row-prot">+${parseInt(a.protection) || 0}</span>
        ${a.rad ? `<span class="combat-armor-rad">Rad ${this._esc(a.rad)}</span>` : ''}
      </div>`).join('');

    return `<div class="combat-block">
      <h3 class="combat-block-title">Aktive Rüstung</h3>
      <div class="combat-prot">
        <div class="combat-prot-total">
          <span class="combat-prot-icon">🛡️</span>
          <span class="combat-prot-value">${total}</span>
          <span class="combat-prot-label">Gesamtschutz</span>
        </div>
        <div class="combat-armor-list">${rows}</div>
      </div>
    </div>`;
  },

  // ── Block 2b: Aktive Bewaffnung (erste equipped Nahkampf-/Fernkampfwaffe,
  //    analog zu MGT2s combat.js) ─────────────────────────────────────────
  _renderWeaponsBlock(character) {
    const eq     = character.equipment || [];
    const melee  = eq.find(e => e.type === 'melee' && e.equipped && !e._deleted);
    const ranged = eq.find(e => (e.type === 'ranged' || e.type === 'weapon') && e.equipped && !e._deleted);

    let inner = '';

    if (ranged) {
      const ammo = parseInt(ranged.ammo) || 0;
      const mag  = parseInt(ranged.magazine) || 0;
      inner += `<div class="combat-equip-item">
        <div class="combat-equip-header">
          <span class="combat-equip-icon">🔫</span>
          <span class="combat-equip-name">${this._esc(ranged.name)}</span>
          <span class="combat-equip-tag">Fernkampf</span>
        </div>
        <div class="combat-equip-stats">
          <span><strong>Schaden:</strong> ${this._esc(ranged.damage || '–')}</span>
          <span><strong>Art:</strong> ${this._esc(ranged.damageType || '–')}</span>
          <span><strong>Reichweite:</strong> ${this._esc(ranged.range || '–')}</span>
        </div>
        ${ranged.traits ? `<div class="combat-equip-traits">${this._esc(ranged.traits)}</div>` : ''}
        <div class="combat-ammo-row">
          <div class="stepper-controls">
            <button class="stepper-btn" id="dgCombatAmmoMinus" aria-label="Munition verringern">−</button>
            <span class="stepper-val" id="dgCombatAmmoValue">${ammo}</span>
            ${mag ? `<span class="combat-ammo-sep"> / ${mag}</span>` : ''}
            <button class="stepper-btn" id="dgCombatAmmoPlus" aria-label="Munition erhöhen">+</button>
          </div>
        </div>
      </div>`;
    }

    if (melee) {
      inner += `<div class="combat-equip-item">
        <div class="combat-equip-header">
          <span class="combat-equip-icon">⚔️</span>
          <span class="combat-equip-name">${this._esc(melee.name)}</span>
          <span class="combat-equip-tag">Nahkampf</span>
        </div>
        <div class="combat-equip-stats">
          <span><strong>Schaden:</strong> ${this._esc(melee.damage || '–')}</span>
          <span><strong>Art:</strong> ${this._esc(melee.damageType || '–')}</span>
        </div>
        ${melee.traits ? `<div class="combat-equip-traits">${this._esc(melee.traits)}</div>` : ''}
      </div>`;
    }

    if (!inner) {
      inner = `<p class="combat-equip-empty">Keine Bewaffnung aktiv — bitte im Ausrüstungs-Tab aktivieren.</p>`;
    }

    return `<div class="combat-block">
      <h3 class="combat-block-title">Aktive Bewaffnung</h3>
      <div class="combat-equip-grid">${inner}</div>
    </div>`;
  },

  // ── Block 3: Fertigkeiten-Kurzreferenz ───────────────────────────────
  _KEY_SKILLS: ['Ausweichen', 'Schusswaffen', 'Nahkampfwaffen'],

  // Präfix- statt Exakt-Vergleich: die Standard-Fertigkeitsnamen tragen
  // einen Prozent-Suffix ("Ausweichen (30%)", siehe manifest.js
  // defaultSkills) — und die Liste ist frei umbenennbar, ein Exakt-Match
  // würde bei jeder Anpassung des Suffix ins Leere laufen.
  _findSkill(character, term) {
    const skills = character.systemData.skills || [];
    const t = term.toLowerCase();
    return skills.find(s => !s._deleted && (s.name || '').toLowerCase().startsWith(t));
  },

  _renderSkillsRefBlock(character) {
    const rows = this._KEY_SKILLS.map(term => {
      const skill = this._findSkill(character, term);
      return `<div class="dg-skill-row dg-skill-row-view">
        <span class="dg-skill-name">${this._esc(skill ? skill.name : term)}</span>
        <span class="dg-skill-value">${skill ? (skill.value ?? 0) : '–'}</span>
      </div>`;
    }).join('');

    return `<div class="combat-block">
      <h3 class="combat-block-title">Fertigkeiten</h3>
      <div class="dg-skill-columns"><div class="dg-skill-col">${rows}</div></div>
    </div>`;
  },

  render(character) {
    return `<div class="combat-page">
      ${this._renderResourcesBlock(character)}
      ${this._renderArmorBlock(character)}
      ${this._renderWeaponsBlock(character)}
      ${this._renderSkillsRefBlock(character)}
    </div>`;
  },

  save(character) { /* Werte werden direkt bei Änderung gespeichert, siehe attachListeners() */ },

  attachListeners() {
    const char = window.currentCharacter;

    DgStatsPage._attachPoolListeners(char);

    const eq     = char.equipment || [];
    const ranged = eq.find(e => (e.type === 'ranged' || e.type === 'weapon') && e.equipped && !e._deleted);
    if (ranged) {
      CoreWidgets.attachCounter({
        valueId: 'dgCombatAmmoValue', minusId: 'dgCombatAmmoMinus', plusId: 'dgCombatAmmoPlus',
        value: parseInt(ranged.ammo) || 0, min: 0, max: parseInt(ranged.magazine) || undefined,
      }, newValue => {
        ranged.ammo = newValue;
        Storage.saveCharacter(char);
      });
    }
  },
};
